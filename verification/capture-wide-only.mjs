import { chromium } from 'playwright';
import { KEY } from './key.mjs';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
// 设置弹窗（宽屏居中）：齿轮 1404,28；口令框 ~720,360；保存 ~868,695
await page.mouse.click(1404, 28); await page.waitForTimeout(500);
await page.mouse.click(720, 360); await page.keyboard.press('Control+A');
await page.keyboard.type(KEY); await page.mouse.click(868, 695);
await page.waitForTimeout(5500);
// 点第一首
await page.mouse.click(350, 152); await page.waitForTimeout(1800);
// 宽屏直接进入播放器（无迷你条），若未进入则点底部中央
await page.mouse.click(720, 800); await page.waitForTimeout(1500);
// 跳到 0:49 附近（进度条约 x=720..1420，30% → x≈930）
await page.mouse.click(930, 588); await page.waitForTimeout(1800);
await page.screenshot({ path: 'screenshots/final5-extra-wide-pc.png' });
console.log('wide done');
await browser.close();
