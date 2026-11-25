// Range 解析测试（已移除 ccmixter/url-guard 相关用例）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from './src/range.js';

test('parseRange: 无 Range 头返回 null', () => {
  assert.equal(parseRange(null, 1000), null);
});
test('parseRange: bytes=0-99 → start 0 end 99', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99, status: 206 });
});
test('parseRange: bytes=-500 后缀 → 最后 500 字节', () => {
  assert.deepEqual(parseRange('bytes=-500', 1000), { start: 500, end: 999, status: 206 });
});
test('parseRange: bytes=500- → 到文件末尾', () => {
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999, status: 206 });
});
test('parseRange: start>end 返回 416', () => {
  assert.deepEqual(parseRange('bytes=500-100', 1000), { status: 416 });
});
test('parseRange: start 超界返回 416', () => {
  assert.deepEqual(parseRange('bytes=1000-', 1000), { status: 416 });
});
test('parseRange: 畸形头返回 416', () => {
  assert.deepEqual(parseRange('garbage', 1000), { status: 416 });
  assert.deepEqual(parseRange('bytes=abc-def', 1000), { status: 416 });
});
