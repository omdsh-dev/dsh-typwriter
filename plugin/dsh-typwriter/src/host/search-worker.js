// 全文搜索的工作线程。
//
// 用户输入的正则在这里跑：正则回溯没有上限，一个写得不好的模式（比如 (a+)+$）能在主线程上
// 把整个 DSH 宿主卡死——宿主与 DSH 共用一条事件循环。放进线程后，主线程只等一个有超时的结果。
import { readFile, stat } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';

const MAX_MATCHES = 2000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_LINE_CHARS = 400;

const { files, query, regex, caseSensitive } = workerData;
void search(files, query, regex, caseSensitive).then(
  (result) => parentPort.postMessage({ ok: true, result }),
  (e) => parentPort.postMessage({ ok: false, error: String(e?.message || e) })
);

async function search(files, query, regex, caseSensitive) {
  let test;
  if (regex) {
    try {
      const re = new RegExp(query, caseSensitive ? '' : 'i');
      test = (line) => re.test(line);
    } catch {
      return { results: [], truncated: false, error: 'invalid pattern' };
    }
  } else {
    const needle = caseSensitive ? query : query.toLowerCase();
    test = (line) => (caseSensitive ? line.includes(needle) : line.toLowerCase().includes(needle));
  }
  const results = [];
  let total = 0;
  for (const f of files) {
    // 先看大小再读：大文件不读进来
    const st = await stat(f.path).catch(() => null);
    if (!st || !st.isFile() || st.size > MAX_FILE_BYTES) continue;
    const text = await readFile(f.path, 'utf8').catch(() => null);
    if (text === null || text.length > MAX_FILE_BYTES) continue;
    const lines = text.split(/\r?\n/);
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      if (!test(lines[i])) continue;
      total++;
      if (matches.length < 200) matches.push({ line: i + 1, text: lines[i].slice(0, MAX_LINE_CHARS) });
    }
    if (matches.length) results.push({ file: f.path, rel: f.relPath, matches });
    if (total >= MAX_MATCHES) break;
  }
  return { results, truncated: total >= MAX_MATCHES, total };
}
