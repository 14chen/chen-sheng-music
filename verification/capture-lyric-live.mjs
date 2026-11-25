import { KEY } from './key.mjs';
// 验证：曲库现有《红笔》《02的爱恋》的歌词能在播放页渲染
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8082';
const OUT = path.resolve('screenshots');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function capture(name, clickX, clickY, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.wide ? { width: 1280, height: 900 } : { width: 375, height: 812 },
    isMobile: !opts.wide, hasTouch: !opts.wide, deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + `/?key=${KEY}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.mouse.click(clickX, clickY); // 点曲目
  await page.waitForTimeout(4000); // 进播放页并等歌词预取
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(`[截图] ${name} console错误: ${errors.length ? errors.slice(0,2).join(' | ') : '无'}`);
  await ctx.close();
}

// 当前曲库顺序：02的爱恋(y≈150)、红笔(y≈210)、测试音(y≈270)
await capture('lyric-hongbi', 130, 210);
await capture('lyric-02ai', 130, 150);
await browser.close();
