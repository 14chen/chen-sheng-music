import { chromium } from 'playwright';
import { KEY } from './key.mjs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.mouse.click(368, 28); await page.waitForTimeout(400);
await page.mouse.click(190, 326); await page.keyboard.press('Control+A');
await page.keyboard.type(KEY); await page.mouse.click(297, 669);
await page.waitForTimeout(5000);
// 重新打开设置
await page.mouse.click(368, 28); await page.waitForTimeout(1000);
await page.screenshot({ path: 'screenshots/task4-3-settings-before.png' });
// 按钮在对话框底部：x≈190,y≈603（见截图确认）
const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
await page.mouse.click(190, 603);
const chooser = await chooserPromise;
await chooser.setFiles('D:/work/music-app/verification/sample-source.json');
await page.waitForTimeout(4000);
await page.screenshot({ path: 'screenshots/task4-3-import-toast.png' });
// 打开音源下拉
await page.mouse.click(365, 93); await page.waitForTimeout(1000);
await page.screenshot({ path: 'screenshots/task4-3-source-list.png' });
console.log('done, errors:', errs.length, errs.slice(0,2).join('|'));
await browser.close();
