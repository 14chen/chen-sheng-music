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
// 红笔（第二首）
await page.mouse.click(150, 224); await page.waitForTimeout(1800);
await page.mouse.click(180, 760); await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/hongbi-cover.png' });
await page.mouse.click(204, 620); await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/hongbi-start.png' });
// 拖到后段
await page.mouse.click(277, 703); await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/hongbi-late.png' });
console.log('done');
await browser.close();
