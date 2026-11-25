import { KEY } from './key.mjs';
// P0-2 验证：切歌后播放页是否显示新歌
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8082';
const OUT = path.resolve('screenshots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE + `/?key=${KEY}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500); // 需读 query + 持久化 + API，稍慢

// 打开第一首歌 "02的爱恋"
await page.mouse.click(120, 158);
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(OUT, 'p0-before-next.png') });
console.log('[截图] 切歌前 p0-before-next.png（应为 02的爱恋）');

// 点"下一首"（控制行 x≈262, y≈610）
await page.mouse.click(262, 610);
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(OUT, 'p0-after-next.png') });
console.log('[截图] 切歌后 p0-after-next.png（应为 小雪 - 红笔，而非 02的爱恋）');

console.log('console 错误:', errors.length ? errors.slice(0, 3).join(' | ') : '无');
await browser.close();
