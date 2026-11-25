import re
from pathlib import Path

root = Path(r'D:\work\music-app\server\music\lyrics')
for name in ['多多poi - 02的爱恋', '水濑祈 (水瀬いのり) - 不可思議のカルテ', '小雪 - 红笔']:
    p = root / (name + '.lrc')
    raw = p.read_bytes()
    text = raw.decode('utf-8')  # 严格 UTF-8 校验
    lines = text.splitlines()
    re_ts = re.compile(r'^\[(\d{2}):(\d{2})\.(\d{2})\]\s*(.+)$')
    times, bad, bilingual = [], [], 0
    for i, l in enumerate(lines, 1):
        if not l.strip():
            continue
        m = re_ts.match(l)
        if not m:
            bad.append((i, l))
            continue
        times.append(int(m.group(1)) * 60 + int(m.group(2)) + int(m.group(3)) / 100)
        if '|' in l or '｜' in l:
            bilingual += 1
    mono = all(times[i] <= times[i + 1] for i in range(len(times) - 1))
    bom = raw[:3] == b'\xef\xbb\xbf'
    crlf = b'\r\n' in raw
    print(f'{name}: BOM={bom} CRLF={crlf} 行数={len(lines)} 时间戳={len(times)} 双语行={bilingual} 单调递增={mono} 异常={len(bad)} 末行={times[-1] if times else 0:.2f}s')
    if bad:
        print('  异常行:', bad[:3])
