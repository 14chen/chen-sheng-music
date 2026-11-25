import os
import urllib.request, urllib.error, sys, json

u = sys.argv[1] + "/api/tracks?source=local"
KEY = os.environ.get("ACCESS_KEY", "")

for label, headers in [("无口令", {}), ("带口令", {"X-Access-Key": KEY})]:
    r = urllib.request.Request(u, headers=headers)
    try:
        res = urllib.request.urlopen(r, timeout=25)
        data = res.read()
        print(label, res.status, "len", len(data))
    except urllib.error.HTTPError as e:
        print(label, e.code, e.read().decode("utf-8", "ignore")[:120])
