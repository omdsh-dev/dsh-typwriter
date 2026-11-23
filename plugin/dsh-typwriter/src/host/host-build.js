// 宿主半片的"版本"指纹：把宿主源码与浏览器桥的大小、修改时间揉成一串。
//
// 宿主代码只在 DSH 加载插件时读一次，之后磁盘上的文件再怎么改，运行中的还是旧的；
// 而前端资源（app/、shim.js）是每次请求现读的。于是更新插件后会出现"界面是新的、宿主
// 是旧的"——新入口点了报「未实现的通道」，用户只看到点了没反应。
//
// 加载时记下指纹，每次服务首页时重新算一遍：不一样就把 hostStale 告诉界面去提示。
import { readdirSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** 算进指纹的目录：宿主各模块 + 浏览器桥 */
const DIRS = [HERE, join(HERE, '..', 'browser')];
const isSource = (name) => /\.(js|mjs)$/.test(name);

function digest(parts) {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

function stamp(name, st) {
  return `${name}:${st.size}:${Math.round(st.mtimeMs)}`;
}

/** 加载那一刻的指纹（同步：模块求值时就算好，此时磁盘上就是正在运行的这版） */
const LOADED = digest(
  DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter(isSource)
      .sort()
      .map((name) => {
        try {
          return stamp(name, statSync(join(dir, name)));
        } catch {
          return `${name}:missing`;
        }
      })
  )
);

/** 正在运行的宿主代码的指纹 */
export function hostBuild() {
  return LOADED;
}

/** 磁盘上的宿主代码是否已经和正在运行的不一样 */
export async function hostStale() {
  try {
    const parts = [];
    for (const dir of DIRS) {
      const names = (await readdir(dir).catch(() => [])).filter(isSource).sort();
      for (const name of names) {
        const st = await stat(join(dir, name)).catch(() => null);
        parts.push(st ? stamp(name, st) : `${name}:missing`);
      }
    }
    return digest(parts) !== LOADED;
  } catch {
    // 算不出来就当没过期：宁可少提示，也不误报
    return false;
  }
}
