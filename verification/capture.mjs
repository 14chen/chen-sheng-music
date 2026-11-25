import { KEY } from './key.mjs';
// 无头浏览器截图验证：真实渲染 Flutter Web 版橙声音乐
// 用法：node capture.mjs [baseUrl]  （默认 http://127.0.0.1:8082）
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8082';
const OUT = path.resolve('screenshots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function shot(name, viewport, opts = {}) {
  const context = await browser.newContext({
    viewport,
    colorScheme: opts.dark ? 'dark' : 'light',
    deviceScaleFactor: 1,
    hasTouch: opts.mobile ?? false,
    isMobile: opts.mobile ?? false,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE + `/?key=${KEY}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  if (opts.action) await opts.action(page);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  const modeText = await page.locator('text=当前模式：').count()
    ? await page.locator('text=当前模式：').first().textContent().catch(() => '') : '';
  console.log(`[截图] ${name} ${viewport.width}x${viewport.height}${modeText ? ' | ' + modeText : ''}`);
  if (errors.length) console.log(`  console错误: ${errors.slice(0, 3).join(' | ')}`);
  await context.close();
}

// Flutter Canvas 渲染，DOM 文字定位无效，用坐标点击第一首歌（375x812 下 y≈120）
async function openPlayer(page) {
  await page.mouse.click(120, 158);
  await page.waitForTimeout(1800);
}

// 1. PC 大屏主页（验证宽屏居中）
await shot('01-pc-home', { width: 1920, height: 1080 });

// 2. 移动端主页
await shot('02-mobile-home', { width: 375, height: 812 }, { mobile: true });

// 3. 单曲循环状态：进播放页 → 点模式按钮 3 次到 single
await shot('03-single-mode', { width: 375, height: 812 }, {
  mobile: true,
  action: async (page) => {
    await openPlayer(page);
    // 播放页控制行：模式按钮在播放/暂停键左侧约两格；375 宽下约 x=48
    // sequence→loop→shuffle→single 点 3 次
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(68, 610);
      await page.waitForTimeout(700);
    }
  },
});

// 4. 无歌词状态：进播放页 → 点歌词按钮
await shot('04-no-lyrics', { width: 375, height: 812 }, {
  mobile: true,
  action: async (page) => {
    await openPlayer(page);
    // AppBar 歌词按钮在最右（x≈353, y≈28）
    await page.mouse.click(353, 28);
    await page.waitForTimeout(5000); // 等 LRCLIB 查询返回（网络往返较慢）
  },
});

// 5. 暗黑模式 PC（验证宽屏居中）
await shot('05-pc-dark', { width: 1920, height: 1080 }, { dark: true });

await browser.close();
console.log('\n全部截图完成，目录:', OUT);
