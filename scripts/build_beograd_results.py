"""Create 17 Belgrade municipality records from RIK XLSX and RZS 2025 HTML.

Usage: python scripts/build_beograd_results.py path/to/rik-results.xlsx
"""

import html
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

from add_districts import source_rows
from add_invalid_ballots import TRANSLATION, key


ROOT = Path(__file__).resolve().parents[1]
MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
FIELDS = ("upisani_biraci", "glasali_biraci", "listici_u_kutiji",
          "vazeci_glasovi", "nevazeci_listici", "lista_1", "lista_3")
# RZS Statistical Yearbook 2025, Table 20.1 (total area in 2024, km2).
# https://publikacije.stat.gov.rs/G2025/pdf/G20252058.pdf
OFFICIAL_AREA_KM2 = {
    "Barajevo": 213, "Voždovac": 148, "Vračar": 3, "Grocka": 300,
    "Zvezdara": 31, "Zemun": 150, "Lazarevac": 383, "Mladenovac": 339,
    "Novi Beograd": 41, "Obrenovac": 410, "Palilula (Beograd)": 451,
    "Rakovica": 30, "Savski venac": 14, "Sopot": 271,
    "Stari grad": 5, "Surčin": 288, "Čukarica": 157,
}
if sum(OFFICIAL_AREA_KM2.values()) != 3234:
    raise ValueError("RZS Belgrade municipality areas do not sum to the city area")


def rzs_2025():
    source = (ROOT / "sources/rzs-population-2025-source.html").read_text(encoding="utf-8")
    result = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", source, re.I | re.S):
        cells = re.findall(r'<td class="table-(?:label|data)"[^>]*>(.*?)</td>', row, re.I | re.S)
        if len(cells) != 10:
            continue
        values = [html.unescape(re.sub(r"<[^>]+>", "", cell)).strip() for cell in cells]
        if values[1].isdigit() and values[4].isdigit():
            result[key(values[0])] = (int(values[1]), int(values[4]))
    return result


def census_rows(path, wanted):
    result = {}
    with zipfile.ZipFile(path) as book:
        strings = ET.fromstring(book.read("xl/sharedStrings.xml"))
        shared = ["".join(node.text or "" for node in item.iter(MAIN + "t"))
                  for item in strings.findall(MAIN + "si")]
        sheet = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))
        for row in sheet.find(MAIN + "sheetData").findall(MAIN + "row"):
            cells = {}
            for cell in row.findall(MAIN + "c"):
                value = cell.find(MAIN + "v")
                if value is None:
                    continue
                text = shared[int(value.text)] if cell.get("t") == "s" else value.text
                cells[re.match(r"[A-Z]+", cell.get("r")).group()] = text
            name = key(cells.get("A", ""))
            if name in wanted and name not in result and cells.get("B") == "С":
                result[name] = cells
    if result.keys() != wanted:
        raise ValueError(f"Missing census municipalities: {wanted - result.keys()}")
    return result


def main(source_path):
    records = defaultdict(list)
    for row in source_rows(source_path):
        if row["sifra_okruga_regiona"].startswith("RS11/"):
            records[row["sifra_opstine"]].append(row)
    shapes_source = (ROOT / "data/beograd-shapes.js").read_text(encoding="utf-8")
    shapes = json.loads(shapes_source.split("window.beogradShapes = ", 1)[1].strip().rstrip(";"))
    shape_by_code = {shape["id"].split("-", 1)[1]: shape for shape in shapes}
    if len(records) != 17 or records.keys() != shape_by_code.keys():
        raise ValueError("RIK election rows and map shapes do not cover the same 17 municipalities")
    population = rzs_2025()
    wanted = {key(next(iter({row["opstina"] for row in rows})).removeprefix(
        "Градска општина ").split(" (")[0]) for rows in records.values()}
    ages = census_rows(ROOT / "sources/rzs-age-2022-source.xlsx", wanted)
    education = census_rows(ROOT / "sources/rzs-education-2022-source.xlsx", wanted)
    entries = []
    for code, rows in sorted(records.items()):
        names = {row["opstina"] for row in rows}
        if len(names) != 1:
            raise ValueError(f"Conflicting names for {code}: {names}")
        name = next(iter(names)).removeprefix("Градска општина ").lower().translate(TRANSLATION).title()
        name = {"Savski Venac": "Savski venac", "Stari Grad": "Stari grad"}.get(name, name)
        pop, age65 = population[key(name)]
        census_key = key(name.split(" (")[0])
        age_row = ages[census_key]
        education_row = education[census_key]
        youth_share = 100 * sum(int(age_row[column]) for column in "GHI") / int(age_row["C"])
        education_share = 100 * (int(education_row["L"]) + int(education_row["M"])) / int(education_row["C"])
        sums = {field: sum(int(row[field]) for row in rows) for field in FIELDS}
        if sums["listici_u_kutiji"] != sums["vazeci_glasovi"] + sums["nevazeci_listici"]:
            raise ValueError(f"Inconsistent ballot counts for {name}")
        area = OFFICIAL_AREA_KM2[name]
        entries.append({
            "id": "beograd-" + code, "name": name,
            "votes": 100 * sums["lista_3"] / sums["vazeci_glasovi"],
            "density": pop / area, "validVotes": sums["vazeci_glasovi"],
            "listVotes": sums["lista_3"], "snsVotes": sums["lista_1"],
            "population": pop, "areaKm2": area,
            "turnout": 100 * sums["glasali_biraci"] / sums["upisani_biraci"],
            "stations": len({row["bm_uid"] for row in rows}),
            "registeredVoters": sums["upisani_biraci"],
            "votersAttended": sums["glasali_biraci"], "region": "RS11",
            "higherEducationShare": education_share, "youthShare": youth_share,
            "age65PlusShare": 100 * age65 / pop,
            "ballotsInBox": sums["listici_u_kutiji"],
            "invalidVotes": sums["nevazeci_listici"],
            "invalidShare": 100 * sums["nevazeci_listici"] / sums["listici_u_kutiji"],
            "district": "Grad Beograd",
        })
    existing = json.loads((ROOT / "data/data.js").read_text(encoding="utf-8").split(
        "window.municipalityData = ", 1)[1].strip().rstrip(";"))
    beograd = next(entry for entry in existing if entry["name"] == "Beograd")
    for key_name in ("validVotes", "listVotes", "population", "stations", "registeredVoters",
                     "votersAttended", "ballotsInBox", "invalidVotes"):
        total = sum(entry[key_name] for entry in entries)
        if total != beograd[key_name]:
            raise ValueError(f"Belgrade {key_name} total differs: {total} != {beograd[key_name]}")
    aggregate_youth = 100 * sum(sum(int(row[column]) for column in "GHI") for row in ages.values()) / sum(
        int(row["C"]) for row in ages.values())
    aggregate_education = 100 * sum(int(row["L"]) + int(row["M"]) for row in education.values()) / sum(
        int(row["C"]) for row in education.values())
    if (abs(aggregate_youth - beograd["youthShare"]) > 1e-8 or
            abs(aggregate_education - beograd["higherEducationShare"]) > 1e-8):
        raise ValueError("Belgrade census shares differ from the existing city aggregate")
    (ROOT / "data/beograd-results.js").write_text(
        "window.beogradResults = " + json.dumps(entries, indent=2, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    print(f"Wrote {len(entries)} municipalities; votes={sum(x['listVotes'] for x in entries):,}; "
          f"population={sum(x['population'] for x in entries):,}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/build_beograd_results.py path/to/rik-results.xlsx")
    main(sys.argv[1])
