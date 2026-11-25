import fs from 'node:fs';
import { chromium } from 'playwright';
import { KEY } from './key.mjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
const streams = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) errs.push(m.text().slice(0, 160)); });
page.on('response', (r) => {
  if (r.url().includes('/stream')) streams.push({ status: r.status(), url: r.url().replace(/key=[^&]+/, 'key=***').slice(0, 70) });
});

await page.goto(`http://127.0.0.1:8082/?key=${encodeURIComponent(KEY)}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3200);
await page.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
await page.waitForTimeout(700);

const sem = () => page.evaluate(() => Array.from(document.querySelectorAll('flt-semantics')).map((n) => ({ role: n.getAttribute('role'), label: n.getAttribute('aria-label'), text: (n.textContent || '').replace(/\s+/g, ' ').trim() })));
const clickSem = (opts) => page.evaluate(({ role, label, text, exact }) => {
  const nodes = Array.from(document.querySelectorAll('flt-semantics'));
  const m = nodes.filter((n) => {
    if (role && n.getAttribute('role') !== role) return false;
    if (label && n.getAttribute('aria-label') !== label) return false;
    if (text) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (exact ? t !== text : !t.includes(text)) return false;
    }
    return true;
  });
  m[m.length - 1]?.click();
  return m.length;
}, opts);

const results = [];
for (const [name, query] of [['音源J', 'piano'], ['音源B', '周杰伦'], ['音源W', '周杰伦'], ['音源N', '周杰伦'], ['音源Q', '周杰伦']]) {
  const r = { source: name, query };
  // 打开设置 → 下拉 → 选音源 → 保存
  await page.mouse.click(368, 28);
  await page.waitForTimeout(800);
  // 找当前音源按钮（在 dialog 内，role=button，文本是当前音源名）
  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('flt-semantics[role="button"]'));
    const el = nodes.find((n) => /本地曲库|音源[A-Z]/.test(n.textContent || ''));
    el?.click();
  });
  await page.waitForTimeout(600);
  const picked = await clickSem({ role: 'menuitem', label: name });
  await page.waitForTimeout(400);
  const saved = await clickSem({ role: 'button', text: '保存', exact: true });
  await page.waitForTimeout(1200);

  // 搜索
  await page.mouse.click(190, 96);
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(query);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(7000);

  let d = await sem();
  const rows = d.filter((x) => x.role === 'button' && !/保存|取消|全选|添加到|清除缓存|搜索本地/.test(x.text) && x.text.length > 4);
  r.picked = picked > 0;
  r.saved = saved > 0;
  r.listCount = rows.length;
  r.first = rows[0]?.text.slice(0, 40) || null;

  // 播放第一首
  if (rows.length) {
    const before = streams.length;
    await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('flt-semantics[role="button"]'));
      const el = nodes.find((n) => {
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        return t.length > 6 && !/保存|取消|全选|添加到|清除缓存|搜索本地|播放模式|下载|歌词/.test(t);
      });
      el?.click();
    });
    await page.waitForTimeout(7000);
    r.player = (await sem()).some((x) => x.text.includes('正在播放'));
    r.stream = streams[before] || null;
    await page.screenshot({ path: `screenshots/iter8-src-${name}.png` });
    // 返回首页
    await page.mouse.click(24, 28);
    await page.waitForTimeout(900);
  }
  r.ok = r.picked && r.saved && r.listCount > 0 && r.player && !!r.stream;
  results.push(r);
  console.log(name, JSON.stringify(r));
}

fs.writeFileSync('D:/work/music-app/logs/sources-ui.json', JSON.stringify({ results, errs }, null, 2), 'utf-8');
console.log('PASS', results.filter((r) => r.ok).length, '/', results.length, 'consoleErrors', errs.length);
await browser.close();
