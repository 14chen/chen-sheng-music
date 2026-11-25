// P0-1 复现测试：认证不得被客户端伪造头绕过
// 运行：node --test test-auth.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { authMiddleware } from './src/auth.js';
import { config } from './src/config.js';

let server;
let base;

before(async () => {
  const app = express();
  app.use(authMiddleware);
  app.get('/api/protected', (_req, res) => res.json({ ok: true }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function status(headers = {}, query = '') {
  const r = await fetch(base + '/api/protected' + query, { headers });
  return r.status;
}

test('伪造 X-Forwarded-For 为内网地址不能绕过口令', async () => {
  assert.equal(await status({ 'x-forwarded-for': '192.168.1.10' }), 401);
});

test('本机无口令也不能访问受保护 API（口令必须对所有人生效）', async () => {
  assert.equal(await status({}), 401);
});

test('伪造 cf-connecting-ip 不能绕过口令', async () => {
  assert.equal(await status({ 'cf-connecting-ip': '1.2.3.4' }), 401);
});

test('带正确 X-Access-Key 可以访问', async () => {
  assert.equal(await status({ 'x-access-key': config.accessKey }), 200);
});

test('普通 API 的 query 口令不被接受（防止口令进入 URL/日志）', async () => {
  assert.equal(await status({}, `?key=${config.accessKey}`), 401);
});

test('流媒体端点允许 query 口令（just_audio 无法设置 HTTP 头）', async () => {
  const r = await fetch(base + `/api/tracks/local%3Ax/stream?key=${config.accessKey}`);
  // 不带正确 key 应为 401；带 key 应越过认证（之后 404 是路由层行为，说明认证已通过）
  assert.notEqual(r.status, 401);
});

test('流媒体端点无口令仍为 401', async () => {
  const r = await fetch(base + '/api/tracks/local%3Ax/stream');
  assert.equal(r.status, 401);
});
