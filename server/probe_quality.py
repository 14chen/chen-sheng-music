import urllib.request, ssl

ctx = ssl.create_default_context()
tests = {
    "ccMixter (CC音乐,免key)": "http://ccmixter.org/api/query?f=json&limit=2&tags=instrumental",
    "Jamendo (需免费key)": "https://api.jamendo.com/v3.0/tracks/?client_id=test&format=json&limit=1",
    "Wikimedia Commons": "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=filetype:audio%20jazz&gsrnamespace=6&gsrlimit=2&prop=imageinfo&iiprop=url",
    "Musopen": "https://musopen.org/music/",
    "Free Music Archive": "https://freemusicarchive.org/api/",
}
for name, url in tests.items():
    req = urllib.request.Request(url, headers={"User-Agent": "MyMusicApp/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            d = r.read(250).decode("utf-8", "ignore")
            print(f"[OK] {name} HTTP {r.status}: {d[:180]}")
    except Exception as e:
        print(f"[FAIL] {name}: {type(e).__name__}: {str(e)[:100]}")
