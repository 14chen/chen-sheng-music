// 自动歌词抓取：读音频元数据 → LRCLIB 搜索 → 写同名 .lrc。
// 供 watcher（新文件导入时自动调用）与手动脚本共用。
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';

const UA = { 'User-Agent': 'ChengShengMusic/1.0 (self-hosted lyrics)' };
const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga',
  '.wav', '.wma', '.opus', '.mp4', '.m4b']);

// 未匹配记录：避免每次扫描都去请求 LRCLIB（进程内，重启后重试一次）
const missCache = new Map(); // audioPath -> timestamp

function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

import { lrcPathFor as normalizedLrcPath, findLrcPath, ensureLyricsDir } from './lrc-path.js';

// 统一走 lyrics/ 目录（保留导出名兼容调用方）
export function lrcPathFor(audioPath) {
  return normalizedLrcPath(audioPath);
}
export { findLrcPath };

function fromFilename(base) {
  const m = base.split(/\s+-\s+/);
  if (m.length >= 2) return { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() };
  return { artist: '', title: base.trim() };
}

async function searchLrclib(title, artist, duration) {
  const q = new URLSearchParams({ track_name: title });
  if (artist) q.set('artist_name', artist);
  if (duration) q.set('duration', String(Math.round(duration)));
  const res = await fetch(`https://lrclib.net/api/search?${q}`, {
    headers: UA, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const list = await res.json();
  if (!Array.isArray(list) || !list.length) return null;
  const nt = normalize(title);
  const na = normalize(artist);
  const best = list.find((x) => normalize(x.trackName) === nt) ||
    list.find((x) => normalize(x.trackName).includes(nt) && (!na || normalize(x.artistName).includes(na))) ||
    list[0];
  const lrc = best.syncedLyrics || best.plainLyrics || null;
  return lrc ? { lrc, synced: Boolean(best.syncedLyrics), source: best.trackName } : null;
}

/**
 * 确保单个音频文件有歌词。返回：
 *   { status: 'exists' }        已有 .lrc
 *   { status: 'ok', source }    新抓取并写入
 *   { status: 'miss', reason }  未匹配（缓存，短时间内不再重试）
 *   { status: 'skip', reason }  非音频/无标题
 */
export async function ensureLyricsForFile(audioPath, { force = false, write = true, missTtlMs = 6 * 60 * 60 * 1000 } = {}) {
  if (!AUDIO_EXT.has(path.extname(audioPath).toLowerCase())) {
    return { status: 'skip', reason: '非音频文件' };
  }
  const lrc = lrcPathFor(audioPath);
  // 新目录没有时回退检查历史位置（集中目录旧文件名 / 音频同目录）
  if (!force && findLrcPath(audioPath)) {
    return { status: 'exists' };
  }

  const cached = missCache.get(audioPath);
  if (!force && cached && Date.now() - cached < missTtlMs) {
    return { status: 'miss', reason: '未匹配（缓存）' };
  }

  let title = '', artist = '', duration = 0;
  try {
    const meta = await parseFile(audioPath, { duration: true });
    title = meta.common.title || '';
    artist = (meta.common.artists || (meta.common.artist ? [meta.common.artist] : [])).join(', ');
    duration = meta.format.duration || 0;
  } catch {}
  if (!title) {
    const f = fromFilename(path.basename(audioPath, path.extname(audioPath)));
    title = f.title;
    artist = f.artist || artist;
  }
  if (!title) {
    missCache.set(audioPath, Date.now());
    return { status: 'skip', reason: '无法解析标题' };
  }

  try {
    const found = await searchLrclib(title, artist, duration);
    if (!found) {
      missCache.set(audioPath, Date.now());
      return { status: 'miss', reason: `未匹配 ${title} - ${artist}` };
    }
    if (write) {
      ensureLyricsDir();
      await fsp.writeFile(lrc, found.lrc, 'utf-8');
    }
    missCache.delete(audioPath);
    return { status: 'ok', source: found.source, title, artist };
  } catch (e) {
    return { status: 'miss', reason: `抓取异常: ${e.message}` };
  }
}

// 扫描目录，为所有缺歌词的音频补齐（手动脚本/启动补漏用）
export async function walkAudioFiles(dir) {
  const out = [];
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walkAudioFiles(p));
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}
