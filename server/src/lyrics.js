import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { localTrackPath } from './library.js';
import { findLrcPath } from './lrc-path.js';

const CACHE_DIR = path.join(config.downloadDir, 'lyrics');
const UA = { 'User-Agent': 'MyMusicApp/1.0 (self-hosted lyrics)' };

export function parseLrc(text) {
  const lines = [];
  const re = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/;
  for (const raw of text.split(/\r?\n/)) {
    const m = re.exec(raw.trim());
    if (!m) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const frac = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
    const time = min * 60 + sec + frac;
    const content = m[4].trim();
    if (content) {
      // 双语 LRC：`原文 | 中文翻译`（支持全角 ｜）。翻译随行绑定，时间轴完全一致。
      const parts = content.split(/\s*[|｜]\s*/, 2);
      if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
        lines.push({ time, text: parts[0].trim(), translation: parts[1].trim() });
      } else {
        lines.push({ time, text: content });
      }
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

async function fromLocalLrc(trackId) {
  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND source = 'local'").get(trackId);
  if (!row) return null;
  const audio = localTrackPath(row.rel_path);
  // 规范化：从 <musicDir>/lyrics/ 读取；兼容旧的音频同目录文件
  const lrc = findLrcPath(audio);
  if (!lrc) return null;
  const text = await fsp.readFile(lrc, 'utf-8');
  const lines = parseLrc(text);
  if (!lines.length) return null;
  return { source: '本地 .lrc', lines, synced: true };
}

function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fromLrclib(title, artist, duration) {
  const q = new URLSearchParams({ track_name: title, artist_name: artist });
  if (duration) q.set('duration', String(Math.round(duration)));
  const res = await fetch(`https://lrclib.net/api/search?${q}`, {
    headers: UA, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const list = await res.json();
  if (!Array.isArray(list) || !list.length) return null;

  const target = normalize(title);
  const targetArtist = normalize(artist);
  const best = list.find((x) => normalize(x.trackName) === target) ||
    list.find((x) => normalize(x.trackName).includes(target) && normalize(x.artistName).includes(targetArtist)) ||
    list[0];

  const synced = best.syncedLyrics || best.plainLyrics;
  if (!synced) return null;

  // 优先用带时间轴的 syncedLyrics
  let lines = parseLrc(synced);
  let syncedFlag = lines.length > 0;
  if (!syncedFlag && best.plainLyrics) {
    lines = best.plainLyrics.split(/\r?\n/).filter(Boolean).map((t) => ({ time: 0, text: t.trim() }));
  }
  return {
    source: 'LRCLIB',
    lines,
    synced: syncedFlag,
    trackName: best.trackName,
    artistName: best.artistName,
  };
}

export async function getLyrics(trackId, meta = {}) {
  // 0) 用户自定义歌词（App 里编辑保存的）最优先
  try {
    const customFile = path.join(CACHE_DIR, 'custom-' +
      crypto.createHash('md5').update(trackId).digest('hex') + '.json');
    if (fs.existsSync(customFile)) {
      const custom = JSON.parse(await fsp.readFile(customFile, 'utf-8'));
      if (custom.text) {
        let lines = [];
        const wantSynced = Boolean(custom.synced);
        if (wantSynced) lines = parseLrc(custom.text);
        // 容错：标记为已同步但实际无时间轴 → 不能返回空歌词遮挡本地 .lrc，继续回退
        if (wantSynced && !lines.length) {
          console.warn('[lyrics] 自定义歌词标记 synced 但无时间轴，回退到本地/在线源:', trackId);
        } else {
          if (!wantSynced) {
            lines = custom.text.split(/\r?\n/).filter(Boolean).map((t) => ({ time: 0, text: t.trim() }));
          }
          if (lines.length) return { source: '自定义', lines, synced: wantSynced };
        }
      }
    }
  } catch {}

  // 1) 本地 .lrc 优先
  try {
    const local = await fromLocalLrc(trackId);
    if (local) return local;
  } catch {}

  // 2) 缓存
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR,
    crypto.createHash('md5').update(trackId).digest('hex') + '.json');
  if (fs.existsSync(cacheFile)) {
    try { return JSON.parse(await fsp.readFile(cacheFile, 'utf-8')); } catch {}
  }

  // 3) LRCLIB 公开歌词库
  const title = meta.title || '';
  const artist = meta.artist || '';
  if (!title) return { source: 'none', lines: [], synced: false };
  try {
    const result = await fromLrclib(title, artist, meta.duration);
    if (result) {
      await fsp.writeFile(cacheFile, JSON.stringify(result), 'utf-8');
      return result;
    }
  } catch {}

  return { source: 'none', lines: [], synced: false, message: '未找到歌词' };
}

// 保存用户自定义歌词
export async function saveCustomLyrics(trackId, text, synced) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, 'custom-' +
    crypto.createHash('md5').update(trackId).digest('hex') + '.json');
  const wantSynced = Boolean(synced);
  // 保存校验：声明 synced 却没有任何 [mm:ss.xx] 时间轴时，自动降级为纯文本，
  // 避免下次读取时解析出 0 行造成"歌词缺失"。
  const hasTimeline = /\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(String(text));
  const realSynced = wantSynced && hasTimeline;
  await fsp.writeFile(file, JSON.stringify({ text, synced: realSynced }), 'utf-8');
  return {
    ok: true,
    lines: String(text).split(/\r?\n/).filter(Boolean).length,
    synced: realSynced,
    warning: wantSynced && !hasTimeline ? '未检测到时间轴，已按纯文本保存' : undefined,
  };
}

// 删除自定义歌词（恢复默认来源）
export function deleteCustomLyrics(trackId) {
  const file = path.join(CACHE_DIR, 'custom-' +
    crypto.createHash('md5').update(trackId).digest('hex') + '.json');
  if (fs.existsSync(file)) { fs.unlinkSync(file); return true; }
  return false;
}
