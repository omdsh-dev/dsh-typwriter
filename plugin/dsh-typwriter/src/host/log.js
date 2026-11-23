// 插件宿主日志：$DSH_HOME/typwriter/host.log
// 桌面端的宿主 stdout 看不见（GUI 启动，无控制台），所以把关键事件写文件，
// 出问题时能直接定位：LSP 启停/退出、请求排队、RPC 报错、预览页准备结果。
//
// 异步、串行落盘：宿主与整个 DSH 共用一条事件循环，每行日志一次 statSync + appendFileSync
// 看着不起眼，但文件监视的每一批、SSE 的每次连断、前端的每条 debug 都走这里。
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_BYTES = 512 * 1024;

/**
 * @param {string} dir 日志目录（通常是 $DSH_HOME/typwriter）
 */
export function createLogger(dir) {
  const file = join(dir, 'host.log');
  let ready = false;
  /** 文件大小自己记账：只有第一次才去问文件系统 */
  let size = -1;
  /** 串行队列：每行追加到上一行写完之后 */
  let chain = Promise.resolve();

  const rotateIfNeeded = async () => {
    if (size < 0) size = await stat(file).then((st) => st.size, () => 0);
    if (size <= MAX_BYTES) return;
    await rename(file, `${file}.1`).catch(() => {
      /* 轮转失败也照写 */
    });
    size = 0;
  };

  return {
    file,
    /** @param {string} line */
    write(line) {
      const text = `${new Date().toISOString()} ${line}\n`;
      chain = chain
        .then(async () => {
          if (!ready) {
            await mkdir(dir, { recursive: true });
            ready = true;
          }
          await rotateIfNeeded();
          await appendFile(file, text);
          size += Buffer.byteLength(text);
        })
        .catch(() => {
          /* 目录建不出来或写不进去：静默放弃，不影响功能 */
        });
    }
  };
}
