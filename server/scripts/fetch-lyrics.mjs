#!/usr/bin/env node
/**
 * 批量为本地曲库抓取歌词并保存为同名 .lrc（方案 A：LRCLIB 公开歌词库）。
 * 逻辑已抽到 src/lyrics-fetcher.js，watcher 也会自动调用它。
 *
 * 用法：
 *   node scripts/fetch-lyrics.mjs            # 实际抓取并写 .lrc
 *   node scripts/fetch-lyrics.mjs --dry-run  # 只预览匹配结果，不写文件
 *   node scripts/fetch-lyrics.mjs --dir "D:\xxx\music"
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { walkAudioFiles, lrcPathFor, ensureLyricsForFile } from '../src/lyrics-fetcher.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirArg = args.indexOf('--dir');
const MUSIC_DIR = dirArg >= 0 ? path.resolve(args[dirArg + 1]) : config.musicDir;

console.log(`曲库目录: ${MUSIC_DIR}`);
console.log(dryRun ? '模式: DRY-RUN（不写文件）' : '模式: 实际写入 .lrc');

const files = await walkAudioFiles(MUSIC_DIR);
console.log(`音频文件数: ${files.length}\n`);

let ok = 0, skip = 0, miss = 0;
for (const file of files) {
  const lrc = lrcPathFor(file);
  if (fs.existsSync(lrc)) {
    skip++;
    console.log(`[跳过] 已有 .lrc: ${path.basename(file)}`);
    continue;
  }
  // dry-run 只查询不写；force 绕过 miss 缓存
  const r = await ensureLyricsForFile(file, { force: true, write: !dryRun });
  if (r.status === 'ok') {
    ok++;
    console.log(`[${dryRun ? '预览' : '写入'}] ${path.basename(file)} ← ${r.source}`);
  } else if (r.status === 'miss') {
    miss++;
    console.log(`[未匹配] ${r.reason}`);
  } else {
    skip++;
    console.log(`[跳过] ${r.reason}`);
  }
  await new Promise((res) => setTimeout(res, 400));
}

console.log(`\n完成: 匹配 ${ok} / 跳过 ${skip} / 未匹配 ${miss}`);
if (dryRun) console.log('（DRY-RUN 未写任何文件）');
