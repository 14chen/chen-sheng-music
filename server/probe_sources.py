import json, urllib.request, ssl

ctx = ssl.create_default_context()
tests = {
    "iTunes Search": "https://itunes.apple.com/search?term=beatles&entity=song&limit=2&country=us",
    "Deezer": "https://api.deezer.com/search?q=beatles&limit=2",
    "Internet Archive": "https://archive.org/advancedsearch.php?q=mediatype%3Aaudio+AND+beatles&fl%5B%5D=identifier&fl%5B%5D=title&rows=2&page=1&output=json",
    "MusicBrainz": "https://musicbrainz.org/ws/2/recording/?query=beatles&fmt=json&limit=2",
}

for name, url in tests.items():
    req = urllib.request.Request(url, headers={"User-Agent": "MyMusicApp/1.0 (test)"})
    try:
        with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
            data = r.read(400).decode("utf-8", "ignore")
            print(f"[OK] {name} HTTP {r.status}")
            print("     ", data[:300].replace("\n", " "))
    except Exception as e:
        print(f"[FAIL] {name}: {type(e).__name__}: {e}")
