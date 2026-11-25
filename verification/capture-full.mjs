// 全面升级截图验证（8 场景）
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('screenshots');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const cases = [
  ['full-lyrics-light', '歌词居中·浅色', 375, 812],
  ['full-lyrics-dark', '歌词居中·深色', 375, 812],
  ['full-seek-preview', '滑动seek预览', 375, 812],
  ['full-settings', '设置页(下载路径/清缓存/自定义源)', 375, 812],
  ['full-playlists', '我的歌单', 375, 812],
  ['full-download-fail', '下载失败提示', 375, 812],
  ['full-mobile', '手机窄屏375', 375, 812],
  ['full-pc', 'PC宽屏1440', 1440, 900],
];
for (const [name, scene, w, h] of cases) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve('full-preview.html'), { waitUntil: 'load' });
  await page.getByRole('button', { name: scene }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(`[截图] ${name} (${scene}, ${w}x${h}) errors=${errors.length}`);
  await ctx.close();
}
await browser.close();
console.log('完成');
