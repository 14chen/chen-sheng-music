// 阶段五：播放页切换/同步/响应式截图自检
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('screenshots');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const url = 'file://' + path.resolve('player-switch-preview.html');

const cases = [
  ['pv-cover-mobile', '封面视图', false],
  ['pv-lyrics-early', '前段·开头', false],
  ['pv-lyrics-mid', '正常播放·中段', false],
  ['pv-lyrics-late', '后段·结尾', false],
  ['pv-paused', '暂停状态', false],
  ['pv-seek', 'seek跳转后', false],
  ['pv-missing', '缺译行', false],
  ['pv-mid-transition', '切换中间态', false],
  ['pv-wide', '正常播放·中段', true],
];

for (const [name, scene, wide] of cases) {
  const ctx = await browser.newContext({
    viewport: wide ? { width: 1440, height: 900 } : { width: 375, height: 812 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.getByRole('button', { name: scene }).click();
  if (wide) await page.getByRole('button', { name: '宽屏1440' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(`[截图] ${name} (${scene}${wide?',1440px':''}) errors=${errors.length}`);
  await ctx.close();
}
await browser.close();
console.log('全部完成');
