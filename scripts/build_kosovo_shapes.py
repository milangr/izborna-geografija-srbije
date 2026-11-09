"""Project the RIK Kosovo municipality map onto the dashboard's SVG map."""

import json
import math
import re
from pathlib import Path

import numpy as np
from shapely.affinity import affine_transform
from shapely.geometry import Polygon, shape
from shapely.ops import transform, unary_union


ROOT = Path(__file__).resolve().parents[1]
rik_source = (ROOT / "rik-kosovo-map.js").read_text(encoding="utf-8")
rik_source = rik_source[rik_source.index('{"width"'):rik_source.rindex("}") + 1]
rik_source = re.sub(r",\s*}", "}", rik_source.replace("\t", r"\t"))
rik = json.loads(rik_source)["paths"]
geo = json.loads((ROOT / "kosovo-adm2-source.geojson").read_text(encoding="utf-8"))
html = (ROOT / "index.html").read_text(encoding="utf-8")
base_path = re.search(r'<path class="unit missing" d="([^"]+)"', html).group(1)
base_values = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", base_path)]
base = Polygon(zip(base_values[::2], base_values[1::2]))


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
            p0 = current
            p1, p2, p3 = controls[0:2], controls[2:4], controls[4:6]
            for step in range(1, 6):
                t = step / 5
                x = (1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t*t*p2[0] + t**3*p3[0]
                y = (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t*t*p2[1] + t**3*p3[1]
                points.append((x, y))
            current = tuple(p3)
        elif command == "Z":
            polygon = Polygon(points).buffer(0)
            if not polygon.is_empty:
                polygons.append(polygon)
        else:
            raise ValueError(f"Unsupported RIK map command {command}")
    return unary_union(polygons)


def project(lon, lat, z=None):
    mercator = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return 74.58294807 * lon - 1361.5514211, -4273.07813055 * mercator + 3901.01543709


reference = {
    feature["properties"]["shapeName"].removeprefix("Municipality of "): transform(project, shape(feature["geometry"]))
    for feature in geo["features"]
}
anchors = {
    "90018": "Viti", "90026": "Vushtrri", "90042": "Gjilan", "90093": "Zubin Potok",
    "90107": "Istog", "90123": "Klina", "90131": "Fushë Kosovë", "90140": "Kamenica",
    "90158": "Leposaviq", "90166": "Lipjan", "90182": "Novobërdë", "90204": "Obiliq",
    "90212": "Rahovec", "90239": "Peja", "90255": "Prizren", "90263": "Pristina",
    "90271": "Skenderaj", "90301": "Ferizaj", "90328": "Shtërpcë", "90352": "Zveçan",
}
source_polygons = {code: parse_path(record["path"]) for code, record in rik.items()}
source_centers = np.array([source_polygons[code].centroid.coords[0] for code in anchors])
target_centers = np.array([reference[name].centroid.coords[0] for name in anchors.values()])
matrix = np.linalg.lstsq(np.c_[source_centers, np.ones(len(anchors))], target_centers, rcond=None)[0]
residual = target_centers - np.c_[source_centers, np.ones(len(anchors))] @ matrix
print("Anchor RMS error:", np.sqrt(np.mean(np.sum(residual * residual, axis=1))))
affine = [matrix[0, 0], matrix[1, 0], matrix[0, 1], matrix[1, 1], matrix[2, 0], matrix[2, 1]]


def rings(geometry):
    polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
    for polygon in polygons:
        if polygon.geom_type != "Polygon":
            continue
        yield polygon.exterior
        yield from polygon.interiors


def svg_path(geometry):
    return "".join("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in list(ring.coords)[:-1]) + "Z"
                   for ring in rings(geometry))


output = []
for code, record in rik.items():
    projected = affine_transform(source_polygons[code], affine).intersection(base).buffer(0).simplify(.12)
    output.append({"id": "kosovo-" + code if code.isdigit() and code in anchors | {"90298": "Mitrovica", "90336": "Gora"} else None,
                   "name": record["name"], "path": svg_path(projected)})
if len(output) != 29 or any(not item["path"] for item in output):
    raise ValueError("RIK map geometry coverage is incomplete")
coverage = unary_union([affine_transform(polygon, affine) for polygon in source_polygons.values()])
print("RIK map coverage inside existing map:", f"{coverage.intersection(base).area / base.area:.2%}")
print("RIK map area relative to existing map:", f"{coverage.area / base.area:.2%}")
print("RIK map outside existing map:", f"{coverage.difference(base).area / coverage.area:.2%}")
(ROOT / "kosovo-shapes.js").write_text(
    "window.kosovoShapes = " + json.dumps(output, ensure_ascii=False) + ";\n", encoding="utf-8"
)
print(f"Wrote {sum(item['id'] is not None for item in output)} result shapes and {sum(item['id'] is None for item in output)} unreported shapes")
