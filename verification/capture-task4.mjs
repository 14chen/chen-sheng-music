// 任务四：真实 Flutter Web App 截图闭环（4 张）
import { chromium } from 'playwright';
import fs from 'node:fs';
import { KEY } from './key.mjs';
const OUT = 'screenshots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) errors.push(m.text()); });

async function setupKey() {
  await page.mouse.click(368, 28); await page.waitForTimeout(400);
  await page.mouse.click(190, 326); await page.keyboard.press('Control+A');
  await page.keyboard.type(KEY); await page.mouse.click(297, 669);
  await page.waitForTimeout(5000);
}
async function openPlayer(trackY) {
  await page.mouse.click(150, trackY); await page.waitForTimeout(1800);
  await page.mouse.click(180, 760); await page.waitForTimeout(1200);
  await page.mouse.click(204, 620); await page.waitForTimeout(2500); // 歌词页
}
// 点击进度条百分比（x: 38~352）
async function seek(p) {
  const x = 38 + Math.max(0, Math.min(1, p)) * 314;
  await page.mouse.click(x, 703); await page.waitForTimeout(1200);
}

await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
await setupKey();

// === 图1：《02的爱恋》双语歌词（日/中双行）===
await openPlayer(152);
await seek(0.26); // ~43s：人間になりたい / 想成为人类
await page.screenshot({ path: `${OUT}/task4-1-bilingual.png` });
console.log('图1 完成');

// === 图4：滑动查看非当前行，显示「回到当前歌词」按钮 ===
await page.mouse.move(190, 240);
await page.mouse.down();
for (let i = 0; i < 8; i++) { await page.mouse.move(190, 240 - i * 18); await page.waitForTimeout(30); }
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/task4-4-back-button.png` });
await page.mouse.up();
console.log('图4 完成');

// 返回列表
await page.mouse.click(28, 28); await page.waitForTimeout(800);

// === 图2：《红笔》后半段歌词 ===
await page.mouse.click(150, 224); await page.waitForTimeout(1800);
await page.mouse.click(180, 760); await page.waitForTimeout(1200);
await page.mouse.click(204, 620); await page.waitForTimeout(2500);
await seek(0.76); // ~2:21
await page.screenshot({ path: `${OUT}/task4-2-hongbi.png` });
console.log('图2 完成');
await page.mouse.click(28, 28); await page.waitForTimeout(800);

// === 图3：从文件导入音源 → 音源切换列表 ===
await page.mouse.click(368, 28); await page.waitForTimeout(500);
const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
await page.mouse.click(190, 603); // 「从文件导入音源」按钮
const chooser = await chooserPromise;
await chooser.setFiles('D:/work/music-app/verification/sample-source.json');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/task4-3-import-toast.png` });
// 打开音源切换下拉（local 右侧箭头 x≈365,y≈93）
await page.mouse.click(365, 93); await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/task4-3-source-list.png` });
console.log('图3 完成');

console.log('console errors:', errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
