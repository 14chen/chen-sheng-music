import { chromium } from 'playwright';
import { KEY } from './key.mjs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs=[]; page.on('pageerror',e=>logs.push(e.message));
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.mouse.click(368, 28); await page.waitForTimeout(400);
await page.mouse.click(190, 326); await page.keyboard.press('Control+A');
await page.keyboard.type(KEY); await page.mouse.click(297, 669);
await page.waitForTimeout(5000);
await page.mouse.click(150, 152); await page.waitForTimeout(2000);
await page.mouse.click(180, 760); await page.waitForTimeout(1500);
// 点击第二页指示点（歌词页）
await page.mouse.click(204, 620); await page.waitForTimeout(4000);
await page.screenshot({ path: 'screenshots/real-lyrics.png' });
console.log('errors:',logs.length, logs.slice(0,2).join('|'));
await browser.close();
