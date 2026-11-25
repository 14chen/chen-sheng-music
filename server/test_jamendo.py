import os
import urllib.request, json

BASE = "http://127.0.0.1:18080"
H = {"X-Access-Key": os.environ.get("ACCESS_KEY", "")}


def get(path, timeout=40):
    return urllib.request.urlopen(urllib.request.Request(BASE + path, headers=H), timeout=timeout)


print("=== Jamendo 搜索 'jazz' ===")
r = json.load(get("/api/tracks?source=jamendo&q=jazz&limit=3"))
print("总数:", r["total"], "返回:", len(r["items"]))
for t in r["items"][:3]:
    print("  -", t["title"][:45], "|", t["artist"][:25], "| 音质字段:", t.get("mime"))

if r["items"]:
    t = r["items"][0]
    print("\n=== 音质档位 ===")
    q = json.load(get(f"/api/download/qualities?id={t['id']}"))
    print(q["qualities"])

    print("\n=== 下载（Jamendo 官方直链）===")
    d = json.load(get(f"/api/download?id={t['id']}&quality=320k"))
    print("类型:", d.get("type"), "| 音质:", d.get("quality"))
    print("地址:", str(d.get("streamUrl"))[:110])

    print("\n=== 播放直链可达性 ===")
    if t.get("streamUrl"):
        try:
            res = urllib.request.urlopen(urllib.request.Request(t["streamUrl"], headers={"User-Agent": "Mozilla/5.0"}), timeout=30)
            print("HTTP", res.status, "Content-Type:", res.headers.get("Content-Type"))
            print("前字节:", res.read(8))
        except Exception as e:
            print("播放失败:", type(e).__name__, str(e)[:120])
