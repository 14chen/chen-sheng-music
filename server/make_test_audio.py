import wave, struct, math, os

out = r"D:\work\music-app\server\music\测试音-440Hz.wav"
os.makedirs(os.path.dirname(out), exist_ok=True)
rate = 44100
with wave.open(out, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    frames = bytearray()
    for i in range(rate * 5):
        val = int(8000 * math.sin(2 * math.pi * 440 * i / rate))
        frames += struct.pack("<h", val)
    w.writeframes(bytes(frames))
print("已生成", out, os.path.getsize(out), "bytes")
