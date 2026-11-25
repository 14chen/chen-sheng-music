// 阶段三 TDD：结构化歌词数据 + 翻译质量修复的复现测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEntries,
  polishTranslation,
  alignTranslations,
  validateAlignment,
} from './src/lyrics-structure.js';

// ---- 半截无歌词：时间轴对齐 ----
test('buildEntries: 每一行原文都有 time 与 endTime，最后一行也有区间', () => {
  const lines = [
    { time: 1.0, text: '第一行' },
    { time: 3.5, text: '第二行' },
    { time: 7.0, text: '最后一行' },
  ];
  const entries = buildEntries(lines, 10);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].endTime, 3.5);
  assert.equal(entries[1].endTime, 7.0);
  assert.ok(entries[2].endTime > 7.0, '最后一行必须有 endTime（不得提前截断）');
  for (const e of entries) assert.ok(e.endTime > e.time);
});

test('buildEntries: 无 duration 时用末行 time + 默认 5s', () => {
  const entries = buildEntries([{ time: 2, text: 'x' }], null);
  assert.equal(entries[0].endTime, 7);
});

// ---- 双语 LRC：原文 | 译文 随行绑定，时间轴一致 ----
test('buildEntries: 双语 LRC 自带的 translation 被保留并标记 translated', () => {
  const entries = buildEntries([
    { time: 10, text: '楽しみ', translation: '好期待' },
    { time: 12, text: '我爱你' }, // 中文行无译文
  ], 20);
  assert.equal(entries[0].translation, '好期待');
  assert.equal(entries[0].status, 'translated');
  assert.equal(entries[0].endTime, 12);
  assert.equal(entries[1].translation, null);
});

test('alignTranslations: 已有随行译文时不被机器翻译覆盖', () => {
  const entries = buildEntries([
    { time: 10, text: '君の言葉', translation: '你说的话' },
  ], 20);
  const out = alignTranslations(entries, ['错误的覆盖'], 'ja');
  assert.equal(out[0].translation, '你说的话');
  assert.equal(out[0].status, 'translated');
});

// ---- 漏译：不得静默回退原文 ----
test('alignTranslations: 翻译失败/null 明确标记 untranslated，不复用原文', () => {
  const entries = buildEntries([
    { time: 1, text: '夜よ抱きしめて' },
    { time: 3, text: 'キリが無いけどさ' },
  ], 6);
  const out = alignTranslations(entries, ['拥抱黑夜吧', null], 'ja');
  assert.equal(out[0].status, 'translated');
  assert.equal(out[0].translation, '拥抱黑夜吧');
  assert.equal(out[1].status, 'untranslated');
  assert.equal(out[1].translation, null, '缺译必须为 null，不能是原文');
});

test('alignTranslations: 中文歌标记 not_required，translation 为 null', () => {
  const entries = buildEntries([{ time: 1, text: '因为无心的三言两语' }], 5);
  const out = alignTranslations(entries, [], 'zh');
  assert.equal(out[0].status, 'not_required');
  assert.equal(out[0].translation, null);
});

test('alignTranslations: 混合语言逐行判断——中文行不译，日文行需译', () => {
  const entries = buildEntries([
    { time: 1, text: '我爱你' },
    { time: 3, text: '夜よ抱きしめて' },
  ], 6);
  const out = alignTranslations(entries, [null, '拥抱黑夜吧'], 'ja');
  assert.equal(out[0].status, 'not_required', '中文行不应标 untranslated');
  assert.equal(out[1].status, 'translated', '日文行有译文应标 translated');
  assert.equal(out[1].translation, '拥抱黑夜吧');
});

test('alignTranslations: 译文数组短于原文时，缺项标 untranslated 而非截断', () => {
  const entries = buildEntries([
    { time: 1, text: 'a' }, { time: 2, text: 'b' }, { time: 3, text: 'c' },
  ], 5);
  const out = alignTranslations(entries, ['译a'], 'en');
  assert.equal(out.length, 3, '词条数必须与原文行数一致，不得因译文短而截断');
  assert.equal(out[0].status, 'translated');
  assert.equal(out[1].status, 'untranslated');
  assert.equal(out[2].status, 'untranslated');
});

// ---- 翻译效果：后处理润色 ----
test('polishTranslation: 去 MYMEMORY 噪声、多余空格、统一标点', () => {
  assert.equal(
    polishTranslation('MYMEMORY WARNING: QUERY LENGTH LIMIT EXCEEDED! 拥抱  黑夜吧'),
    '拥抱黑夜吧'
  );
  assert.equal(polishTranslation('  hello ,  world  '), 'hello, world');
  assert.equal(polishTranslation('你好 。 '), '你好。');
});

// ---- 对齐校验 ----
test('validateAlignment: 完整数据通过，缺译/无 endTime 被检出', () => {
  const good = buildEntries([{ time: 1, text: 'a' }, { time: 2, text: 'b' }], 5);
  const ok = validateAlignment(alignTranslations(good, ['译a', '译b'], 'en'));
  assert.equal(ok.valid, true);
  assert.equal(ok.stats.originalLines, 2);
  assert.equal(ok.stats.translatedLines, 2);
  assert.equal(ok.stats.emptyTranslations, 0);

  const zh = buildEntries([{ time: 1, text: '中文歌词' }], 5);
  const zhOut = validateAlignment(alignTranslations(zh, [], 'zh'));
  assert.equal(zhOut.stats.emptyTranslations, 0, '中文歌 not_required 不计空译');

  const bad = buildEntries([{ time: 1, text: 'a' }, { time: 2, text: 'b' }], 5);
  bad[1].endTime = undefined;
  const r = validateAlignment(bad);
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((x) => x.includes('endTime')));
});
