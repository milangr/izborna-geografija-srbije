"""Build one map outline per statistical region from the existing municipality paths."""

import json
import re
from collections import defaultdict
from pathlib import Path

from shapely.geometry import Polygon
from shapely.ops import unary_union


ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "data/data.js").read_text(encoding="utf-8")
entries = json.loads(source.split("window.municipalityData = ", 1)[1].strip().rstrip(";"))
html = (ROOT / "index.html").read_text(encoding="utf-8")
paths = dict(re.findall(r'<path id="(rs-municipality-\d+)" class="unit" d="([^"]+)"', html))
if len(paths) != len(entries):
    raise ValueError("Municipality paths and data records do not match")

regional = defaultdict(list)
for entry in entries:
    for subpath in re.findall(r"M([^Z]+)Z", paths[entry["id"]]):
        values = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", subpath)]
        polygon = Polygon(zip(values[::2], values[1::2]))
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        regional[entry["region"]].append(polygon)


def rings(geometry):
    polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
    for polygon in polygons:
        yield polygon.exterior
        yield from polygon.interiors


def svg_path(geometry):
    parts = []
    for ring in rings(geometry):
        points = list(ring.coords)[:-1]
        parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in points) + "Z")
    return "".join(parts)


result = {}
for code, polygons in regional.items():
    union = unary_union(polygons)
    result[code] = svg_path(union)
    print(f"{code}: {len(polygons)} shapes, {len(list(rings(union)))} boundary rings")

(ROOT / "data/region-outlines.js").write_text(
    "window.regionOutlines = " + json.dumps(result, ensure_ascii=False) + ";\n", encoding="utf-8"
)
