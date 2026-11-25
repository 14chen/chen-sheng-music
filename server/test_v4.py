import os
import urllib.request, urllib.error, json

BASE = "http://127.0.0.1:18080"
H = {"X-Access-Key": os.environ.get("ACCESS_KEY", "")}


def get(path):
    return urllib.request.urlopen(urllib.request.Request(BASE + path, headers=H), timeout=30)


print("=== ccMixter 搜索 ===")
r = json.load(get("/api/tracks?source=ccmixter&q=ambient&limit=3"))
print("总数:", r["total"])
if r["items"]:
    t = r["items"][0]
    print("曲目:", t["title"][:50], "| 作者:", t["artist"][:30], "| 许可:", t.get("license"))
    print("streamUrl:", t["streamUrl"][:80])

    print("\n=== 代理播放（前 1KB）===")
    pr = urllib.request.urlopen(urllib.request.Request(BASE + t["streamUrl"], headers=H), timeout=30)
    print("HTTP", pr.status, "Content-Type:", pr.headers.get("Content-Type"))
    print("前16字节:", pr.read(16))

    print("\n=== 音质/下载 ===")
    q = json.load(get(f"/api/download/qualities?id={t['id']}"))
    print("音质:", q["qualities"])
    d = json.load(get(f"/api/download?id={t['id']}&quality=original"))
    print("下载类型:", d.get("type"), "| 文件名:", str(d.get("filename"))[:60])

print("\n=== 自定义歌词 ===")
tid = "test:custom:song"
body = json.dumps({"id": tid, "text": "[00:00.00]第一行\n[00:05.00]第二行", "synced": True}).encode()
rq = urllib.request.Request(BASE + "/api/lyrics/custom", data=body, headers={**H, "Content-Type": "application/json"}, method="POST")
print("保存:", urllib.request.urlopen(rq, timeout=20).read().decode())
ly = json.load(get(f"/api/lyrics?id={tid}&title=test&artist=test"))
print("读取: 来源=", ly.get("source"), "行数=", len(ly.get("lines", [])))
rq = urllib.request.Request(BASE + f"/api/lyrics/custom?id={tid}", headers=H, method="DELETE")
print("删除:", urllib.request.urlopen(rq, timeout=20).read().decode())
