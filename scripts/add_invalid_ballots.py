"""Add exact invalid-ballot counts from the RIK polling-station CSV to data.js.

Usage: python scripts/add_invalid_ballots.py path/to/rik-2026.csv
"""

import collections
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path


CYR = "абвгдђежзијклљмнњопрстћуфхцчџш"
LAT = "a b v g d đ e ž z i j k l lj m n nj o p r s t ć u f h c č dž š".split()
TRANSLATION = dict(zip(map(ord, CYR), LAT))


def key(name):
    text = name.strip().lower().translate(TRANSLATION)
    return re.sub(r"^(grad |gradska opstina |opstina )", "", "".join(
        char for char in unicodedata.normalize("NFKD", text.replace("đ", "dj"))
        if not unicodedata.combining(char)
    ))


def municipality_key(row):
    if row["sifra_okruga_regiona"].startswith("RS11/"):
        return "beograd"
    city_municipalities = {
        "71285": "nis", "71307": "nis", "71315": "nis",
        "71323": "nis", "71331": "nis", "71340": "pozarevac",
        "71366": "uzice",
    }
    return city_municipalities.get(row["sifra_opstine"], key(row["opstina"]))


def main(csv_path):
    data_path = Path(__file__).resolve().parents[1] / "data/data.js"
    source = data_path.read_text(encoding="utf-8")
    prefix = source.split("window.municipalityData = ", 1)[0]
    entries = json.loads(source.split("window.municipalityData = ", 1)[1].strip().rstrip(";"))
    by_name = {key(entry["name"]): entry for entry in entries}
    assert len(entries) == len(by_name) == 145

    counts = collections.defaultdict(collections.Counter)
    with open(csv_path, newline="", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            if row["sifra_okruga_regiona"].split("/")[0] not in {"RS11", "RS12", "RS21", "RS22"}:
                continue
            municipality = municipality_key(row)
            if municipality not in by_name:
                raise ValueError(f"Unmatched municipality: {row['opstina']}")
            ballots = int(row["listici_u_kutiji"])
            invalid = int(row["nevazeci_listici"])
            valid = int(row["vazeci_glasovi"])
            attended = int(row["glasali_biraci"])
            if ballots != invalid + valid or ballots > attended:
                raise ValueError(f"Inconsistent ballots at polling station {row['bm_uid']}")
            counts[municipality].update(
                ballotsInBox=ballots, invalidVotes=invalid,
                validVotes=valid, votersAttended=attended,
            )

    if counts.keys() != by_name.keys():
        raise ValueError("Municipality coverage differs from data.js")
    for name, entry in by_name.items():
        total = counts[name]
        if (entry["validVotes"] != total["validVotes"] or
                entry["votersAttended"] != total["votersAttended"]):
            raise ValueError(f"Existing election totals differ for {entry['name']}")
        entry["ballotsInBox"] = total["ballotsInBox"]
        entry["invalidVotes"] = total["invalidVotes"]
        entry["invalidShare"] = 100 * total["invalidVotes"] / total["ballotsInBox"]

    data_path.write_text(prefix + "window.municipalityData = " +
                         json.dumps(entries, indent=2, ensure_ascii=False) + ";\n",
                         encoding="utf-8")
    print(f"Updated {len(entries)} municipalities; "
          f"{sum(item['invalidVotes'] for item in entries):,} invalid ballots")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/add_invalid_ballots.py path/to/rik-2026.csv")
    main(sys.argv[1])
