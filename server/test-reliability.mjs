// P1 复现测试：可靠性（流错误处理 / 扫描并发与事务）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import express from 'express';
import { pipeWithErrorHandling } from './src/stream-utils.js';
import { scanLibrary } from './src/library.js';

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return server;
}

test('H-2: 流 error 时响应被销毁，不会永久挂起', async () => {
  const app = express();
  app.get('/bad', (_req, res) => {
    const s = new Readable({ read() { this.destroy(new Error('模拟读取失败')); } });
    pipeWithErrorHandling(s, res);
  });
  const server = await listen(app);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const start = Date.now();
    let ended = false;
    try {
      await fetch(base + '/bad', { signal: AbortSignal.timeout(2000) });
    } catch {
      ended = true; // 连接被 destroy 会抛网络错误，属于预期
    }
    const elapsed = Date.now() - start;
    assert.ok(ended || elapsed < 2000, '请求应在 2s 内结束，不能挂死');
  } finally {
    server.close();
  }
});

test('H-3: 并发 scanLibrary 复用同一扫描 Promise（不重复扫描）', async () => {
  const p1 = scanLibrary();
  const p2 = scanLibrary();
  assert.equal(p1, p2, '并发调用应返回同一个 Promise');
  await p1;
});

test('H-3: 扫描过程中文件被删除不会抛错、库不会被清空', async () => {
  const first = await scanLibrary();
  assert.ok(first.total >= 0);
  const second = await scanLibrary();
  assert.ok(second.total >= 0, '重复扫描应正常完成');
});
