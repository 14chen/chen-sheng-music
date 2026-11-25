/// 时长格式化：统一为 m:ss（超过 60 分钟时小时并入分钟，如 75:03）。
String fmtDuration(Duration d) =>
    '${d.inMinutes}:${d.inSeconds.remainder(60).toString().padLeft(2, '0')}';
