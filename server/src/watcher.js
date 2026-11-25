import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { scanLibrary } from './library.js';
import { walkAudioFiles, findLrcPath, ensureLyricsForFile } from './lyrics-fetcher.js';

// 轮询曲库目录的目录树签名（mtime + 大小），变化时自动重扫。
const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav', '.wma', '.opus', '.mp4', '.m4b', '.lrc']);

let signature = '';
let timer = null;
let scanning = false;
let lyricsBusy = false;

function treeSignature(dir) {
  const parts = [];
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
        try {
          const st = fs.statSync(p);
          parts.push(`${p}|${st.mtimeMs}|${st.size}`);
        } catch {}
      }
    }
  }
  walk(dir);
  return parts.join('\n');
}

// 后台为缺歌词的音频补 .lrc；不阻塞扫描，串行 + 间隔避免打爆 LRCLIB
async function fillMissingLyrics() {
  if (lyricsBusy) return;
  lyricsBusy = true;
  try {
    const files = await walkAudioFiles(config.musicDir);
    const missing = files.filter((f) => !findLrcPath(f));
    if (!missing.length) return;
    console.log(`[lyrics] 检测到 ${missing.length} 首缺歌词，开始后台补充...`);
    let ok = 0, miss = 0;
    // 只处理最近优先的一批（最多 20），避免首次启动大量请求
    for (const f of missing.slice(0, 20)) {
      const r = await ensureLyricsForFile(f);
      if (r.status === 'ok') { ok++; console.log(`[lyrics] ✓ ${path.basename(f)} ← ${r.source}`); }
      else if (r.status === 'miss') miss++;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (ok || miss) console.log(`[lyrics] 本轮完成: 新增 ${ok} / 未匹配 ${miss}`);
  } catch (e) {
    console.error('[lyrics] 补充失败:', e?.message || e);
  } finally {
    lyricsBusy = false;
  }
}

export async function startWatcher() {
  if (!config.autoScanInterval || config.autoScanInterval <= 0) {
    console.log('曲库自动刷新: 已关闭');
    return;
  }
  signature = treeSignature(config.musicDir);
  // 启动先补一次歌词（后台）
  fillMissingLyrics();

  timer = setInterval(async () => {
    if (scanning) return;
    const now = treeSignature(config.musicDir);
    if (now === signature) return;
    scanning = true;
    console.log('[watcher] 检测到曲库变化，自动重新扫描...');
    try {
      const r = await scanLibrary();
      signature = treeSignature(config.musicDir);
      console.log(`[watcher] 扫描完成: ${r.total} 首`);
      // 曲库变化后补歌词（后台，不阻塞）
      fillMissingLyrics();
    } catch (e) {
      console.error('[watcher] 扫描失败:', e?.message || e);
    } finally {
      scanning = false;
    }
  }, config.autoScanInterval * 1000);
  console.log(`曲库自动刷新: 开启（每 ${config.autoScanInterval} 秒检测，含歌词自动补充）`);
}

export function stopWatcher() {
  if (timer) clearInterval(timer);
}
