import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import { db, upsertTrack } from './db.js';
import { config } from './config.js';

const AUDIO_EXT = new Set([
  '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga',
  '.wav', '.wma', '.opus', '.mp4', '.m4b',
]);

const hashId = (s) => crypto.createHash('sha1').update(s).digest('hex');

// P1 H-3：模块级扫描锁，避免 watcher 与 POST /api/scan 并发扫描
// 交错执行 DELETE + upsert 造成库被反复清空。
let scanningPromise = null;

async function doScan() {
  const dir = config.musicDir;
  fs.mkdirSync(dir, { recursive: true });

  const files = [];
  async function walk(d) {
    let entries;
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) files.push(p);
    }
  }
  await walk(dir);

  // 先收集全部曲目信息（I/O 密集），再进事务写库，缩短事务持有时间
  const collected = [];
  for (const file of files) {
    let meta = {};
    try {
      meta = await parseFile(file, { duration: true });
    } catch {
      // 元数据损坏也照样入库，保证可播放
    }
    let size = 0;
    try {
      size = (await fsp.stat(file)).size; // P1 H-3：文件扫描后被删不应让整次扫描失败
    } catch {
      continue; // 文件已不存在，跳过
    }
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const common = meta.common || {};
    const format = meta.format || {};
    const picture = Array.isArray(common.picture) ? common.picture[0] : null;
    let cover = null;
    if (picture?.data) {
      cover = `data:${picture.format || 'image/jpeg'};base64,${picture.data.toString('base64')}`;
    }
    collected.push({
      id: hashId('local:' + rel),
      rel_path: rel,
      title: common.title || path.basename(file, path.extname(file)),
      artist: (common.artists || (common.artist ? [common.artist] : [])).join(', ') || '未知艺术家',
      album: common.album || '未知专辑',
      duration: format.duration || null,
      size,
      mime: format.codec || path.extname(file).slice(1),
      cover,
      extra: JSON.stringify({ year: common.year, genre: common.genre, track: common.track }),
    });
  }

  // P1 H-3：事务内完成"写新 + 删旧"，任一步失败则回滚，绝不先清空库。
  db.exec('BEGIN IMMEDIATE');
  try {
    const ids = collected.map((t) => t.id);
    for (const t of collected) {
      upsertTrack({ ...t, source: 'local', updated_at: Date.now() });
    }
    // 删除本次未出现的旧本地记录（而非先全删）
    const existing = db.prepare("SELECT id FROM tracks WHERE source = 'local'").all();
    const removeStmt = db.prepare('DELETE FROM tracks WHERE id = ?');
    for (const row of existing) {
      if (!ids.includes(row.id)) removeStmt.run(row.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { total: collected.length };
}

// P1 H-3：并发调用复用同一 Promise；结束后自动释放锁
export function scanLibrary() {
  if (!scanningPromise) {
    scanningPromise = doScan().finally(() => { scanningPromise = null; });
  }
  return scanningPromise;
}

export function localTrackPath(relPath) {
  const target = path.resolve(config.musicDir, relPath);
  const root = path.resolve(config.musicDir);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error('非法路径');
  }
  return target;
}
