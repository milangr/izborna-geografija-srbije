"""Add district names from the RIK polling-station XLSX to data.js.

Usage: python scripts/add_districts.py path/to/rik-results.xlsx
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

from add_invalid_ballots import TRANSLATION, key, municipality_key


MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def cell_text(cell, shared):
    value = cell.find(MAIN + "v")
    if value is None:
        return ""
    return shared[int(value.text)] if cell.get("t") == "s" else value.text


def source_rows(path):
    with zipfile.ZipFile(path) as book:
        strings_xml = ET.fromstring(book.read("xl/sharedStrings.xml"))
        shared = ["".join(node.text or "" for node in item.iter(MAIN + "t"))
                  for item in strings_xml.findall(MAIN + "si")]
        required = {"opstina", "sifra_opstine", "okrug_region", "sifra_okruga_regiona"}
        for name in sorted(book.namelist()):
            if not re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name):
                continue
            sheet = ET.fromstring(book.read(name))
            rows = sheet.find(MAIN + "sheetData").findall(MAIN + "row")
            header = {cell.get("r").rstrip("0123456789"): cell_text(cell, shared)
                      for cell in rows[0].findall(MAIN + "c")}
            if required.issubset(header.values()):
                break
        else:
            raise ValueError("The expected RIK district columns are missing")
        for row in rows[1:]:
            cells = {cell.get("r").rstrip("0123456789"): cell_text(cell, shared)
                     for cell in row.findall(MAIN + "c")}
            yield {name: cells.get(column, "") for column, name in header.items()}


def main(source_path):
    data_path = Path(__file__).resolve().parents[1] / "data/data.js"
    source = data_path.read_text(encoding="utf-8")
    prefix = source.split("window.municipalityData = ", 1)[0]
    entries = json.loads(source.split("window.municipalityData = ", 1)[1].strip().rstrip(";"))
    by_name = {key(entry["name"]): entry for entry in entries}
    assert len(entries) == len(by_name) == 145

    districts = defaultdict(set)
    for row in source_rows(source_path):
        if row["sifra_okruga_regiona"].split("/")[0] not in {"RS11", "RS12", "RS21", "RS22"}:
            continue
        municipality = municipality_key(row)
        district = row["okrug_region"].split("/", 1)[1]
        district = district.lower().translate(TRANSLATION).replace(" upravni okrug", " okrug")
        district = district[:1].upper() + district[1:]
        if district == "Grad beograd":
            district = "Grad Beograd"
        districts[municipality].add(district)

    if districts.keys() != by_name.keys():
        missing = sorted(by_name.keys() - districts.keys())
        extra = sorted(districts.keys() - by_name.keys())
        raise ValueError(f"Municipality mismatch: missing={missing}, extra={extra}")
    conflicts = {name: sorted(values) for name, values in districts.items() if len(values) != 1}
    if conflicts:
        raise ValueError(f"Municipalities with multiple districts: {conflicts}")

    for name, entry in by_name.items():
        entry["district"] = next(iter(districts[name]))
    data_path.write_text(prefix + "window.municipalityData = " +
                         json.dumps(entries, indent=2, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"Updated {len(entries)} municipalities in {len(set(entry['district'] for entry in entries))} districts")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/add_districts.py path/to/rik-results.xlsx")
    main(sys.argv[1])
