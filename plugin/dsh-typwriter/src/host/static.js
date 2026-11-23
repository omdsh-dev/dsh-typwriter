// 静态服务 + 原始字节路由。
// - /typwriter/            → app/index.html（注入 bootstrap 与 shim）
// - /typwriter/app/*       → 构建产物
// - /typwriter/api/file    → 取代 texfile://（图片、PDF），支持 Range
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.gz': 'application/gzip',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

const typeOf = (p) => TYPES[extname(p).toLowerCase()] || 'application/octet-stream';

/** 判断 child 是否在 root 之内（防止 ../ 逃逸） */
export function inside(root, child) {
  if (!root) return false;
  const r = resolve(root);
  const c = resolve(child);
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}

export function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text)
  });
  res.end(text);
}

/** /typwriter/api/file —— 渲染端拿它当 <img src>、pdf.js 的 src、fetch 的字节来源 */
export async function serveFileBytes(req, res, { allowedRoots }) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.searchParams.get('path');
  if (!path) return sendJson(res, 400, { error: 'missing path' });

  // 安全围栏：只允许已打开工作区之内的文件
  if (!allowedRoots().some((root) => inside(root, path))) {
    return sendJson(res, 403, { error: 'path outside the open workspace' });
  }

  const st = await stat(path).catch(() => null);
  if (!st || !st.isFile()) return sendJson(res, 404, { error: 'not found' });

  const etag = `"${Math.round(st.mtimeMs)}-${st.size}"`;
  const inm = req.headers['if-none-match'];
  const range = req.headers.range;
  const baseHeaders = {
    'content-type': typeOf(path),
    // CORS：同源本不需要，但 pdf.js 在 worker 里可能以 no-cors 之外的形态取
    'access-control-allow-origin': '*',
    'accept-ranges': 'bytes',
    etag,
    // no-cache（不是 no-store）：允许 304，PDF 重载才不会全量重下
    'cache-control': 'no-cache'
  };

  if (inm && inm === etag && !range) {
    res.writeHead(304, { ...baseHeaders, 'content-length': '0' });
    return res.end();
  }

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] === '' ? null : Number(m[1]);
      let end = m[2] === '' ? null : Number(m[2]);
      if (start === null && end !== null) {
        // bytes=-N：最后 N 个字节
        start = Math.max(0, st.size - end);
        end = st.size - 1;
      } else if (start !== null && end === null) {
        end = st.size - 1;
      }
      if (start !== null && end !== null && start <= end && start < st.size) {
        end = Math.min(end, st.size - 1);
        res.writeHead(206, {
          ...baseHeaders,
          'content-range': `bytes ${start}-${end}/${st.size}`,
          'content-length': String(end - start + 1)
        });
        if (req.method === 'HEAD') return res.end();
        createReadStream(path, { start, end }).pipe(res);
        return;
      }
      res.writeHead(416, { ...baseHeaders, 'content-range': `bytes */${st.size}` });
      return res.end();
    }
  }

  res.writeHead(200, { ...baseHeaders, 'content-length': String(st.size) });
  if (req.method === 'HEAD') return res.end();
  createReadStream(path).pipe(res);
}

/** 把 bootstrap 与 shim 注入 index.html（顺序不能错） */
export function injectIndex(html, { bootstrap, base }) {
  const boot = `<script>window.__TEXPILE_BOOTSTRAP__=${JSON.stringify(bootstrap).replace(/</g, '\\u003c')};</script>`;
  const shim = `<script src="${base}shim.js"></script>`;
  // 插在第一个 <script> 之前：theme-init 之后、应用模块之前
  const at = html.indexOf('<script');
  if (at < 0) return html.replace('</head>', `${boot}${shim}</head>`);
  return html.slice(0, at) + boot + shim + html.slice(at);
}

/** 构建工具带哈希的产物（assets/xxx-1QAgkK4.js）：内容变了文件名就变，可以放心长缓存 */
const HASHED = /-[\w-]{8}(\.[\w]+)+$/;
/** 没带哈希的文件（index.html、shim.js、theme-init.js）：每次拿 ETag 来问，没变就 304 */
const NO_CACHE = 'no-cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * 送一个静态文件。带哈希的产物长缓存；其余按 ETag 协商，304 时不重传正文。
 * 切回写作台要重新取九十多个文件，没有缓存头就等于每次整份重下。
 */
export async function serveStatic(req, res, filePath) {
  const st = await stat(filePath).catch(() => null);
  if (!st || !st.isFile()) {
    sendJson(res, 404, { error: 'not found' });
    return false;
  }
  const etag = `"${Math.round(st.mtimeMs)}-${st.size}"`;
  const headers = {
    'content-type': typeOf(filePath),
    'cache-control': HASHED.test(filePath) ? IMMUTABLE : NO_CACHE,
    etag
  };
  if (req?.headers?.['if-none-match'] === etag) {
    res.writeHead(304, { ...headers, 'content-length': '0' });
    res.end();
    return true;
  }
  res.writeHead(200, { ...headers, 'content-length': String(st.size) });
  if (req?.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}

export async function readIndex(appDir) {
  const html = await readFile(join(appDir, 'index.html'), 'utf8');
  return html;
}

/** 把 URL 路径安全地映射进 appDir */
export function appFilePath(appDir, relPath) {
  const cleaned = normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const full = join(appDir, cleaned);
  return inside(appDir, full) ? full : null;
}
