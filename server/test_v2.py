import os
import urllib.request, urllib.error, urllib.parse, json

BASE = "http://127.0.0.1:18080"
KEY = os.environ.get("ACCESS_KEY", "")


def req(path, key=False):
    h = {"User-Agent": "test"}
    if key:
        h["X-Access-Key"] = KEY
    r = urllib.request.Request(BASE + path, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


print("=== 认证测试 ===")
code, body = req("/api/tracks?source=local")
print("无口令:", code, body[:80])
code, body = req("/api/tracks?source=local", key=True)
print("带口令:", code, body[:120])

print("\n=== 音质档位 ===")
tracks = json.loads(req("/api/tracks?source=local", key=True)[1])
if tracks["items"]:
    tid = tracks["items"][0]["id"]
    code, body = req(f"/api/download/qualities?id={tid}", key=True)
    print(code, body.decode("utf-8", "ignore")[:300])

    print("\n=== 下载 128k (前 16 字节) ===")
    code, body = req(f"/api/download?id={tid}&quality=128k", key=True)
    print("HTTP", code, "大小", len(body), "头", body[:16])

    print("\n=== 歌词 ===")
    t = tracks["items"][0]
    q = urllib.parse.urlencode({"id": tid, "title": t["title"], "artist": t["artist"]})
    code, body = req(f"/api/lyrics?{q}", key=True)
    d = json.loads(body)
    print("来源:", d.get("source"), "行数:", len(d.get("lines", [])), "同步:", d.get("synced"))
else:
    print("曲库为空，跳过")
