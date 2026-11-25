import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { authMiddleware } from './auth.js';
import api from './routes/api.js';
import { scanLibrary } from './library.js';
import { startWatcher, stopWatcher } from './watcher.js';

const app = express();

// P2 C-2：限制 CORS 来源，不再 Access-Control-Allow-Origin: *
// 允许同源/localhost/Web 预览端口；其余 Origin 拒绝。
// 注意 API 还有口令校验，CORS 只是纵深防御的一层。
// 移动端 WebView / PWA 来源不固定，逐个放行常见来源；真正的访问控制仍靠 X-Access-Key。
const allowedOrigins = new Set([
  'http://localhost:8082', 'http://127.0.0.1:8082',
  'http://localhost:18080', 'http://127.0.0.1:18080',
  'capacitor://localhost', 'ionic://localhost', 'http://localhost',
  'app://localhost', 'file://',
]);
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    // 局域网 / 手机浏览器来源（自托管场景，API 仍强制 X-Access-Key 校验）
    if (/^https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(origin)) {
      return cb(null, true);
    }
    cb(new Error('CORS origin not allowed'));
  },
}));
app.use(express.json());
app.use(authMiddleware);

app.get('/', (_req, res) => res.json({ name: '橙声君服务器', version: '2.0.0' }));
app.use('/api', api);

app.use((err, _req, res, _next) => {
  // P2 M-7：详细错误只写服务端日志，客户端返回统一文案（防路径/内部信息泄露）
  console.error('[error]', err?.stack || err);
  const isCors = err?.message === 'CORS origin not allowed';
  res.status(isCors ? 403 : 500).json({
    error: isCors ? '不允许的来源' : '服务器内部错误',
  });
});

const server = app.listen(config.port, config.host, async () => {
  console.log(`橙声君服务器已启动: http://${config.host}:${config.port}`);
  console.log(`曲库目录: ${config.musicDir}`);
  console.log(`下载目录: ${config.downloadDir}`);
  console.log(`访问口令: ${config.accessKey ? '已开启' : '未设置'}`);
  try {
    const r = await scanLibrary();
    console.log(`曲库扫描完成: ${r.total} 首曲目`);
  } catch (err) {
    console.error('曲库扫描失败:', err?.message || err);
  }
  startWatcher();
});

function shutdown() {
  stopWatcher();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// P1 H-1：未捕获异常意味着进程处于未定义状态，记录后立即退出，
// 由启动脚本的自动重启包装器拉起，避免带病运行造成数据损坏/静默错误。
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] 进程将退出:', err?.stack || err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  // 单个请求/第三方超时不应让整个服务退出；记录后继续服务
  console.error('[unhandledRejection]', reason?.stack || reason);
});
