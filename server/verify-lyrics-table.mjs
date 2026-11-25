// 阶段三验收：3 首测试歌曲的 原文行数/翻译行数/空翻译数/半截行数 对照
import { KEY } from './key.mjs';
const BASE = 'http://127.0.0.1:18080';

const tracks = await (await fetch(`${BASE}/api/tracks?source=local`, {
  headers: { 'X-Access-Key': KEY },
})).json();

console.log('| 歌曲 | 原文行数 | 翻译行数 | 空翻译数 | 半截行数 | 对齐有效 |');
console.log('|---|---|---|---|---|---|');
for (const t of tracks.items) {
  const r = await fetch(`${BASE}/api/lyrics?id=${encodeURIComponent(t.id)}&title=${encodeURIComponent(t.title)}&artist=${encodeURIComponent(t.artist)}&duration=${Math.round(t.duration || 0)}`, {
    headers: { 'X-Access-Key': KEY },
  });
  const d = await r.json();
  const s = d.stats || {};
  console.log(`| ${t.title} | ${s.originalLines ?? d.entries?.length ?? 0} | ${s.translatedLines ?? 0} | ${s.emptyTranslations ?? 0} | ${s.truncatedLines ?? 0} | ${d.alignmentValid ? '✅' : '❌'} |`);
}
