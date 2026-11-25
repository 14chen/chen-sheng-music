// P1 H-1 配套：监控子进程，崩溃后自动重启（指数退避，上限 5 秒）。
// 一键启动脚本改为启动本文件，而非直接 node src/index.js。
import { spawn } from 'node:child_process';

const ENTRY = new URL('./index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MAX_BACKOFF = 5000;
let backoff = 1000;
let stopping = false;
let child = null;
let restartTimer = null;

function start() {
  child = spawn(process.execPath, [ENTRY], { stdio: 'inherit', windowsHide: false });
  child.on('exit', (code) => {
    if (stopping) return;
    if (code === 0) backoff = 1000;
    console.error(`[supervisor] 子进程退出(code=${code})，${backoff}ms 后重启...`);
    restartTimer = setTimeout(start, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
  });
}

function shutdown() {
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (child && !child.killed) child.kill();
  setTimeout(() => process.exit(0), 300); // 给子进程退出留时间
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[supervisor] 启动音乐服务器（崩溃自动重启）');
start();
