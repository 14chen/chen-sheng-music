import { chromium } from 'playwright';
import { KEY } from './key.mjs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.mouse.click(368, 28); await page.waitForTimeout(400);
await page.mouse.click(190, 326); await page.keyboard.press('Control+A');
await page.keyboard.type(KEY); await page.mouse.click(297, 669);
await page.waitForTimeout(5000);
await page.mouse.click(150, 152); await page.waitForTimeout(1800);
await page.mouse.click(180, 760); await page.waitForTimeout(1200);
await page.mouse.click(204, 620); await page.waitForTimeout(2500);
// 调到双语段落后拖动查看非当前行
await page.mouse.click(120, 703); await page.waitForTimeout(1500);
await page.mouse.move(190, 240);
await page.mouse.down();
for (let i = 0; i < 8; i++) { await page.mouse.move(190, 240 - i * 18); await page.waitForTimeout(40); }
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/task4-4-back-button.png' });
await page.mouse.up();
console.log('done');
await browser.close();
