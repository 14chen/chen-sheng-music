// 第 7 轮：自动扫描 / 本地歌单播放 / 搜索栏 / 设置音源 / 响应式
import { chromium } from 'playwright';
import fs from 'node:fs';
import { KEY } from './key.mjs';
const OUT = 'screenshots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) errors.push(m.text()); });
const click = async (x, y, w = 400) => { await page.mouse.click(x, y); await page.waitForTimeout(w); };
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('[截图]', n); };

await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2800);
// 设置口令（新布局：口令 190,435；保存 296,649）
await click(368, 28, 900);
await click(190, 435, 250);
await page.keyboard.press('Control+A');
await page.keyboard.type(KEY);
await click(296, 649, 5500);

// 图1：首页搜索栏独占一行（无音源下拉）
await shot('iter7-1-home-search-fullrow');

// 图2：设置里的音源选择
await click(368, 28, 900);
await shot('iter7-2-settings-source');
await click(190, 277, 500); // 展开音源下拉
await shot('iter7-2b-source-dropdown');
await click(233, 649, 400); // 先收起下拉/或取消
await click(233, 649, 600); // 关闭设置弹窗

// 图3：歌单页（含自动扫描入口 + 默认歌单）
await click(345, 780, 700);
await shot('iter7-3-playlists');

// 自动扫描：文件选择器
const fcPromise = page.waitForEvent('filechooser', { timeout: 20000 }).catch(() => null);
await click(190, 148, 250);
const fc = await fcPromise;
if (fc) {
  const dir = 'D:/work/music-app/verification/dummy-music/';
  await fc.setFiles([
    dir + '周杰伦 - 晴天.mp3', dir + '周杰伦 - 稻香.mp3',
    dir + '水濑祈 - 心生爱恋.mp3', dir + '录音_20241124.mp3', dir + '短提示音.mp3',
  ]);
  // 时长探测可能较慢
  await page.waitForTimeout(12000);
  await shot('iter7-4-scan-picker');
  await click(352, 264, 300); // 全选
  await click(190, 822, 2000); // 添加
  await shot('iter7-5-added');
  await click(190, 295, 900); // 打开默认歌单
  await shot('iter7-6-playlist-songs');
  // 播放第一首本地歌曲（周杰伦 - 晴天）
  await click(190, 330, 6000);
  await shot('iter7-7-local-song-playing');
  await click(204, 620, 900); // 切到歌词页
  await page.waitForTimeout(4500); // 等待歌词自动匹配
  await shot('iter7-7b-local-song-lyrics');
} else {
  console.log('filechooser 未触发');
}
// 图8：PC 1440 宽屏
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push(e.message));
await p2.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await p2.waitForTimeout(2800);
await p2.mouse.click(1404, 28); await p2.waitForTimeout(900);
await p2.mouse.click(720, 462); await p2.keyboard.press('Control+A');
await p2.keyboard.type(KEY); await p2.mouse.click(820, 675);
await p2.waitForTimeout(5500);
await p2.screenshot({ path: `${OUT}/iter7-8-pc-wide.png` });
console.log('[截图] iter7-8-pc-wide');
await p2.mouse.click(40, 270); await p2.waitForTimeout(800);
await p2.screenshot({ path: `${OUT}/iter7-9-pc-playlists.png` });
console.log('[截图] iter7-9-pc-playlists');
console.log('console errors:', errors.length, errors.slice(0, 4).join(' | '));
await browser.close();
