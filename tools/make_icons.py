import os
from PIL import Image, ImageDraw

RES = "android/app/src/main/res"
AMBER = (255, 181, 69, 255)
AMBER_DIM = (214, 140, 40, 255)
DARK = (14, 11, 6, 255)


def gradient(size):
    img = Image.new("RGBA", (size, size), DARK)
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / size
        r = int(38 - 24 * t)
        g = int(28 - 17 * t)
        b = int(14 - 8 * t)
        d.line([(0, y), (size, y)], fill=(r, g, b, 255))
    return img


def logo(size, transparent=False):
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if not transparent:
        img.paste(gradient(S), (0, 0))
    d = ImageDraw.Draw(img)
    c = S / 2
    R = S * 0.30

    d.ellipse([c - R, c - R, c + R, c + R], outline=AMBER_DIM, width=int(S * 0.018))

    bar_len = S * 0.14
    bar_w = int(S * 0.032)
    gap = S * 0.055
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        d.line(
            [
                (c + dx * gap, c + dy * gap),
                (c + dx * (gap + bar_len), c + dy * (gap + bar_len)),
            ],
            fill=AMBER,
            width=bar_w,
        )

    r = S * 0.022
    d.ellipse([c - r, c - r, c + r, c + r], fill=(255, 226, 180, 255))

    d.pieslice(
        [c - R * 1.02, c - R * 1.02, c + R * 1.02, c + R * 1.02],
        40,
        140,
        fill=(196, 165, 110, 60),
    )
    return img.resize((size, size), Image.LANCZOS)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
fg_sizes = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

for dpi, s in sizes.items():
    base = logo(s)
    save(base, f"{RES}/mipmap-{dpi}/ic_launcher.png")

    mask = Image.new("L", (s * 4, s * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, s * 4, s * 4], fill=255)
    mask = mask.resize((s, s), Image.LANCZOS)
    rnd = base.copy()
    rnd.putalpha(mask)
    save(rnd, f"{RES}/mipmap-{dpi}/ic_launcher_round.png")

for dpi, s in fg_sizes.items():
    fg = logo(int(s * 0.62), transparent=True)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.paste(fg, ((s - fg.width) // 2, (s - fg.height) // 2), fg)
    save(canvas, f"{RES}/mipmap-{dpi}/ic_launcher_foreground.png")

print("icons written")
