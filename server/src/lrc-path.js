// 歌词文件统一存放路径规范化：所有 .lrc 集中到 <musicDir>/lyrics/
// 文件名带音频路径短哈希，避免不同目录下的同名歌曲互相覆盖歌词。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

export const LYRICS_DIR = path.join(config.musicDir, 'lyrics');

export function ensureLyricsDir() {
  fs.mkdirSync(LYRICS_DIR, { recursive: true });
}

const shortHash = (p) =>
  crypto.createHash('sha1').update(path.resolve(p)).digest('hex').slice(0, 8);

// 规范路径：曲库/lyrics/<歌名>.<路径哈希>.lrc
export function lrcPathFor(audioPath) {
  const base = path.basename(audioPath, path.extname(audioPath));
  return path.join(LYRICS_DIR, `${base}.${shortHash(audioPath)}.lrc`);
}

// 旧规范：曲库/lyrics/<歌名>.lrc（历史文件，仅作兼容回退）
export function legacyBasenameLrcPathFor(audioPath) {
  return path.join(LYRICS_DIR,
    path.basename(audioPath, path.extname(audioPath)) + '.lrc');
}

// 更旧：音频同目录（兼容性回退）
export function legacyLrcPathFor(audioPath) {
  return path.join(path.dirname(audioPath),
    path.basename(audioPath, path.extname(audioPath)) + '.lrc');
}

// 优先新规范，其次历史集中目录，最后音频同目录
export function findLrcPath(audioPath) {
  const candidates = [
    lrcPathFor(audioPath),
    legacyBasenameLrcPathFor(audioPath),
    legacyLrcPathFor(audioPath),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}
