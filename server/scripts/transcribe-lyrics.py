#!/usr/bin/env python3
r"""
方案 B：AI 强制生成歌词（当 LRCLIB 匹配不到时）。
用 faster-whisper 做语音识别，生成带时间轴的 .lrc 文件到音频同目录。
服务端 lyrics.js "本地 .lrc 优先"，生成后 App 自动读到。

依赖（本机已具备 faster_whisper）：
  pip install faster-whisper

用法：
  python scripts/transcribe-lyrics.py --dir "D:\xxx\music"          # 处理所有无 .lrc 的音频
  python scripts/transcribe-lyrics.py --dir ... --file "歌名.mp3"    # 只处理一个
  python scripts/transcribe-lyrics.py --dir ... --model small        # 指定模型(tiny/base/small/medium/large-v3)

注意：转录是"听到的词"，并非官方歌词，可能有识别误差；建议只对自己拥有/授权的音频使用。
"""
import argparse, os, sys
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("错误：未安装 faster-whisper。请运行: pip install faster-whisper")
    sys.exit(1)

AUDIO_EXT = {'.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav', '.wma', '.opus', '.mp4', '.m4b'}


def fmt_lrc_time(sec: float) -> str:
    m = int(sec // 60)
    s = sec - m * 60
    return f"[{m:02d}:{s:05.2f}]"


def transcribe_and_save(model, audio: Path):
    lrc = audio.with_suffix('.lrc')
    if lrc.exists():
        return 'skip', '已有 .lrc'
    # tuned 参数：关闭 VAD + 不做前文本条件，实测对长中文/日语混合曲目
    # 识别率远高于默认（如《02的爱恋》5 行 → 90 行）
    segments, _ = model.transcribe(
        str(audio), beam_size=5, language=None,
        vad_filter=False,
        condition_on_previous_text=False,
        initial_prompt="这是一首中文或日语歌曲，请转录歌词。",
    )
    lines = []
    for seg in segments:
        text = seg.text.strip().replace('\n', ' ')
        if text:
            lines.append(f"{fmt_lrc_time(seg.start)}{text}")
    if not lines:
        return 'miss', '未识别到语音'
    lrc.write_text('\n'.join(lines), encoding='utf-8')
    return 'ok', f'{len(lines)} 行'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True, help='曲库目录')
    ap.add_argument('--file', help='只处理指定文件名')
    ap.add_argument('--model', default='base', help='whisper 模型: tiny/base/small/medium/large-v3')
    args = ap.parse_args()

    root = Path(args.dir)
    if args.file:
        files = [root / args.file]
    else:
        files = [p for p in root.rglob('*') if p.suffix.lower() in AUDIO_EXT]

    print(f"模型: {args.model} | 待处理: {len(files)} 个文件")
    print("加载 Whisper 模型（首次会下载模型文件）...")
    model = WhisperModel(args.model, device='cpu', compute_type='int8')

    ok = skip = miss = 0
    for f in files:
        if not f.exists():
            print(f"[跳过] 不存在: {f.name}"); continue
        try:
            status, info = transcribe_and_save(model, f)
            if status == 'ok': ok += 1
            elif status == 'skip': skip += 1
            else: miss += 1
            print(f"[{status}] {f.name}: {info}")
        except Exception as e:
            miss += 1
            print(f"[错误] {f.name}: {e}")
    print(f"\n完成: 生成 {ok} / 跳过 {skip} / 失败 {miss}")


if __name__ == '__main__':
    main()
