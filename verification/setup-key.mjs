import { KEY } from './key.mjs';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.mouse.click(368, 28);
await page.waitForTimeout(500);
// 口令输入框
await page.mouse.click(190, 326);
await page.keyboard.press('Control+A');
await page.keyboard.type(`${KEY}`);
await page.waitForTimeout(200);
// 保存
await page.mouse.click(297, 669);
await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshots/real-home-loaded.png' });
console.log('done');
await browser.close();
