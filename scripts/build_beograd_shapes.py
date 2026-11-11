"""Project RIK's 17 Belgrade municipality paths onto the dashboard map."""

import json
import re
from pathlib import Path

from shapely.affinity import affine_transform
from shapely.geometry import Polygon
from shapely.ops import unary_union


ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "sources/rik-beograd-map.js").read_text(encoding="utf-8")
source = source[source.index('{"width"'):source.rindex("}") + 1]
source = re.sub(r",\s*}", "}", source.replace("\t", r"\t"))
paths = json.loads(source)["paths"]
html = (ROOT / "index.html").read_text(encoding="utf-8")
base_path = re.search(r'<path id="rs-municipality-23" class="unit" d="([^"]+)"', html).group(1)
base_points = [tuple(map(float, pair)) for pair in re.findall(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", base_path)]
base = Polygon(base_points).buffer(0)


def parse_path(path):
    tokens = re.findall(r"[MCZ]|-?\d+(?:\.\d+)?", path)
    polygons = []
    points = []
    current = None
    index = 0
    while index < len(tokens):
        command = tokens[index]
        index += 1
        if command == "M":
            current = (float(tokens[index]), float(tokens[index + 1]))
            points = [current]
            index += 2
        elif command == "C":
            controls = [float(value) for value in tokens[index:index + 6]]
            index += 6
            p0, p1, p2, p3 = current, controls[0:2], controls[2:4], controls[4:6]
            for step in range(1, 6):
                t = step / 5
                points.append(((1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t*t*p2[0] + t**3*p3[0],
                               (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t*t*p2[1] + t**3*p3[1]))
            current = tuple(p3)
        elif command == "Z":
            polygon = Polygon(points).buffer(0)
            if not polygon.is_empty:
                polygons.append(polygon)
        else:
            raise ValueError(f"Unsupported map command {command}")
    return unary_union(polygons)


municipalities = {code: parse_path(record["path"]) for code, record in paths.items()}
if len(municipalities) != 17:
    raise ValueError(f"Expected 17 Belgrade municipalities, found {len(municipalities)}")
source_outline = unary_union(list(municipalities.values())).simplify(.5)
target_outline = base.simplify(.5)
sx = (base.bounds[2] - base.bounds[0]) / (source_outline.bounds[2] - source_outline.bounds[0])
sy = (base.bounds[3] - base.bounds[1]) / (source_outline.bounds[3] - source_outline.bounds[1])
start = [sx, 0, 0, sy,
         base.bounds[0] - sx * source_outline.bounds[0],
         base.bounds[1] - sy * source_outline.bounds[1]]


def objective(params):
    candidate = affine_transform(source_outline, params)
    return candidate.symmetric_difference(target_outline).area / target_outline.area


affine = start[:]
steps = [abs(sx) * .12, abs(sx) * .08, abs(sy) * .08, abs(sy) * .12,
         (base.bounds[2] - base.bounds[0]) * .08,
         (base.bounds[3] - base.bounds[1]) * .08]
score = objective(affine)
for _ in range(90):
    improved = False
    for i in range(6):
        for direction in (-1, 1):
            candidate = affine[:]
            candidate[i] += direction * steps[i]
            candidate_score = objective(candidate)
            if candidate_score < score:
                affine, score, improved = candidate, candidate_score, True
    if not improved:
        steps = [step * .5 for step in steps]
        if max(steps) < 1e-5:
            break
coverage = affine_transform(source_outline, affine)
print("Boundary fit (symmetric difference / base area):", f"{objective(affine):.2%}")
print("Coverage within base:", f"{coverage.intersection(base).area / base.area:.2%}")
print("Affine:", [round(float(x), 6) for x in affine])


def svg_path(geometry):
    polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
    rings = (ring for polygon in polygons if polygon.geom_type == "Polygon"
             for ring in (polygon.exterior, *polygon.interiors))
    return "".join("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in list(ring.coords)[:-1]) + "Z"
                   for ring in rings)


projected = {code: affine_transform(geometry, affine).intersection(base).buffer(0)
             for code, geometry in municipalities.items()}
remaining = base.difference(unary_union(list(projected.values())))
for distance in (.2, .4, .8, 1.6, 3.2, 6.4, 12.8):
    if remaining.area < .001:
        break
    for code in projected:
        addition = projected[code].buffer(distance).intersection(remaining)
        if not addition.is_empty:
            projected[code] = projected[code].union(addition).buffer(0)
            remaining = remaining.difference(addition)
if remaining.area >= .001:
    raise ValueError(f"Unassigned Belgrade map area: {remaining.area}")
output = []
for code, record in paths.items():
    geometry = projected[code].simplify(.07)
    output.append({"id": "beograd-" + code, "name": record["name"],
                   "path": svg_path(geometry)})
if any(not item["path"] for item in output):
    raise ValueError("One or more Belgrade municipality shapes are empty")
(ROOT / "data/beograd-shapes.js").write_text(
    "window.beogradShapes = " + json.dumps(output, ensure_ascii=False) + ";\n", encoding="utf-8")
print("Wrote", len(output), "municipality shapes")
