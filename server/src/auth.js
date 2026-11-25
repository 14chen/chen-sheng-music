import { config } from './config.js';

// P0-1 安全修复：
// 旧实现信任 X-Forwarded-For / cf-connecting-ip 头来判断"是否局域网"，
// 这些头客户端可任意伪造 → 加一个 XFF 头即可免口令。
// 新实现：只要配置了 ACCESS_KEY，所有 API 一律校验口令；
// 不再读取任何客户端可控的代理头，也不接受 URL query 中的口令。
//
// cloudflared 在本机转发，真实 socket 地址同样是 127.0.0.1，
// 因此无法可靠区分"本机管理"与"公网请求"——统一校验是最安全的选择。
// 状态探测走放行的 / 和 /api/health（不暴露任何数据）。

export function authMiddleware(req, res, next) {
  // 仅无敏感数据的根路径与健康检查放行（状态脚本探测需要）
  if (req.path === '/' || req.path === '/api/health') return next();

  // 未配置口令时保持向后兼容（不校验）
  if (!config.accessKey) return next();

  // 只接受请求头，口令不进 URL / 日志 / 历史
  let supplied = req.headers['x-access-key'] || '';

  // 例外：音频流/封面由 <audio>/<img> 底层请求，无法设置自定义 HTTP 头，
  // 因此仅对 /api/tracks/*/stream 与 /api/cover 允许 query 口令（其它端点一律拒绝）。
  const isStream = /^\/api\/tracks\/[^/]+\/stream$/.test(req.path);
  const isCover = req.path === '/api/cover';
  if (!supplied && (isStream || isCover)) supplied = req.query.key || '';

  if (supplied === config.accessKey) return next();

  return res.status(401).json({ error: '需要访问口令，请在 App 设置里填写' });
}
