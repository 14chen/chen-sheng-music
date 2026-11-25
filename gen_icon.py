"""绘制「橙声君」App 图标：橙子 + 声音波形。生成 Android 各密度 mipmap 与 Web icons。"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(r"D:\work\music-app\app")


def make_icon(size: int) -> Image.Image:
    S = 1024  # 超采样画布
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 圆角方形背景（橙色渐变近似：暖橙底）
    bg = (255, 140, 30, 255)
    d.rounded_rectangle([40, 40, S - 40, S - 40], radius=230, fill=bg)

    # 橙子主体（圆形，略带高光）
    cx, cy, r = S // 2, int(S * 0.56), int(S * 0.30)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 245, 230, 255))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(230, 120, 20, 255), width=18)
    # 高光
    d.ellipse([cx - r + 50, cy - r + 50, cx - r + 220, cy - r + 200], fill=(255, 255, 255, 120))

    # 绿叶
    d.ellipse([cx - 20, cy - r - 120, cx + 130, cy - r + 10], fill=(60, 175, 90, 255))
    d.line([cx, cy - r + 20, cx + 30, cy - r - 40], fill=(40, 120, 60, 255), width=16)

    # 声音波形（白色竖条，中间高两边低）
    bars = [
        (cx - 170, 120), (cx - 110, 220), (cx - 55, 320),
        (cx, 400), (cx + 55, 300), (cx + 110, 200), (cx + 170, 110),
    ]
    for bx, bh in bars:
        top = cy - bh // 2
        bot = cy + bh // 2
        d.rounded_rectangle([bx - 18, top, bx + 18, bot], radius=18, fill=(255, 255, 255, 240))

    return img.resize((size, size), Image.LANCZOS)


# Android mipmap（密度 -> 尺寸）
mipmap = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
for folder, sz in mipmap.items():
    path = ROOT / "android" / "app" / "src" / "main" / "res" / folder
    path.mkdir(parents=True, exist_ok=True)
    make_icon(sz).save(path / "ic_launcher.png")
    # adaptive icon 前景也用同一张
    make_icon(sz).save(path / "ic_launcher_foreground.png")
    print("写入", path / "ic_launcher.png")

# Web icons
web = ROOT / "web" / "icons"
web.mkdir(parents=True, exist_ok=True)
for name, sz in [("Icon-192.png", 192), ("Icon-512.png", 512),
                 ("Icon-maskable-192.png", 192), ("Icon-maskable-512.png", 512)]:
    make_icon(sz).save(web / name)
    print("写入", web / name)

# favicon
make_icon(64).save(ROOT / "web" / "favicon.png")
print("写入 favicon")
