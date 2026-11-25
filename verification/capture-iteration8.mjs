// 第 8 轮验证：音源导入/改名、播放、歌单队列、设置返回、响应式
import fs from 'node:fs';
import { chromium } from 'playwright';
import { KEY } from './key.mjs';

const OUT = 'screenshots';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const consoleErrors = [];
const streamResponses = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function newPage(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('response', (r) => {
    if (r.url().includes('/stream')) {
      streamResponses.push({ status: r.status(), url: r.url().replace(/key=[^&]+/, 'key=***').slice(0, 90) });
    }
  });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('401')) consoleErrors.push(t.slice(0, 200));
  });
  return { ctx, page };
}

async function boot(page, w) {
  await page.goto(`http://127.0.0.1:8082/?key=${encodeURIComponent(KEY)}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3200);
  await page.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
  await page.waitForTimeout(700);
  return w;
}

const sem = (page) => page.evaluate(() => Array.from(document.querySelectorAll('flt-semantics, input')).map((n) => ({
  role: n.getAttribute('role'),
  label: n.getAttribute('aria-label'),
  text: (n.textContent || '').replace(/\s+/g, ' ').trim(),
})));

async function clickSem(page, { role, label, text, exact = false }) {
  return await page.evaluate(({ role, label, text, exact }) => {
    const nodes = Array.from(document.querySelectorAll('flt-semantics'));
    const matches = nodes.filter((n) => {
      if (role && n.getAttribute('role') !== role) return false;
      if (label && n.getAttribute('aria-label') !== label) return false;
      if (text) {
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (exact ? t !== text : !t.includes(text)) return false;
      }
      return true;
    });
    // 取最内层（最后一个）匹配，避免点到整页容器
    const el = matches[matches.length - 1];
    if (!el) return false;
    el.click();
    return true;
  }, { role, label, text, exact });
}

const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('[截图]', name); };

async function clickTab(page, label) {
  return (await clickSem(page, { role: 'tab', label })) ||
    (await clickSem(page, { label })) ||
    (await clickSem(page, { text: label }));
}

// ================= 手机 390x844 =================
const { ctx: mctx, page: m } = await newPage(390, 844);
await boot(m);

// 1. 首页搜索栏独占一行
let d = await sem(m);
check('首页显示 7 个音源中的本地曲目', d.some((x) => x.text.includes('02的爱恋')), '');
check('首页搜索框存在', d.some((x) => x.label === '搜索歌曲 / 歌手'));
await shot(m, 'iter8-1-home-390');

// 2. 设置 + 音源列表
await m.mouse.click(368, 28);
await m.waitForTimeout(900);
d = await sem(m);
check('设置弹窗打开', d.some((x) => x.role === 'alertdialog'));
await shot(m, 'iter8-2-settings-390');

const opened = await clickSem(m, { role: 'button', text: '本地曲库' });
await m.waitForTimeout(700);
d = await sem(m);
const items = d.filter((x) => x.role === 'menuitem').map((x) => x.label);
check('音源下拉展开', opened && items.length >= 7, items.join(','));
check('音源名称按要求改名', ['音源J', '音源B', '音源W', '音源K', '音源N', '音源Q'].every((n) => items.includes(n)), items.join(','));
check('iTunes / 元力KG 已移除', !items.some((n) => /iTunes|元力/i.test(n || '')), items.join(','));
await shot(m, 'iter8-3-sources-390');

// 3. 选音源K 并保存
check('选择音源K', await clickSem(m, { role: 'menuitem', label: '音源K' }));
await m.waitForTimeout(500);
check('保存设置', await clickSem(m, { role: 'button', text: '保存', exact: true }));
await m.waitForTimeout(1200);

// 4. 搜索并播放（音源K）
await m.mouse.click(190, 96);
await m.waitForTimeout(500);
await m.keyboard.type('周杰伦');
await m.keyboard.press('Enter');
await m.waitForTimeout(6000);
d = await sem(m);
const trackBtns = d.filter((x) => x.role === 'button' && /周杰伦|花海|发如雪|青花瓷/.test(x.text));
check('音源K 搜索出周杰伦歌曲', trackBtns.length > 0, `count=${trackBtns.length}`);
await shot(m, 'iter8-4-search-K');

const firstTrack = trackBtns[0]?.text || '';
if (trackBtns.length) {
  await m.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('flt-semantics[role="button"]'));
    const el = nodes.find((n) => /周杰伦|花海|发如雪|青花瓷/.test(n.textContent || ''));
    el?.click();
  });
  await m.waitForTimeout(6500);
  d = await sem(m);
  const playerText = d.map((x) => x.text).join(' ');
  const hasPlaying = playerText.includes('正在播放') || playerText.includes('校准');
  const gotStream = streamResponses.some((r) => [200, 206, 302].includes(r.status));
  check('点击后进入播放页', hasPlaying);
  check('音源K 实际取流成功（HTTP 200/206/302）', gotStream, JSON.stringify(streamResponses.slice(-2)));
  const audioState = await m.evaluate(() => Array.from(document.querySelectorAll('audio')).map((a) => ({ t: Math.round(a.currentTime * 10) / 10, paused: a.paused, src: (a.src || '').slice(0, 40) })));
  console.log('[audio]', JSON.stringify(audioState));
  await shot(m, 'iter8-5-playing-K');
  // 返回首页
  await m.mouse.click(24, 28);
  await m.waitForTimeout(900);
}

// 5. 歌单：扫描本地音乐 + 队列测试
await clickTab(m, '我的歌单');
await m.waitForTimeout(800);
await shot(m, 'iter8-6-playlists-390');

const fcPromise = m.waitForEvent('filechooser', { timeout: 20000 }).catch(() => null);
await clickSem(m, { role: 'button', text: '搜索本地手机音乐' });
const fc = await fcPromise;
check('文件选择器弹出', !!fc);
if (fc) {
  const dir = 'D:/work/music-app/verification/dummy-music/';
  await fc.setFiles([dir + '周杰伦 - 晴天.mp3', dir + '周杰伦 - 稻香.mp3', dir + '水濑祈 - 心生爱恋.mp3']);
  await m.waitForTimeout(12000);
  d = await sem(m);
  check('自动扫描只保留 2–8 分钟歌曲（3 首）', d.some((x) => x.text.includes('扫描到 3 首')), '');
  await shot(m, 'iter8-7-scan-picker');
  await clickSem(m, { role: 'button', text: '全选' });
  await m.waitForTimeout(400);
  await clickSem(m, { role: 'button', text: '添加到' });
  await m.waitForTimeout(1200);
}

// 打开默认歌单，播放第 2 首，再点下一首
d = await sem(m);
check('默认歌单显示 3 首', d.some((x) => /本机音乐\s*·\s*3\s*首/.test(x.text)), '');
await clickSem(m, { role: 'button', text: '大人，这是您的音乐' });
await m.waitForTimeout(1300);
await shot(m, 'iter8-8-playlist-songs');
// 歌单行用坐标点击（ListTile 语义点击在某些 sheet 内不触发）
await m.mouse.click(150, 414);
await m.waitForTimeout(6500);
d = await sem(m);
let playerText = d.map((x) => x.text).join(' ');
check('歌单歌曲可播放（进入播放页且为稻香）', playerText.includes('稻香') && playerText.includes('正在播放'), playerText.slice(0, 60));
await shot(m, 'iter8-9-playlist-playing');

let nextClicked = await clickSem(m, { role: 'button', label: '下一首' }) ||
  await clickSem(m, { role: 'button', text: '下一首' });
if (!nextClicked) {
  await m.mouse.click(264, 786); // 播放页“下一首”按钮
}
await m.waitForTimeout(5500);
d = await sem(m);
playerText = d.map((x) => x.text).join(' ');
check('下一首在歌单队列内切换（到心生爱恋）', playerText.includes('心生爱恋'), playerText.slice(0, 80));
await shot(m, 'iter8-10-queue-next');

// 6. 设置返回键不再重开
await m.mouse.click(24, 28); // 回首页
await m.waitForTimeout(800);
await m.mouse.click(368, 28);
await m.waitForTimeout(900);
await m.mouse.click(8, 700); // 点遮罩关闭
await m.waitForTimeout(1200);
d = await sem(m);
check('点遮罩关闭设置后不自动重开', !d.some((x) => x.role === 'alertdialog'));
await shot(m, 'iter8-11-settings-dismiss');

await mctx.close();

// ================= 375 / 834 / 1440 响应式 =================
for (const [w, h, name] of [[375, 812, '375'], [834, 1112, '834'], [1440, 900, '1440']]) {
  const { ctx, page } = await newPage(w, h);
  await boot(page);
  d = await sem(page);
  check(`${name}px 首页渲染`, d.some((x) => x.text.includes('橙声君')), '');
  await shot(page, `iter8-12-home-${name}`);
  // 宽屏应有侧边导航（rail），窄屏底部导航：只校验四个入口都在
  const navLabels = ['本地音乐', '下载管理', '最近播放', '我的歌单'];
  const navCount = navLabels.filter((n) =>
    d.some((x) => x.label === n || x.text === n || x.text.includes(n))).length;
  check(`${name}px 四个导航入口存在`, navCount >= 4, `nav=${navCount}`);
  await page.mouse.click(w - 22, 28);
  await page.waitForTimeout(900);
  d = await sem(page);
  check(`${name}px 设置弹窗可打开`, d.some((x) => x.role === 'alertdialog'));
  await shot(page, `iter8-13-settings-${name}`);
  await clickSem(page, { role: 'button', text: '取消', exact: true });
  await page.waitForTimeout(600);
  await clickTab(page, '我的歌单');
  await page.waitForTimeout(700);
  await shot(page, `iter8-14-playlists-${name}`);
  await ctx.close();
}

const report = { results, consoleErrors };
fs.writeFileSync('D:/work/music-app/logs/iter8-verify.json', JSON.stringify(report, null, 2), 'utf-8');
console.log('\n=== SUMMARY ===');
console.log(`PASS ${results.filter((r) => r.ok).length}/${results.length}`);
for (const r of results.filter((r) => !r.ok)) console.log('FAILED:', r.name, r.detail);
console.log('console errors:', consoleErrors.length, consoleErrors.slice(0, 5));
await browser.close();
