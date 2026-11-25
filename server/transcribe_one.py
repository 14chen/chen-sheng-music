import sys, os, time
sys.stdout.reconfigure(encoding="utf-8")
from faster_whisper import WhisperModel

audio = sys.argv[1] if len(sys.argv) > 1 else r"D:\work\music-app\server\music\小雪 - 红笔.mp3"
model_size = sys.argv[2] if len(sys.argv) > 2 else "small"

print(f"加载模型 {model_size}（首次会下载）...", flush=True)
env = os.environ.copy()
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
t0 = time.time()
model = WhisperModel(model_size, device="cpu", compute_type="int8")
print(f"模型加载耗时 {time.time()-t0:.1f}s", flush=True)

print(f"转录: {audio}", flush=True)
segments, info = model.transcribe(audio, beam_size=5, vad_filter=True, language="zh")
print(f"语言: {info.language} 时长: {info.duration:.1f}s", flush=True)
lines = []
for seg in segments:
    txt = seg.text.strip().replace("\n", " ")
    if txt:
        lines.append((seg.start, txt))
        print(f"[{seg.start:6.2f}] {txt}", flush=True)

out = audio.rsplit(".", 1)[0] + ".whisper.txt"
with open(out, "w", encoding="utf-8") as f:
    for t, txt in lines:
        f.write(f"[{t:.2f}] {txt}\n")
print(f"\n保存 {out} 共 {len(lines)} 行", flush=True)
