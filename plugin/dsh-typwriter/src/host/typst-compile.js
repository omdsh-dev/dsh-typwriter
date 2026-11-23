// 显式出片：用户按了保存（保存命令 / Ctrl+S）之后，把磁盘上的 PDF 重新生成一次。
//
// 为什么需要：实时预览是 tinymist 的**内存流**，保存源码并不会写任何文件，文件夹里的
// PDF 会一直停在旧版本——预览看着是新的，文件却是旧的。
//
// 为什么只在显式保存时做：自动保存每停笔 1.5 秒就写一次盘，回回起进程整篇编译既费电
// 又和预览重复。Word 的「保存」就是用户的出片时机，这里和它放在同一层级；结果回给
// 界面显示，失败不再只进日志。
//
// 出片路径跟着项目配置走：.texpile/config.json 的 outputs.pdf，没配才回落到
// output/<main 名>.pdf（与 buildTypstCommand 同一套约定）。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, relative } from 'node:path';

/** 一次编译最长等多久（大论文 + 冷启动 + 杀毒软件首扫）；超时按失败处理 */
const TIMEOUT_MS = 180_000;

/** 报错正文只带末尾几行，够用户看出是哪一处 */
function detailOf(output) {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  return lines.slice(-14).join('\n').slice(0, 1200);
}

export class TypstProjectCompiler {
  constructor({ binDir, logger, store }) {
    this.binDir = binDir;
    this.logger = logger;
    this.store = store;
    /** root -> 最近一次出片的 promise（同一目录排队，各拿各的结果） */
    this.jobs = new Map();
  }

  /**
   * 出片并返回结果。同一目录同一时刻只跑一次：进行中又来了保存请求，就排在其后。
   * @param {string} root 工作区根目录
   * @param {{ saved?: string }} [opts] 触发这次出片的已保存文件（项目没配 main 时用它兜底）
   */
  compile(root, { saved } = {}) {
    const prev = this.jobs.get(root) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(() => this.#run(root, saved))
      .catch((e) => ({ ok: false, error: 'compile-failed', detail: String(e?.message || e), ms: 0 }));
    this.jobs.set(root, next);
    void next.finally(() => {
      if (this.jobs.get(root) === next) this.jobs.delete(root);
    });
    return next;
  }

  async #run(root, saved) {
    const started = Date.now();
    const cfg = await this.#config(root, saved);
    // 当前工作区没有 Typst 主文件：没有 PDF 可出，界面据此安静跳过
    if (!cfg.main) return { ok: false, error: 'no-main', ms: Date.now() - started };
    const stem = cfg.main.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '');
    const out = cfg.pdf ? (isAbsolute(cfg.pdf) ? cfg.pdf : join(root, cfg.pdf)) : join(root, 'output', `${stem}.pdf`);
    const outDir = dirname(out);
    await mkdir(outDir, { recursive: true });
    const { code, output, spawned } = await this.#exec(root, cfg.main, out);
    const ms = Date.now() - started;
    try {
      await writeFile(join(outDir, `${stem}.log`), output, 'utf8');
    } catch {
      /* 日志写不了不影响出片 */
    }
    const rel = (p) => (isAbsolute(p) ? p.slice(root.length + 1) : p).replace(/\\/g, '/');
    this.logger?.write?.(`[typst-compile] tinymist compile ${cfg.main} -> ${rel(out)} exit=${code} ${ms}ms`);
    if (code === 0) return { ok: true, pdf: out, rel: rel(out), main: cfg.main, ms };
    if (!spawned) return { ok: false, error: 'unsupported', detail: 'tinymist 未安装', ms };
    return { ok: false, error: 'compile-failed', detail: detailOf(output), ms };
  }

  /** 主文件与出片路径：项目配置优先，读不到就用刚保存的这个 .typ + 应用默认的 output/ */
  async #config(root, saved) {
    let cfg = {};
    try {
      cfg = JSON.parse(await readFile(join(root, '.texpile', 'config.json'), 'utf8')) ?? {};
    } catch {
      /* 没有项目配置就走兜底 */
    }
    const fallback = typeof saved === 'string' && /\.typ$/i.test(saved) ? relative(root, saved).replace(/\\/g, '/') : '';
    const mainRaw = typeof cfg?.main === 'string' && /\.typ$/i.test(cfg.main) ? cfg.main : fallback;
    // main 可以写成绝对路径：tinymist 在 root 下跑，交给它的一律是 root 相对路径
    const main = mainRaw && isAbsolute(mainRaw) ? relative(root, mainRaw).replace(/\\/g, '/') : mainRaw;
    const pdf = typeof cfg?.outputs?.pdf === 'string' && cfg.outputs.pdf.trim() ? cfg.outputs.pdf.trim() : null;
    return { main, pdf };
  }

  #exec(root, main, out) {
    const exe = join(this.binDir, process.platform === 'win32' ? 'tinymist.exe' : 'tinymist');
    const command = existsSync(exe) ? exe : 'tinymist';
    const env = { ...process.env };
    // 与终端一致：bin/ 前置进 PATH，tinymist 内部再调 typst 时也能找到
    env.PATH = [this.binDir, env.PATH || env.Path || ''].filter(Boolean).join(delimiter);
    delete env.Path;
    return new Promise((resolve) => {
      let output = '';
      let spawned = false;
      let settled = false;
      const done = (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code, output, spawned });
      };
      let child;
      try {
        child = spawn(command, ['compile', '--root', '.', main, out], { cwd: root, env, windowsHide: true });
      } catch (e) {
        this.logger?.write?.(`[typst-compile] spawn failed: ${e?.message || e}`);
        done(-1);
        return;
      }
      const timer = setTimeout(() => {
        this.logger?.write?.(`[typst-compile] timed out after ${TIMEOUT_MS} ms: ${main}`);
        child.kill();
        done(-1);
      }, TIMEOUT_MS);
      child.stdout?.on('data', (c) => (output += c));
      child.stderr?.on('data', (c) => (output += c));
      child.on('error', (e) => {
        this.logger?.write?.(`[typst-compile] spawn failed: ${e?.message || e}`);
        done(-1);
      });
      child.on('spawn', () => {
        spawned = true;
      });
      child.on('close', (code) => done(code ?? -1));
    });
  }
}
