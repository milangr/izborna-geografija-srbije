"""Aggregate Kosovo municipality results from the RIK polling-station XLSX."""

import json
import sys
from collections import defaultdict
from pathlib import Path

from add_districts import source_rows
from add_invalid_ballots import TRANSLATION


ROOT = Path(__file__).resolve().parents[1]
FIELDS = ("upisani_biraci", "glasali_biraci", "listici_u_kutiji",
          "vazeci_glasovi", "nevazeci_listici", "lista_1", "lista_3")


def latin(value):
    result = value.lower().translate(TRANSLATION)
    return result.title()


def main(source_path):
    grouped = defaultdict(list)
    for row in source_rows(source_path):
        if row["sifra_okruga_regiona"].startswith("RS23/"):
            grouped[row["sifra_opstine"]].append(row)
    if len(grouped) != 22:
        raise ValueError(f"Expected 22 Kosovo municipalities, found {len(grouped)}")

    result = []
    for code, rows in sorted(grouped.items()):
        names = {row["opstina"] for row in rows}
        districts = {row["okrug_region"].split("/", 1)[1] for row in rows}
        if len(names) != 1 or len(districts) != 1:
            raise ValueError(f"Name or district conflict for municipality {code}")
        name = latin(next(iter(names)))
        district = next(iter(districts)).lower().translate(TRANSLATION).replace(" upravni okrug", " okrug")
        district = district[:1].upper() + district[1:]
        sums = {field: sum(int(row[field]) for row in rows) for field in FIELDS}
        if sums["listici_u_kutiji"] != sums["vazeci_glasovi"] + sums["nevazeci_listici"]:
            raise ValueError(f"Ballot reconciliation failed for {name}")
        valid = sums["vazeci_glasovi"]
        ballots = sums["listici_u_kutiji"]
        registered = sums["upisani_biraci"]
        result.append({
            "id": "kosovo-" + code,
            "name": name,
            "region": "RS23",
            "district": district,
            "listVotes": sums["lista_3"],
            "snsVotes": sums["lista_1"],
            "validVotes": valid,
            "invalidVotes": sums["nevazeci_listici"],
            "ballotsInBox": ballots,
            "votersAttended": sums["glasali_biraci"],
            "registeredVoters": registered,
            "stations": len({row["bm_uid"] for row in rows}),
            "votes": 100 * sums["lista_3"] / valid,
            "invalidShare": 100 * sums["nevazeci_listici"] / ballots,
            "turnout": 100 * sums["glasali_biraci"] / registered,
            "population": None,
            "areaKm2": None,
            "density": None,
            "youthShare": None,
            "age65PlusShare": None,
            "higherEducationShare": None,
            "mapped": True,
        })

    destination = ROOT / "data/kosovo-results.js"
    destination.write_text("window.kosovoResults = " +
                           json.dumps(result, indent=2, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"Added {len(result)} Kosovo municipality rows, {sum(item['stations'] for item in result)} polling stations")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/add_kosovo_results.py path/to/rik-results.xlsx")
    main(sys.argv[1])
