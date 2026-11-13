"""Build five municipality age shares from the RZS 2022 Census table."""

import json
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

from add_invalid_ballots import key


ROOT = Path(__file__).resolve().parents[1]
MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def read_js_array(filename):
    source = (ROOT / filename).read_text(encoding="utf-8-sig")
    return json.loads(source[source.index("["):source.rindex("]") + 1])


def census_rows():
    rows = defaultdict(list)
    with zipfile.ZipFile(ROOT / "sources/rzs-age-2022-source.xlsx") as book:
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
                column = re.match(r"[A-Z]+", cell.get("r")).group()
                cells[column] = shared[int(value.text)] if cell.get("t") == "s" else value.text
            if cells.get("A") and cells.get("B") == "С" and cells.get("C", "").isdigit() and all(
                    cells.get(column, "").isdigit() for column in "DEFGHIJKLMNOPQRSTU"):
                groups = {
                    "age0_14": sum(int(cells[column]) for column in "DEF"),
                    "age15_29": sum(int(cells[column]) for column in "GHI"),
                    "age30_44": sum(int(cells[column]) for column in "JKL"),
                    "age45_64": sum(int(cells[column]) for column in "MNOP"),
                    "age65Plus": sum(int(cells[column]) for column in "QRSTU"),
                }
                total = int(cells["C"])
                if sum(groups.values()) != total:
                    raise ValueError(f"Age groups do not sum to census population: {cells['A']}")
                rows[key(cells["A"])].append({"total": total, **groups})
    return rows


def main():
    entries = [entry for entry in read_js_array("data/data.js") if entry["name"] != "Beograd"]
    entries += read_js_array("data/beograd-results.js")
    census = census_rows()
    output = {}
    for entry in entries:
        name = entry["name"]
        candidates = census[key(name)]
        if not candidates and " (" in name:
            candidates = census[key(name.split(" (")[0])]
        if not candidates:
            raise ValueError(f"Missing Census 2022 age groups: {name}")
        age = min(candidates, key=lambda row: abs(row["total"] - entry["population"]))
        if len(candidates) > 1:
            distances = sorted(abs(row["total"] - entry["population"]) for row in candidates)
            if distances[0] == distances[1]:
                raise ValueError(f"Ambiguous Census 2022 row: {name}")
        if abs(100 * age["age15_29"] / age["total"] - entry["youthShare"]) > 1e-7:
            raise ValueError(f"Youth share disagrees with existing data: {name}")
        output[name] = age
    if len(output) != 161:
        raise ValueError(f"Expected 161 municipalities, found {len(output)}")
    destination = ROOT / "data/age-groups-2022.js"
    destination.write_text(
        "// RZS Popis 2022: stanovništvo po starosti i polu, opštine i gradovi (ukupno).\n"
        "window.ageGroups2022 = " + json.dumps(output, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    print(f"Built Census 2022 age groups for {len(output)} municipalities")


if __name__ == "__main__":
    main()
