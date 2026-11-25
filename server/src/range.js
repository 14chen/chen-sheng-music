// P2 M-8：RFC 7233 Range 解析（纯函数，可单测）
// 返回 { start, end, status: 206 } / { status: 416 } / null（无 Range）
export function parseRange(header, fileSize) {
  if (!header || typeof header !== 'string') return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return { status: 416 };

  // bytes=-N 后缀范围
  if (!m[1] && m[2]) {
    const suffix = Number(m[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return { status: 416 };
    const start = Math.max(0, fileSize - suffix);
    return { start, end: fileSize - 1, status: 206 };
  }

  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { status: 416 };
  if (start >= fileSize || start > end) return { status: 416 };
  return { start, end: Math.min(end, fileSize - 1), status: 206 };
}
