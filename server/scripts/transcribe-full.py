#!/usr/bin/env python3
"""完整转录音频为带精确时间轴的 .lrc（词级时间戳，按语义分行）。
仅用于用户自己拥有/授权的音频文件。
用法: python transcribe-full.py <audio> [model] [--overwrite]
"""
import sys, os, re
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from faster_whisper import WhisperModel

audio = Path(sys.argv[1])
model_name = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else 'medium'
overwrite = '--overwrite' in sys.argv
lang = 'zh'
if '--lang' in sys.argv:
    lang = sys.argv[sys.argv.index('--lang') + 1]
out = audio.with_suffix('.lrc')
if out.exists() and not overwrite:
    print(f'已有 {out.name}，加 --overwrite 覆盖'); sys.exit(0)

print(f'加载模型 {model_name}...', flush=True)
model = WhisperModel(model_name, device='cpu', compute_type='int8')
segments, info = model.transcribe(
    str(audio), beam_size=5, language=lang,
    vad_filter=False, condition_on_previous_text=False,
    word_timestamps=True,
    initial_prompt='这是一首中文流行歌曲，请逐字转录歌词，不要翻译。',
)
print(f'音频时长 {info.duration:.1f}s', flush=True)

def lrc_time(sec):
    m = int(sec // 60); s = sec - m * 60
    return f'[{m:02d}:{s:05.2f}]'

lines = []
for seg in segments:
    words = getattr(seg, 'words', None) or []
    if words:
        # 用词级时间戳：按标点/长度(<=16字)切分为行，每行取首词时间
        state = {'buf': [], 'start': None}
        def flush():
            buf = state['buf']
            if not buf: return
            text = ''.join(w.word for w in buf).strip()
            text = re.sub(r'\s+', ' ', text)
            if text and state['start'] is not None and len(text) >= 2:
                lines.append((state['start'], text))
            state['buf'], state['start'] = [], None
        for w in words:
            t = w.word.strip()
            if not t: continue
            if state['start'] is None: state['start'] = w.start
            state['buf'].append(w)
            cur = ''.join(x.word for x in state['buf'])
            if re.search(r'[，。！？；,.!?;、…]', t) or len(re.sub(r'\s', '', cur)) >= 16:
                flush()
        flush()
    else:
        text = seg.text.strip().replace('\n', ' ')
        if text: lines.append((seg.start, text))

# 去重（相邻重复短句常见于副歌，保留但间隔>0.3s）
result = []
for t, txt in lines:
    txt = txt.strip()
    if not txt: continue
    if result and abs(t - result[-1][0]) < 0.3:
        continue
    result.append((t, txt))

out.write_text('\n'.join(f'{lrc_time(t)}{txt}' for t, txt in result), encoding='utf-8')
print(f'保存 {out} 共 {len(result)} 行，末行 {result[-1][0] if result else 0:.2f}s', flush=True)
