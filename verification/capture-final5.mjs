// 任务 1-5 闭环截图：真实 Flutter Web App 渲染
import { chromium } from 'playwright';
import fs from 'node:fs';
import { KEY } from './key.mjs';
const OUT = 'screenshots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('401')) errors.push(m.text());
});

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('[截图]', name);
};
const setupKey = async () => {
  await page.mouse.click(368, 28); await page.waitForTimeout(400);
  await page.mouse.click(190, 326); await page.keyboard.press('Control+A');
  await page.keyboard.type(KEY); await page.mouse.click(297, 669);
  await page.waitForTimeout(5000);
};
const clickAt = async (x, y, wait = 300) => { await page.mouse.click(x, y); await page.waitForTimeout(wait); };
// 进度条 x: 38..352
const seekRatio = async (p, wait = 1400) => clickAt(38 + Math.max(0, Math.min(1, p)) * 314, 703, wait);

await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
await setupKey();

// 打开《02的爱恋》→ 歌词页
await clickAt(150, 152, 1800);
await clickAt(180, 760, 1200);
await clickAt(204, 620, 2800);
await seekRatio(0.27); // ~45s 双语段

// ===== 图1：5 行歌词，当前行居中 =====
await shot('final5-1-five-lines');

// ===== 图2：滑动中（未松手），确认按钮 + 预览时间，音乐继续 =====
await page.mouse.move(190, 250);
await page.mouse.down();
for (let i = 1; i <= 5; i++) { await page.mouse.move(190, 250 - i * 14); await page.waitForTimeout(70); }
await page.waitForTimeout(300);
await shot('final5-2-dragging-confirm');

// ===== 图3：松手后 1 秒内，仍保持预览态 =====
await page.mouse.up();
await page.waitForTimeout(350);
await shot('final5-3-pending-confirm');

// ===== 图4：1 秒超时后自动回弹，按钮恢复播放图标 =====
await page.waitForTimeout(1300);
await shot('final5-4-rebounded');

// ===== 图5：《02的爱恋》双语对齐（切到日文行） =====
await seekRatio(0.30);
await shot('final5-5-bilingual-lyrics');

// ===== 图6：移动端导入 JS 插件文件 + 音源列表 =====
await clickAt(28, 28, 800); // 返回列表
await clickAt(368, 28, 500); // 设置
const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
await clickAt(190, 603, 100); // 从文件导入
const chooser = await chooserPromise;
await chooser.setFiles('E:/music/music-source/musicfree-plugins/哔哩哔哩.js');
await page.waitForTimeout(3500);
await shot('final5-6-import-toast');
await clickAt(365, 93, 900); // 音源下拉
await shot('final5-6-source-list');

console.log('console errors:', errors.length, errors.slice(0, 4).join(' | '));
await browser.close();
