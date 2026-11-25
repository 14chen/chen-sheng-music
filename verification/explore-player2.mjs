import { chromium } from 'playwright';
import { KEY } from './key.mjs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
// 设置口令
await page.mouse.click(368, 28);
await page.waitForTimeout(400);
await page.mouse.click(190, 326);
await page.keyboard.press('Control+A');
await page.keyboard.type(KEY);
await page.mouse.click(297, 669);
await page.waitForTimeout(5000);
// 点第一首
await page.mouse.click(150, 152);
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/real-mini2.png' });
// 点迷你条展开（先试底部导航上方 y=760）
await page.mouse.click(180, 760);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/real-player2.png' });
console.log('done');
await browser.close();
