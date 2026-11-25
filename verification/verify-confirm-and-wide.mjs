// 附加验证：确认跳转真的 seek；PC 宽屏左右分栏
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
await page.mouse.click(150, 152, { delay: 100 }); await page.waitForTimeout(1800);
await page.mouse.click(180, 760); await page.waitForTimeout(1200);
await page.mouse.click(204, 620); await page.waitForTimeout(2500);
// 滑动预览（向上滑 ~70px → +17s）
await page.mouse.move(190, 250); await page.mouse.down();
for (let i = 1; i <= 5; i++) { await page.mouse.move(190, 250 - i * 14); await page.waitForTimeout(60); }
await page.mouse.up();
await page.waitForTimeout(150);
// 在 1 秒内点击确认按钮（橙色圆 check，约 x=190,y=787）
await page.mouse.click(190, 787);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/final5-extra-confirmed-seek.png' });
console.log('confirmed seek screenshot done');

// PC 宽屏
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page2 = await ctx2.newPage();
await page2.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page2.waitForTimeout(2500);
await page2.mouse.click(1404, 28); await page2.waitForTimeout(400);
await page2.mouse.click(600, 326); await page2.keyboard.press('Control+A');
await page2.keyboard.type(KEY); await page2.mouse.click(708, 669);
await page2.waitForTimeout(5000);
await page2.mouse.click(300, 152); await page2.waitForTimeout(1800);
await page2.mouse.click(720, 780); await page2.waitForTimeout(1500);
await page2.screenshot({ path: 'screenshots/final5-extra-wide-pc.png' });
console.log('wide PC screenshot done');
await browser.close();
