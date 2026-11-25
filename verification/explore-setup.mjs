import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(e.message));
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000);
// 点击右上角设置齿轮
await page.mouse.click(368, 28);
await page.waitForTimeout(600);
await page.screenshot({ path: 'screenshots/real-settings-dialog.png' });
console.log('settings screenshot done');
await browser.close();
