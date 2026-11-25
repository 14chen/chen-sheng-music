// 翻译歌词纯函数测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLang, shouldTranslate } from './src/lyrics-translate.js';

test('detectLang: 日文（含假名）', () => {
  assert.equal(detectLang('夜よ抱きしめて キリが無いけどさ'), 'ja');
});
test('detectLang: 英文（拉丁字母）', () => {
  assert.equal(detectLang('Hello, how are you today?'), 'en');
});
test('detectLang: 韩文', () => {
  assert.equal(detectLang('안녕하세요 반갑습니다'), 'ko');
});
test('detectLang: 中文普通话（汉字，无假名）', () => {
  assert.equal(detectLang('因为无心的三言两语'), 'zh');
});
test('shouldTranslate: 中文不翻译，其它语言翻译', () => {
  assert.equal(shouldTranslate('因为无心的三言两语'), false);
  assert.equal(shouldTranslate('夜よ抱きしめて'), true);
  assert.equal(shouldTranslate('Hello world'), true);
});
