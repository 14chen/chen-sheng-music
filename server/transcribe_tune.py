import sys, time
sys.stdout.reconfigure(encoding="utf-8")
from faster_whisper import WhisperModel

audio = sys.argv[1]
model_size = sys.argv[2] if len(sys.argv) > 2 else "medium"
model = WhisperModel(model_size, device="cpu", compute_type="int8")
print(f"模型 {model_size} 加载完成，开始转录: {audio}", flush=True)
# 关闭 VAD，降低 no_speech 阈值，尝试捕捉更多歌词
segments, info = model.transcribe(
    audio, beam_size=5, language="zh",
    vad_filter=False,
    no_speech_threshold=0.9,
    condition_on_previous_text=False,
)
lines = []
for seg in segments:
    txt = seg.text.strip().replace("\n", " ")
    if txt:
        lines.append((seg.start, txt))
        print(f"[{seg.start:6.2f}] {txt}", flush=True)
out = audio.rsplit(".", 1)[0] + ".whisper2.txt"
with open(out, "w", encoding="utf-8") as f:
    for t, txt in lines:
        f.write(f"[{t:.2f}] {txt}\n")
print(f"\n保存 {out} 共 {len(lines)} 行", flush=True)
