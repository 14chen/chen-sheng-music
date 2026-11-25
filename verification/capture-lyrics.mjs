import { KEY } from './key.mjs';
// 验证播放页歌词速览：导入有歌词曲目后，打开播放页应显示歌词
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
await page.waitForTimeout(3500);

// Hey Jude 在列表第 2 行（y≈210），用坐标点击（Flutter Canvas 无 DOM）
await page.mouse.click(150, 210);
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(OUT, 'lyrics-preview.png') });
console.log('[截图] lyrics-preview.png');
console.log('console 错误:', errors.length ? errors.slice(0, 3).join(' | ') : '无');
await browser.close();
