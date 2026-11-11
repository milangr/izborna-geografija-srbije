"""Build the site favicon with Pillow: python scripts/build_favicon.py."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SIZE = 256
SCALE = 4
image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)


def box(coords):
    return tuple(round(value * SCALE) for value in coords)


draw.rounded_rectangle(box((8, 8, 248, 248)), radius=52 * SCALE, fill="#18283a")
draw.ellipse(box((73, 38, 183, 148)), fill="#ffffff")
draw.polygon([box((80, 121))[:2], box((176, 121))[:2], box((128, 218))[:2]], fill="#ffffff")
draw.ellipse(box((102, 67, 154, 119)), fill="#4f9eea")

image = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
image.save(ROOT / "assets/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (256, 256)])
