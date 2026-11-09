"""Build the 1200×630 social preview from the project's source boundaries."""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
SIZE = (1200, 630)
MAP_BOX = (710, 40, 1150, 590)
SOURCES = (
    ROOT / "serbia-adm2-source.geojson",
    ROOT / "kosovo-adm2-source.geojson",
)


def rings(geometry):
    coordinates = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        return coordinates[:1]
    if geometry["type"] == "MultiPolygon":
        return [polygon[0] for polygon in coordinates]
    return []


features = []
for source in SOURCES:
    features.extend(json.loads(source.read_text(encoding="utf-8"))["features"])

all_rings = [ring for feature in features for ring in rings(feature["geometry"])]
points = [(lon * 0.72, lat) for ring in all_rings for lon, lat in ring]
min_x, max_x = min(x for x, _ in points), max(x for x, _ in points)
min_y, max_y = min(y for _, y in points), max(y for _, y in points)
left, top, right, bottom = MAP_BOX
scale = min((right - left) / (max_x - min_x), (bottom - top) / (max_y - min_y))
offset_x = (left + right - scale * (min_x + max_x)) / 2
offset_y = (top + bottom + scale * (min_y + max_y)) / 2


def project(point):
    lon, lat = point
    return (offset_x + scale * lon * 0.72, offset_y - scale * lat)


image = Image.new("RGB", SIZE, "#eef2f7")
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((26, 26, 1174, 604), radius=30, fill="#ffffff")
draw.rounded_rectangle((690, 42, 1155, 588), radius=25, fill="#f4f7fb")

palette = ("#cde5fb", "#91c3f4", "#4f9eea")
for index, feature in enumerate(features):
    for ring in rings(feature["geometry"]):
        polygon = [project(point) for point in ring]
        if len(polygon) >= 3:
            draw.polygon(polygon, fill=palette[(index * 7 + index // 5) % 3])
            draw.line(polygon + polygon[:1], fill="#577694", width=1, joint="curve")

font_dir = Path("C:/Windows/Fonts")
bold = next(
    path for path in (font_dir / "segoeuib.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
    if path.exists()
)
regular = next(
    path for path in (font_dir / "segoeui.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
    if path.exists()
)
title = ImageFont.truetype(str(bold), 62)
subtitle = ImageFont.truetype(str(regular), 30)
label = ImageFont.truetype(str(bold), 24)

draw.rounded_rectangle((75, 79, 471, 119), radius=20, fill="#dce9f6")
draw.text((94, 87), "PARLAMENTARNI IZBORI 2026", font=label, fill="#244d73")
draw.text((74, 174), "Izborna", font=title, fill="#18283a")
draw.text((74, 246), "geografija Srbije", font=title, fill="#18283a")
draw.rounded_rectangle((75, 348, 158, 356), radius=4, fill="#4f9eea")
draw.text((74, 394), "Interaktivna mapa rezultata", font=subtitle, fill="#4c6074")
draw.text((74, 436), "i demografskih pokazatelja", font=subtitle, fill="#4c6074")
draw.text((74, 478), "po opštinama i gradovima", font=subtitle, fill="#4c6074")
draw.text((74, 556), "milangr.github.io/izborna-geografija-srbije", font=ImageFont.truetype(str(regular), 19), fill="#4c6074")

image.save(ROOT / "preview.png", optimize=True)
