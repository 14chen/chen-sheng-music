// P1 H-2：统一的流管道错误处理。
// 旧代码直接 stream.pipe(res)，文件在 resolve() 与 createReadStream 之间被删/改时，
// ReadStream 的 'error' 无人监听 → 全局 uncaughtException 吞掉 → HTTP 请求永久挂起 + fd 泄漏。
export function pipeWithErrorHandling(stream, res) {
  stream.on('error', (err) => {
    // 已发响应头只能断开连接；否则返回明确错误状态
    if (!res.headersSent) {
      res.status(500).json({ error: '文件读取失败或已不存在' });
    } else {
      res.destroy();
    }
    console.error('[stream] 读取错误:', err?.message || err);
  });

  // 客户端取消/断开时销毁上游流，释放文件句柄
  res.on('close', () => {
    if (typeof stream.destroy === 'function') stream.destroy();
  });

  return stream.pipe(res);
}
