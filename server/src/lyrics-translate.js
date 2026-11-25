// 歌词中文翻译：检测非中文歌词 → MyMemory API 逐句翻译 → 缓存。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

// 检测歌词语言（基于字符比例，简单可靠）
export function detectLang(text) {
  const s = String(text || '');
  const kana = (s.match(/[\u3040-\u30ff]/g) || []).length; // 日文假名
  const hangul = (s.match(/[\uac00-\ud7af]/g) || []).length; // 韩文谚文
  const latin = (s.match(/[a-zA-Z]/g) || []).length; // 拉丁字母
  const han = (s.match(/[\u4e00-\u9fff]/g) || []).length; // 汉字
  if (kana > 0) return 'ja';
  if (hangul > 0) return 'ko';
  if (latin > han && latin > 2) return 'en';
  return 'zh';
}

// 是否需要将歌词翻译成中文（中文普通话不翻译）
export function shouldTranslate(text) {
  return detectLang(text) !== 'zh';
}

function cachePath(trackId) {
  return path.join(config.downloadDir, 'lyrics',
    'trans-' + crypto.createHash('md5').update(trackId).digest('hex') + '.json');
}

// 用 MyMemory 翻译单句（免费、无需 key）
async function translateOne(text, sl) {
  const q = new URLSearchParams({ q: text, langpair: `${sl}|zh-CN` });
  const url = `https://api.mymemory.translated.net/get?${q}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ChengShengMusic/1.0 (lyrics translation)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null; // 漏译修复：失败返回 null，不回退原文
    const json = await res.json();
    const out = json?.responseData?.translatedText;
    if (!out || !out.trim()) return null;
    // 后处理润色在 lyrics-structure.polishTranslation 统一做
    return out;
  } catch {
    return null; // 请求异常也返回 null，由上层标记 untranslated
  }
}

/**
 * 为歌词行生成中文翻译（与 lines 一一对应）。
 * lines: [{time, text}]
 * 返回 translated: string[]（每行译文）；不需要翻译时返回 []。
 */
export async function translateLyrics(trackId, lines) {
  if (!Array.isArray(lines) || !lines.length) return [];
  // 语言判定：逐行扫描，只有"存在非中文行"才翻译。
  // 不能用前 8 行采样——混合语言歌曲前几行常是中文，会误判整首为中文而漏掉后面的外文行。
  const isPureChineseLine = (s) => /[\u4e00-\u9fff]/.test(s) && !/[\u3040-\u30ff\uac00-\ud7afa-zA-Z]/.test(s);
  const hasForeign = lines.some((l) => l.text && !isPureChineseLine(String(l.text)));
  if (!hasForeign) return [];
  const sampleAll = lines.map((l) => l.text).join(' ');
  const lang = detectLang(sampleAll) === 'zh' ? 'en' : detectLang(sampleAll);

  // 缓存
  const cp = cachePath(trackId);
  try {
    if (fs.existsSync(cp)) {
      const cached = JSON.parse(await fsp.readFile(cp, 'utf-8'));
      if (cached.lang === lang && Array.isArray(cached.translated) &&
          cached.translated.length === lines.length) return cached.translated;
    }
  } catch {}

  const isPureChinese = (s) => /[\u4e00-\u9fff]/.test(s) && !/[\u3040-\u30ff\uac00-\ud7afa-zA-Z]/.test(s);
  const translated = new Array(lines.length).fill(null);

  // 批量翻译：按语言分组，每批 10 行用换行拼接成 1 次请求，再按行拆分对齐。
  // 这样 46 行只需 1-2 次请求，避免 MyMemory 免费配额限流导致"半截无翻译"。
  const groups = new Map(); // lang -> [{idx, text}]
  lines.forEach((line, idx) => {
    const text = String(line.text || '');
    // 双语 LRC 已自带译文的行直接跳过机器翻译，避免覆盖/错位
    if (line.translation) return;
    if (!text.trim() || isPureChinese(text)) return; // 中文行跳过
    let lineLang = detectLang(text);
    if (lineLang === 'zh') lineLang = lang === 'zh' ? 'en' : lang;
    if (!groups.has(lineLang)) groups.set(lineLang, []);
    groups.get(lineLang).push({ idx, text });
  });

  for (const [lineLang, items] of groups) {
    for (let i = 0; i < items.length; i += 10) {
      const batch = items.slice(i, i + 10);
      const joined = batch.map((x) => x.text).join('\n');
      let out = null;
      try {
        const q = new URLSearchParams({ q: joined, langpair: `${lineLang}|zh-CN` });
        const res = await fetch(`https://api.mymemory.translated.net/get?${q}`, {
          headers: { 'User-Agent': 'ChengShengMusic/1.0 (lyrics translation)' },
          signal: AbortSignal.timeout(20000),
        });
        if (res.ok) {
          const json = await res.json();
          out = json?.responseData?.translatedText || null;
        }
      } catch {}
      const parts = out ? out.split('\n') : [];
      // 按行回填；若返回行数不符则整批标 null（明确缺译，不静默错位）
      if (parts.length === batch.length) {
        batch.forEach((x, j) => { translated[x.idx] = parts[j]; });
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  try {
    // 只有至少一行翻译成功才写缓存：避免上游限流/超时导致整首永久缺译
    if (translated.some((t) => typeof t === 'string' && t.trim())) {
      await fsp.mkdir(path.dirname(cp), { recursive: true });
      await fsp.writeFile(cp, JSON.stringify({ lang, translated }), 'utf-8');
    }
  } catch {}
  return translated;
}
