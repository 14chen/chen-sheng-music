// 阶段八：迭代截图（全屏播放页/迷你条/后台控制/中间态 + 名称）
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('screenshots');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const url = 'file://' + path.resolve('iteration-preview.html');

const cases = [
  ['it-cover', '全屏播放页·封面'],
  ['it-lyrics', '全屏播放页·歌词'],
  ['it-swipe-mid', '左右滑动中间态'],
  ['it-mini', '迷你播放条(收缩态)'],
  ['it-notification', '后台通知栏控制'],
  ['it-lockscreen', '锁屏控制'],
];
for (const [name, scene] of cases) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.getByRole('button', { name: scene }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(`[截图] ${name} (${scene}) errors=${errors.length}`);
  await ctx.close();
}
await browser.close();
console.log('完成');
