"""Prepare the downloadable table matrix from the site's source data."""

import json
from pathlib import Path

from export_schema import COLUMNS, REGIONS, read_js_array


data = [entry for entry in read_js_array("data/data.js") if entry["name"] != "Beograd"]
data += read_js_array("data/beograd-results.js")
kosovo = read_js_array("data/kosovo-results.js")
data += [entry for entry in kosovo if entry.get("mapped")]
data += [entry for entry in kosovo if not entry.get("mapped")]
data += read_js_array("data/special-results.js")
data.sort(key=lambda entry: entry["name"].casefold())

age_source = (Path(__file__).resolve().parents[1] / "data/age-groups-2022.js").read_text(encoding="utf-8")
age_groups = json.loads(age_source[age_source.index("{"):age_source.rindex("}") + 1])
age_fields = {"age0_14Share": "age0_14", "youthShare": "age15_29", "age30_44Share": "age30_44",
              "age45_64Share": "age45_64", "age65PlusShare": "age65Plus"}

for entry in data:
    census = age_groups.get(entry["name"])
    entry["censusPopulation2022"] = census["total"] if census else None
    for field, group in age_fields.items():
        entry[field] = 100 * census[group] / census["total"] if census else None
    valid = entry.get("validVotes")
    sns = entry.get("snsVotes")
    entry["snsShare"] = 100 * sns / valid if sns is not None and valid else None
    entry["voteDifference"] = entry["listVotes"] - sns if sns is not None else None

rows = [["Br."] + [label for _, label, _ in COLUMNS]]
for index, entry in enumerate(data, 1):
    values = [index]
    for key, _, kind in COLUMNS:
        value = entry.get(key)
        if key == "region":
            value = REGIONS.get(value, value)
        elif key == "district" and entry.get("region") in ("33000", "55001"):
            value = entry["name"]
        if kind == "percent" and value is not None:
            value /= 100
        values.append(value)
    rows.append(values)


def total(key):
    return sum(entry.get(key) or 0 for entry in data)


totals = {key: total(key) for key in (
    "listVotes", "snsVotes", "validVotes", "votersAttended",
    "registeredVoters", "stations", "population", "areaKm2",
)}
valid, registered = totals["validVotes"], totals["registeredVoters"]
ballots = total("ballotsInBox")
totals["votes"] = 100 * totals["listVotes"] / valid if valid else None
totals["snsShare"] = 100 * totals["snsVotes"] / valid if valid else None
totals["voteDifference"] = totals["listVotes"] - totals["snsVotes"]
totals["invalidShare"] = 100 * total("invalidVotes") / ballots if ballots else None
totals["turnout"] = 100 * totals["votersAttended"] / registered if registered else None
totals["density"] = totals["population"] / totals["areaKm2"] if totals["areaKm2"] else None
for key in (*age_fields, "higherEducationShare"):
    weight_key = "population" if key == "higherEducationShare" else "censusPopulation2022"
    available = [entry for entry in data if entry.get(weight_key) is not None and entry.get(key) is not None]
    weight = sum(entry[weight_key] for entry in available)
    totals[key] = sum(entry[weight_key] * entry[key] for entry in available) / weight if weight else None
total_row = ["Σ", f"Ukupno ({len(data)})"]
for key, _, kind in COLUMNS[1:]:
    value = totals.get(key)
    if kind == "percent" and value is not None:
        value /= 100
    total_row.append(value)
rows.append(total_row)

EXPECTED_UNIT_COUNT = 185
if len(data) != EXPECTED_UNIT_COUNT:
    raise ValueError(f"Unexpected election coverage: {len(data)} units, expected {EXPECTED_UNIT_COUNT}")
if any(len(row) != len(COLUMNS) + 1 for row in rows):
    raise ValueError("Unexpected export column count")
print(json.dumps(rows, ensure_ascii=False, allow_nan=False))
