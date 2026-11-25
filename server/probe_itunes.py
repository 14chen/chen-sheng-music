import json, urllib.request

url = "https://itunes.apple.com/search?term=beatles&entity=song&limit=1&country=us"
r = urllib.request.Request(url, headers={"User-Agent": "MyMusicApp/1.0"})
d = json.load(urllib.request.urlopen(r, timeout=20))["results"][0]
for k in ["trackName", "artistName", "collectionName", "previewUrl",
          "trackTimeMillis", "artworkUrl100", "primaryGenreName"]:
    print(k, "=", str(d.get(k))[:200])
