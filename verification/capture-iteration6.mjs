// 图1-5 闭环截图
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
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('[截图]', n); };
const click = async (x, y, w = 350) => { await page.mouse.click(x, y); await page.waitForTimeout(w); };
async function setupKey(p, keyX, keyY, saveX, saveY) {
  await p.mouse.click(keyX, keyY === 0 ? 28 : 28); await p.waitForTimeout(400);
  await p.mouse.click(keyX === 1404 ? 720 : 190, keyY); await p.keyboard.press('Control+A');
  await p.keyboard.type(KEY); await p.mouse.click(saveX, saveY); await p.waitForTimeout(5500);
}
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
await setupKey(page, 368, 395, 295, 600);

// ===== 图1：02的爱恋 图二样式歌词 =====
await click(150, 152, 1800);
await click(180, 760, 1200);
await click(204, 620, 2800);
await click(120, 703, 1800); // ~30s 双语段
await shot('iter6-1-lyrics-figure2');

// ===== 图2：音源切换列表 =====
await click(28, 28, 700);
await click(365, 93, 900);
await shot('iter6-2-source-list');
await click(200, 300, 300); // 关闭下拉

// ===== 图3：设置（无自定义音源） =====
await click(368, 28, 700);
await shot('iter6-3-settings-no-custom');
await click(232, 600, 500); // 取消

// ===== 图4：歌单 / 本地音乐扫描 =====
await click(345, 780, 700); // 我的歌单 tab
await shot('iter6-4a-playlists');
const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);
await click(190, 148, 200); // 搜索本地手机音乐
const chooser = await chooserPromise;
if (chooser) {
  await chooser.setFiles([
    'D:/work/music-app/verification/dummy-music/测试歌曲A.mp3',
    'D:/work/music-app/verification/dummy-music/测试歌曲B.mp3',
    'D:/work/music-app/verification/dummy-music/测试歌曲C.mp3',
  ]);
  await page.waitForTimeout(1800);
  await shot('iter6-4b-local-song-picker');
  await click(352, 264, 300); // 全选
  await click(190, 822, 1500); // 添加到歌单
  await shot('iter6-4c-local-playlist-added');
  await click(190, 295, 900); // 打开默认歌单详情
  await shot('iter6-4d-default-playlist-songs');
} else {
  console.log('filechooser 未触发');
}
// ===== 图5：PC 1440 宽屏 =====
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push(e.message));
await p2.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await p2.waitForTimeout(2500);
await p2.mouse.click(1404, 28); await p2.waitForTimeout(400);
await p2.mouse.click(720, 423); await p2.keyboard.press('Control+A');
await p2.keyboard.type(KEY); await p2.mouse.click(820, 632);
await p2.waitForTimeout(5500);
await p2.screenshot({ path: `${OUT}/iter6-5-pc-wide.png` });
console.log('[截图] iter6-5-pc-wide');
// 图5 对比：375px 手机端
const ctx3 = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
const p3 = await ctx3.newPage();
await p3.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await p3.waitForTimeout(2500);
await p3.mouse.click(353, 28); await p3.waitForTimeout(400);
await p3.mouse.click(190, 395); await p3.keyboard.press('Control+A');
await p3.keyboard.type(KEY); await p3.mouse.click(295, 600);
await p3.waitForTimeout(5500);
await p3.screenshot({ path: `${OUT}/iter6-5-mobile-375.png` });
console.log('[截图] iter6-5-mobile-375');
console.log('console errors:', errors.length, errors.slice(0, 4).join(' | '));
await browser.close();
