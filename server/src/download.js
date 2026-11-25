import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { localTrackPath } from './library.js';

// 本地曲库支持的音质档位
export const QUALITY_PROFILES = {
  original: { label: '原始文件', bitrate: null, ext: null },
  '320k': { label: '320kbps MP3', bitrate: '320k', ext: '.mp3' },
  '192k': { label: '192kbps MP3', bitrate: '192k', ext: '.mp3' },
  '128k': { label: '128kbps MP3', bitrate: '128k', ext: '.mp3' },
};

// ffmpeg：优先环境变量，其次系统 PATH（不再写死某台机器的绝对路径）
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

export function getQualities(trackId) {
  const source = trackId.includes(':') ? trackId.split(':')[0] : 'local';
  if (source === 'jamendo') {
    // Jamendo 官方提供多码率 mp3
    return [
      { id: '320k', label: '320kbps (Jamendo 官方)' },
      { id: '192k', label: '192kbps (Jamendo 官方)' },
      { id: '128k', label: '128kbps (Jamendo 官方)' },
    ];
  }
  // 仅本地曲库支持转码下载；插件音源（B/W/K/N/Q）没有合法直链下载能力，
  // 返回空列表让前端提示"该音源不支持下载"，而不是弹出注定失败的音质选择。
  if (source !== 'local') return [];
  return Object.entries(QUALITY_PROFILES).map(([id, p]) => ({ id, label: p.label }));
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    // P2 M-5：stderr 只保留尾部 4KB，避免长任务无限占内存
    const appendErr = (d) => { err = (err + d.toString()).slice(-4096); };
    proc.stderr.on('data', appendErr);
    proc.on('error', reject);
    // P2 M-5：超时保护（5 分钟），防止损坏文件/网络盘导致永久挂起
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('ffmpeg 超时'));
    }, 5 * 60 * 1000);
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 退出码 ${code}: ${err.slice(-500)}`));
    });
  });
}

// P2 M-3：同一 trackId:quality 的并发转码去重（复用同一 Promise）
const transcoding = new Map();

// 生成本地曲库的转码文件，返回下载信息
export async function prepareLocalDownload(trackId, quality) {
  const row = db.prepare("SELECT * FROM tracks WHERE id = ? AND source = 'local'").get(trackId);
  if (!row) throw new Error('曲目不存在');

  const srcPath = localTrackPath(row.rel_path);
  if (!fs.existsSync(srcPath)) throw new Error('源文件不存在');

  fs.mkdirSync(config.downloadDir, { recursive: true });

  const profile = QUALITY_PROFILES[quality];
  if (!profile) throw new Error(`未知音质: ${quality}`);

  if (quality === 'original') {
    return {
      filePath: srcPath,
      filename: path.basename(srcPath),
      mime: 'application/octet-stream',
      quality: '原始文件',
      cached: true,
    };
  }

  const outName = `${crypto.createHash('md5').update(`${trackId}:${quality}`).digest('hex')}${profile.ext}`;
  const outPath = path.join(config.downloadDir, outName);

  if (!fs.existsSync(outPath)) {
    // P2 M-3：并发去重 + UUID 临时名，避免多个请求写同一 .part 互相覆盖
    const key = `${trackId}:${quality}`;
    if (!transcoding.has(key)) {
      const task = (async () => {
        const tmp = `${outPath}.${crypto.randomUUID()}.part`;
        try {
          await runFfmpeg([
            '-y', '-i', srcPath,
            '-vn', '-codec:a', 'libmp3lame', '-b:a', profile.bitrate,
            '-map_metadata', '0', '-id3v2_version', '3',
            '-f', 'mp3',
            tmp,
          ]);
          await fsp.rename(tmp, outPath);
        } finally {
          await fsp.rm(tmp, { force: true }).catch(() => {});
          transcoding.delete(key);
        }
      })();
      transcoding.set(key, task);
    }
    await transcoding.get(key);
  }

  return {
    filePath: outPath,
    filename: `${path.basename(row.rel_path, path.extname(row.rel_path))}-${quality}.mp3`,
    mime: 'audio/mpeg',
    quality: profile.label,
    cached: true,
  };
}

// Jamendo 官方多码率：从官方接口拿带码率的下载链接
export async function getJamendoDownloadUrl(trackId, quality) {
  const id = trackId.replace('jamendo:', '');
  const bitrate = quality === '320k' ? 320 : quality === '192k' ? 192 : 128;
  const params = new URLSearchParams({
    client_id: config.jamendo.clientId,
    format: 'json',
    id,
    include: 'musicinfo',
  });
  const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Jamendo HTTP ${res.status}`);
  const json = await res.json();
  const t = (json.results || [])[0];
  if (!t) throw new Error('Jamendo 曲目不存在');

  // Jamendo 官方在 track 里给出多码率 audio 地址
  const candidates = [
    t.audio_320, t.audio_192, t.audio_128,
    t.audio, t.stream,
  ].filter(Boolean);
  if (!candidates.length) throw new Error('该曲目无官方下载链接');
  const pick = bitrate === 320 ? (t.audio_320 || candidates[0])
    : bitrate === 192 ? (t.audio_192 || t.audio_320 || candidates[0])
    : (t.audio_128 || t.audio_192 || t.audio_320 || candidates[0]);
  return { streamUrl: pick, quality: `${bitrate}kbps (Jamendo 官方)`, filename: `${t.name}.mp3` };
}
