// 文件系统算子：实现 Texpile 需要的 fs:* 通道，直接走 node:fs（插件宿主就是 Node 进程）。
// 返回结构对齐 apps/texpile-editor/src/lib/workspace/fileSystem.ts：
//   TexFile = {name, path, relPath}   TreeEntry = {name, path, type:'dir'|'file', children?}
//   SourceRead = {text, encoding}
import { mkdir, open, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { dirname, join, relative, sep } from 'node:path';

// scanTexFiles 不传 exts 时的默认集合
const DEFAULT_EXTS = [
  '.typ', '.tex', '.md', '.bib', '.bbl', '.cls', '.sty', '.bst',
  '.yaml', '.yml', '.toml', '.json', '.csv', '.txt', '.cff', '.lua'
];

// 这些目录永远不进文件树
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', '.texpile', '.workbuddy',
  '__pycache__', '.venv', '.idea', '.vscode'
]);

const MAX_FILES = 20000;
const MAX_DEPTH = 24;

const toPosix = (p) => p.split(sep).join('/');

function parseExts(exts) {
  if (!exts) return DEFAULT_EXTS;
  const list = Array.isArray(exts) ? exts : String(exts).split(',');
  const out = list
    .map((e) => {
      const t = String(e).trim().toLowerCase();
      if (!t) return null;
      return t.startsWith('.') ? t : `.${t}`;
    })
    .filter(Boolean);
  return out.length ? out : DEFAULT_EXTS;
}

/** 一次遍历同时产出 children（整棵树）与 files（文档清单） */
async function scanInto(root, dir, exts, children, files, depth) {
  if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => {
    const ad = a.isDirectory() ? 0 : 1;
    const bd = b.isDirectory() ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name, 'zh-Hans');
  });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      const node = { name: e.name, path: full, type: 'dir', children: [] };
      children.push(node);
      await scanInto(root, full, exts, node.children, files, depth + 1);
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf('.');
      const ext = dot > 0 ? e.name.slice(dot).toLowerCase() : '';
      children.push({ name: e.name, path: full, type: 'file' });
      if (ext && exts.includes(ext)) {
        files.push({ name: e.name, path: full, relPath: toPosix(relative(root, full)) });
      }
    }
  }
}

export async function fsTreeScan(root, exts) {
  const children = [];
  const files = [];
  await scanInto(root, root, parseExts(exts), children, files, 0);
  return { root, children, files };
}

export async function fsScan(root, exts) {
  const { files } = await fsTreeScan(root, exts);
  return { root, files };
}

export async function fsTree(root) {
  const { root: r, children } = await fsTreeScan(root, DEFAULT_EXTS);
  return { root: r, children };
}

/** 编码嗅探：Texpile 只写 UTF-8，其它编码打开为只读 */
function detectEncoding(buf) {
  if (buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le';
    if (buf[0] === 0xfe && buf[1] === 0xff) return 'utf16be';
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8bom';
  const probe = buf.subarray(0, 8192);
  for (let i = 0; i < probe.length; i++) if (probe[i] === 0) return 'binary';
  return 'utf8';
}

export async function fsRead(path) {
  const buf = await readFile(path);
  const encoding = detectEncoding(buf);
  if (encoding === 'utf16le') return { content: buf.toString('utf16le'), encoding };
  if (encoding === 'utf8bom') return { content: buf.subarray(3).toString('utf8'), encoding };
  if (encoding === 'binary') return { content: '', encoding };
  return { content: buf.toString('utf8'), encoding };
}

export async function fsWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
  return { ok: true };
}

export async function fsWriteBinary(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  await writeFile(path, buf);
  return { ok: true };
}

export async function fsStat(path) {
  try {
    const st = await stat(path);
    return { exists: true, mtimeMs: st.mtimeMs, size: st.size, isDirectory: st.isDirectory() };
  } catch {
    return { exists: false, mtimeMs: 0, size: 0, isDirectory: false };
  }
}

