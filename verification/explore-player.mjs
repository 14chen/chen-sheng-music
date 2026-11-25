import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(4000);
await page.mouse.click(150, 152); // 02的爱恋
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/real-mini.png' });
// 点击迷你条展开全屏播放页
await page.mouse.click(180, 760);
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/real-player.png' });
console.log('done');
await browser.close();
