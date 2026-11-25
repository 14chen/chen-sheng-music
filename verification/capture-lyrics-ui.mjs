// 阶段四：歌词界面截图自检（mock 数据，独立 HTML 预览）
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('screenshots');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const url = 'file://' + path.resolve('lyrics-preview.html');

const cases = [
  ['ui-bilingual-mobile', '双语歌词滚动中', 375, 812],
  ['ui-bilingual-wide', '双语歌词滚动中', 1920, 1080],
  ['ui-missing-trans', '翻译缺失行', 375, 812],
  ['ui-long-trans', '翻译超长', 375, 812],
  ['ui-no-lyrics', '无歌词', 375, 812],
  ['ui-zh-only', '纯原文（中文不译）', 375, 812],
];

for (const [name, scene, w, h] of cases) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  // 点击对应场景按钮
  await page.getByRole('button', { name: scene }).click();
  if (w >= 1000) {
    // toolbar 重建后按钮文字可能是"窄屏 375"（表示可切换到窄屏），用 JS 直接调用
    await page.evaluate(() => toggleWide());
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log(`[截图] ${name} (${scene}, ${w}x${h}) errors=${errors.length}`);
  await ctx.close();
}
await browser.close();
console.log('全部完成');
