"""Prepare the downloadable table matrix from the site's source data."""

import json

from build_export_xlsx import COLUMNS, REGIONS, read_js_array


data = [entry for entry in read_js_array("data.js") if entry["name"] != "Beograd"]
data += read_js_array("beograd-results.js")
kosovo = read_js_array("kosovo-results.js")
data += [entry for entry in kosovo if entry.get("mapped")]
data += [entry for entry in kosovo if not entry.get("mapped")]
data += read_js_array("special-results.js")
data.sort(key=lambda entry: entry["name"].casefold())

for entry in data:
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
total_row = ["Σ", f"Ukupno ({len(data)})"]
for key, _, kind in COLUMNS[1:]:
    value = totals.get(key)
    if kind == "percent" and value is not None:
        value /= 100
    total_row.append(value)
rows.append(total_row)

if len(rows) != 187 or any(len(row) != 21 for row in rows):
    raise ValueError("Unexpected export table shape")
print(json.dumps(rows, ensure_ascii=False, allow_nan=False))