export async function fsProbe(path) {
  const st = await stat(path).catch(() => null);
  if (!st || !st.isFile()) return { size: 0, binary: true };
  const buf = await readHead(path, st.size);
  return { size: st.size, binary: detectEncoding(buf) === 'binary' };
}

/** 判断"是不是二进制"只需要看文件头（detectEncoding 只看前 8KB）：大 PDF、大图片整份读进来是白读 */
const PROBE_HEAD_BYTES = 64 * 1024;

async function readHead(path, size) {
  if (size <= PROBE_HEAD_BYTES) return readFile(path).catch(() => Buffer.alloc(0));
  const handle = await open(path, 'r').catch(() => null);
  if (!handle) return Buffer.alloc(0);
  try {
    const buf = Buffer.alloc(PROBE_HEAD_BYTES);
    const { bytesRead } = await handle.read(buf, 0, PROBE_HEAD_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } catch {
    return Buffer.alloc(0);
  } finally {
    await handle.close().catch(() => {});
  }
}

export async function fsRealRelative(root, rel) {
  try {
    const real = await realpath(join(root, rel));
    const realRoot = await realpath(root);
    const r = relative(realRoot, real);
    return r.startsWith('..') ? null : r;
  } catch {
    return null;
  }
}

/** fsOp：create / delete / rename / copy */
export async function fsOp(body = {}) {
  const action = body.action;
  try {
    if (action === 'create') {
      const p = String(body.path || '');
      if (body.type === 'dir') {
        await mkdir(p, { recursive: true });
      } else {
        await mkdir(dirname(p), { recursive: true });
        await writeFile(p, String(body.content ?? ''), 'utf8');
      }
      return { ok: true };
    }
    if (action === 'delete') {
      await rm(String(body.path || ''), { recursive: true, force: true });
      return { ok: true };
    }
    if (action === 'rename') {
      await mkdir(dirname(String(body.to || '')), { recursive: true });
      await rename(String(body.from || ''), String(body.to || ''));
      return { ok: true };
    }
    if (action === 'copy') {
      const { cp } = await import('node:fs/promises');
      await cp(String(body.from || ''), String(body.to || ''), { recursive: true });
      return { ok: true };
    }
    return { ok: false, error: `unsupported fs op: ${action}` };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** fsTrash：直接删（不做系统回收站），保留接口形状 */
export async function fsTrash(body = {}) {
  try {
    await rm(String(body.path || ''), { recursive: true, force: true });
    return { backup: null, recycled: false, kept: false };
  } catch (e) {
    return { backup: null, recycled: false, error: String(e?.message || e) };
  }
}

export async function fsPurgeUndo() {
  return { ok: true };
}

/** 一次搜索最长等多久：正则回溯没有上限，超时就放弃并如实报告 */
const SEARCH_TIMEOUT_MS = 5000;

const searchFailed = (error) => ({ results: [], truncated: false, total: 0, error });

/** fsSearch：匹配在 search-worker.js 里跑，主线程不会被一个坏正则卡住 */
export async function fsSearch(root, q, regex, caseSensitive) {
  const query = String(q ?? '');
  if (!query) return { results: [], truncated: false, total: 0 };
  const { files } = await fsScan(root);
  let worker;
  try {
    worker = new Worker(new URL('./search-worker.js', import.meta.url), {
      workerData: { files: files.map((f) => ({ path: f.path, relPath: f.relPath })), query, regex: !!regex, caseSensitive: !!caseSensitive }
    });
  } catch {
    return searchFailed('search-unavailable');
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(value);
    };
    const timer = setTimeout(() => done(searchFailed('search-timeout')), SEARCH_TIMEOUT_MS);
    worker.once('message', (m) => done(m && m.ok ? m.result : searchFailed('search-failed')));
    worker.once('error', () => done(searchFailed('search-failed')));
    worker.once('exit', () => done(searchFailed('search-failed')));
  });
}

/** fsFormatLatex：不实现 LaTeX 格式化，原样返回，避免编辑器报错 */
export async function fsFormatLatex(_path, text) {
  return { formatted: String(text ?? '') };
}
