// 结构化歌词：词条 = 原文行 + 翻译行 + 时间区间（整体轮播的最小单元）
// 阶段三修复：缺译不回退原文、译文不截断、时间轴完整覆盖。

const DEFAULT_TAIL_SECONDS = 5;

/**
 * 由 [{time,text}] 构建词条，为每行补齐 endTime。
 * endTime = 下一行 time；最后一行 = duration 或 末行 time + 默认秒数。
 */
export function buildEntries(lines, duration) {
  const arr = Array.isArray(lines) ? lines : [];
  return arr.map((line, i) => {
    const start = Number(line.time) || 0;
    const next = arr[i + 1];
    let end;
    if (next && Number.isFinite(Number(next.time))) {
      end = Number(next.time);
    } else if (Number.isFinite(duration) && duration > start) {
      end = duration;
    } else {
      end = start + DEFAULT_TAIL_SECONDS;
    }
    if (!(end > start)) end = start + DEFAULT_TAIL_SECONDS;
    return {
      time: start,
      endTime: end,
      original: String(line.text ?? ''),
      // 双语 LRC 自带的翻译（原文 | 译文）优先保留，不再走机器翻译覆盖
      translation: line.translation ? String(line.translation) : null,
      status: line.translation ? 'translated' : 'pending',
    };
  });
}

/**
 * 机器翻译后处理：去 MYMEMORY 警告、压缩空格、统一中英文标点。
 */
export function polishTranslation(text) {
  let s = String(text ?? '');
  // MyMemory 免费 API 会在译文中插入警告
  s = s.replace(/MYMEMORY WARNING[^!]*!/gi, '');
  // 压缩所有空白
  s = s.replace(/\s+/g, ' ').trim();
  // 标点前不加空格；中文标点统一
  s = s.replace(/\s+([,.!?;:。，！？；：])/g, '$1');
  s = s.replace(/\s*,\s*/g, ', ');
  // 中文字符之间的空格去掉（"拥抱 黑夜吧" → "拥抱黑夜吧"），英文间保留
  s = s.replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2');
  s = s.replace(/([\u3040-\u30ff])\s+([\u3040-\u30ff])/g, '$1$2');
  return s;
}

/**
 * 将译文数组绑定到词条。译文缺失/失败 → status=untranslated 且 translation=null，
 * 绝不把原文当作译文。中文歌（lang=zh）标记 not_required。
 */
export function alignTranslations(entries, translated, lang) {
  const arr = Array.isArray(entries) ? entries : [];
  const trans = Array.isArray(translated) ? translated : [];
  // 逐行判断语言：混合语言歌曲中，中文行不需要翻译，其它行才需要
  const isCJK = (s) => /[\u4e00-\u9fff]/.test(s) && !/[\u3040-\u30ff\uac00-\ud7af]/.test(s);
  return arr.map((e, i) => {
    const lineLang = detectLineLang(e.original);
    // 双语 LRC 已随行提供翻译 → 直接保留，严格保证原文/译文时间轴一致
    if (e.translation) {
      return { ...e, lineLang, translation: polishTranslation(e.translation), status: 'translated' };
    }
    const needTranslate = !isCJK(e.original); // 纯中文行不翻译
    const raw = needTranslate ? trans[i] : null;
    const polished = raw ? polishTranslation(raw) : '';
    const ok = Boolean(polished) && polished !== e.original;
    return {
      ...e,
      lineLang,
      translation: ok ? polished : null,
      status: !needTranslate ? 'not_required' : (ok ? 'translated' : 'untranslated'),
    };
  });
}

function detectLineLang(text) {
  const s = String(text || '');
  if (/[\u3040-\u30ff]/.test(s)) return 'ja';
  if (/[\uac00-\ud7af]/.test(s)) return 'ko';
  if (/[a-zA-Z]/.test(s)) return 'en';
  if (/[\u4e00-\u9fff]/.test(s)) return 'zh';
  return 'other';
}

/**
 * 对齐校验：每一行原文都有词条、都有 time/endTime 且 endTime > time；
 * 统计原文行数/译文行数/空翻译数/半截行数。
 */
export function validateAlignment(entries) {
  const arr = Array.isArray(entries) ? entries : [];
  const issues = [];
  let translatedLines = 0;
  let emptyTranslations = 0;
  let truncatedLines = 0;

  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e.original) issues.push(`第 ${i + 1} 行原文为空`);
    if (!Number.isFinite(e.time)) issues.push(`第 ${i + 1} 行缺 time`);
    if (!Number.isFinite(e.endTime) || !(e.endTime > e.time)) {
      issues.push(`第 ${i + 1} 行 endTime 无效（时间轴断裂/半截）`);
      truncatedLines++;
    }
    if (e.status === 'translated') {
      translatedLines++;
      if (!e.translation) emptyTranslations++;
    } else if (e.status === 'untranslated') {
      emptyTranslations++; // 真正的缺译（需翻译但失败）
    }
    // not_required（中文歌）不计入空译——本就不需要翻译
  }
  return {
    valid: issues.length === 0,
    issues,
    stats: {
      originalLines: arr.length,
      translatedLines,
      emptyTranslations,
      truncatedLines,
    },
  };
}
