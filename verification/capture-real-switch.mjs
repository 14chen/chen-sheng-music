import { KEY } from './key.mjs';
// 真实 Flutter Web App 截图：封面/歌词切换与宽屏分栏
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('screenshots');
const BASE = `http://127.0.0.1:8082/?key=${KEY}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function shot(name, w, h, action) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await page.mouse.click(130, 150); // 第一首歌
  await page.waitForTimeout(2500);
  if (action) await action(page);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(`[截图] ${name} ${w}x${h} errors=${errors.length ? errors.slice(0,2).join(' | ') : '0'}`);
  await ctx.close();
}

// 手机：封面视图（默认）
await shot('real-cover', 375, 812);
// 手机：点封面区域切歌词（封面在页面中部约 y=250）
await shot('real-lyrics-switched', 375, 812, async (page) => {
  await page.mouse.click(180, 260);
  await page.waitForTimeout(600);
});
// 宽屏：左右分栏
await shot('real-wide-split', 1440, 900);

await browser.close();
console.log('完成');
