// 歌词路径规范化 + 双语 LRC 解析测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseLrc } from './src/lyrics.js';
import { LYRICS_DIR, lrcPathFor, findLrcPath } from './src/lrc-path.js';

test('LRC 规范路径：lyrics/<歌名>.<路径哈希>.lrc（不同目录同名不冲突）', () => {
  assert.equal(path.basename(LYRICS_DIR), 'lyrics');
  const a = lrcPathFor('D:/tmp/a/某首歌.mp3');
  const b = lrcPathFor('D:/tmp/b/某首歌.mp3');
  assert.equal(path.dirname(a), LYRICS_DIR);
  assert.match(path.basename(a), /^某首歌\.[0-9a-f]{8}\.lrc$/);
  assert.notEqual(a, b, '同名不同目录的歌曲应使用不同歌词文件，避免互相覆盖');
});

test('历史歌词仍可被 findLrcPath 找到（集中目录旧命名）', () => {
  const migrated = fs.readdirSync(LYRICS_DIR).filter((f) => f.toLowerCase().endsWith('.lrc'));
  assert.ok(migrated.length >= 4, 'lyrics 目录应有全部歌词文件');
  assert.ok(migrated.includes('多多poi - 02的爱恋.lrc'));
  // 旧命名（无哈希）文件必须仍能被解析到，保证存量歌词不丢失
  const found = findLrcPath(path.resolve('music', '多多poi - 02的爱恋.mp3'));
  assert.ok(found, '旧命名的集中歌词文件应被 findLrcPath 命中');
  assert.equal(path.basename(found), '多多poi - 02的爱恋.lrc');
});

test('双语 LRC 解析：原文 | 译文 绑定同一时间戳', () => {
  const lines = parseLrc('[00:29.40] 楽しみ | 好期待\n[00:30.14] ねえ | 呐\n[00:31.00] 纯中文行');
  assert.equal(lines.length, 3);
  assert.equal(lines[0].time, 29.4);
  assert.equal(lines[0].text, '楽しみ');
  assert.equal(lines[0].translation, '好期待');
  assert.equal(lines[2].translation, undefined);
});

test('《02的爱恋》LRC：90 行全部解析、46 行双语、时间轴单调递增', () => {
  const text = fs.readFileSync(path.join(LYRICS_DIR, '多多poi - 02的爱恋.lrc'), 'utf-8');
  const lines = parseLrc(text);
  assert.equal(lines.length, 90);
  const bilingual = lines.filter((l) => l.translation).length;
  assert.equal(bilingual, 46);
  for (let i = 1; i < lines.length; i++) {
    assert.ok(lines[i].time >= lines[i - 1].time, `第 ${i + 1} 行时间戳倒退`);
  }
  assert.equal(lines[0].time, 0);
});
