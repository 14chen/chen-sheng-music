import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'screenshots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:8082/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/real-explore-home.png` });
console.log('home errors:', logs.length, logs.slice(0, 3).join(' | '));
// 点击第一首曲目（列表中部坐标需根据截图调整）
await browser.close();
