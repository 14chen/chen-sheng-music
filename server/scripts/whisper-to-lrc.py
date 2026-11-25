#!/usr/bin/env python3
r"""
把 faster-whisper 转录输出（[秒] 文本，每行）转成标准 .lrc（[mm:ss.xx] 文本）。
用法：
  python scripts/whisper-to-lrc.py "音乐/小雪 - 红笔.whisper.txt"
输出同名 .lrc，与音频放在一起，App 自动读取。
"""
import sys, re
from pathlib import Path

def fmt(sec: float) -> str:
    m = int(sec // 60)
    s = sec - m * 60
    return f"[{m:02d}:{s:05.2f}]"

def main():
    src = Path(sys.argv[1])
    text = src.read_text(encoding="utf-8")
    out_lines = []
    for line in text.splitlines():
        m = re.match(r"\[(\d+\.?\d*)\]\s*(.*)", line.strip())
        if not m:
            continue
        sec = float(m.group(1))
        body = m.group(2).strip()
        if not body:
            continue
        out_lines.append(f"{fmt(sec)}{body}")
    if not out_lines:
        print("未解析到任何歌词行")
        sys.exit(1)
    # 去掉 .whisper*.txt 后缀，生成与音频同名的 .lrc
    import re
    stem = re.sub(r"\.whisper\d*\.txt$", "", src.name)
    stem = re.sub(r"\.whisper\.txt$", "", stem)
    dst = src.with_name(stem + ".lrc")
    dst.write_text("\n".join(out_lines), encoding="utf-8")
    print(f"写入 {dst} 共 {len(out_lines)} 行")

if __name__ == "__main__":
    main()
