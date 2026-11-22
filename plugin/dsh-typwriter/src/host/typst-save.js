// 保存 .typ 之后，把磁盘上的 PDF 重新生成一次。
//
// 为什么需要：实时预览是 tinymist 的**内存流**，保存源码并不会写任何文件；而插件里
// 编译槽被「实时」占着，Typst 的导出入口又依赖原生的 pickExportTarget（插件没实现），
// 于是文件夹里的 PDF 会一直停在旧版本 —— 预览看着是新的，文件却是旧的。
//
// 这里在 fs:write 之后补一次 `tinymist compile`（与 buildTypstCommand 同一套输出约定：
// output/<main 名>.pdf + output/<main 名>.log），防抖合并连续保存，失败只记日志。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { delimiter, join, relative, sep } from 'node:path';

const DEBOUNCE_MS = 1200;

/** path 是否在 root 之内（大小写与分隔符交给 path.relative 判断） */
function inside(root, path) {
  const rel = relative(root, path);
  return !!rel && !rel.startsWith('..') && !rel.startsWith(sep);
}

export class TypstSaveCompiler {
  constructor({ binDir, logger, store }) {
    this.binDir = binDir;
    this.logger = logger;
    this.store = store;
    /** root -> timer */
    this.timers = new Map();
    /** root -> { running, again } */
    this.jobs = new Map();
  }

  /** 编辑器保存了一个文件：只有工作区里的 .typ 需要重新出 PDF */
  touch(path) {
    if (typeof path !== 'string' || !/\.typ$/i.test(path)) return;
    void (async () => {
      const root = await this.store?.getActiveRoot?.();
      if (!root || !inside(root, path)) return;
      const prev = this.timers.get(root);
      if (prev) clearTimeout(prev);
      this.timers.set(
        root,
        setTimeout(() => {
          this.timers.delete(root);
          void this.#compile(root, path);
        }, DEBOUNCE_MS)
      );
    })();
  }

  /** 同一时刻一个目录只跑一次编译；期间再来的保存合并成「跑完再来一次」 */
  async #compile(root, path) {
    const job = this.jobs.get(root);
    if (job?.running) {
      job.again = true;
      return;
    }
    const state = job ?? { running: false, again: false };
    this.jobs.set(root, state);
    state.running = true;
    try {
      const main = await this.#mainOf(root, path);
      if (!main) return;
      const stem = main.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '');
      const outDir = join(root, 'output');
      await mkdir(outDir, { recursive: true });
      const out = join(outDir, `${stem}.pdf`);
      const log = join(outDir, `${stem}.log`);
      const started = Date.now();
      const code = await this.#run(root, main, out, log);
      this.logger?.write?.(`[compile-on-save] tinymist compile ${main} -> output/${stem}.pdf exit=${code} ${Date.now() - started}ms`);
    } catch (e) {
      this.logger?.write?.(`[compile-on-save] failed: ${e?.stack || e}`);
    } finally {
      state.running = false;
      if (state.again) {
        state.again = false;
        void this.#compile(root, path);
      }
    }
  }

  /** 主文件来自项目配置（.texpile/config.json 的 main），否则就用刚保存的这个 .typ */
  async #mainOf(root, saved) {
    try {
      const raw = await readFile(join(root, '.texpile', 'config.json'), 'utf8');
      const cfg = JSON.parse(raw);
      if (typeof cfg?.main === 'string' && /\.typ$/i.test(cfg.main)) return cfg.main;
    } catch {
      /* 没有项目配置就走兜底 */
    }
    return saved.slice(root.length + 1) || null;
  }

  #run(root, main, out, log) {
    const exe = join(this.binDir, process.platform === 'win32' ? 'tinymist.exe' : 'tinymist');
    const command = existsSync(exe) ? exe : 'tinymist';
    const env = { ...process.env };
    // 与终端一致：bin/ 前置进 PATH，tinymist 内部再调 typst 时也能找到
    env.PATH = [this.binDir, env.PATH || env.Path || ''].filter(Boolean).join(delimiter);
    delete env.Path;
    return new Promise((resolve) => {
      let out$ = '';
      const child = spawn(command, ['compile', '--root', '.', main, out], { cwd: root, env, windowsHide: true });
      child.stdout?.on('data', (c) => (out$ += c));
      child.stderr?.on('data', (c) => (out$ += c));
      child.on('error', (e) => {
        this.logger?.write?.(`[compile-on-save] spawn failed: ${e?.message || e}`);
        resolve(-1);
      });
      child.on('close', async (code) => {
        try {
          const { writeFile } = await import('node:fs/promises');
          await writeFile(log, out$, 'utf8');
        } catch {
          /* 日志写不了不影响出片 */
        }
        resolve(code ?? -1);
      });
    });
  }
}
