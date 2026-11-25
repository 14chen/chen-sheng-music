import sys, time
sys.stdout.reconfigure(encoding="utf-8")
from faster_whisper import WhisperModel

audio = sys.argv[1]
model = WhisperModel("small", device="cpu", compute_type="int8")
print("small 加载完成", flush=True)
# 关闭 VAD + 不做前文本条件，避免长音频漏识别
segments, info = model.transcribe(
    audio, beam_size=5, language="zh",
    vad_filter=False,
    condition_on_previous_text=False,
    initial_prompt="这是一首中文流行歌曲，请转录歌词。",
)
lines = []
for seg in segments:
    txt = seg.text.strip().replace("\n", " ")
    if txt:
        lines.append((seg.start, txt))
        print(f"[{seg.start:6.2f}] {txt}", flush=True)
out = audio.rsplit(".", 1)[0] + ".whisper3.txt"
with open(out, "w", encoding="utf-8") as f:
    for t, txt in lines:
        f.write(f"[{t:.2f}] {txt}\n")
print(f"\n保存 {out} 共 {len(lines)} 行", flush=True)
