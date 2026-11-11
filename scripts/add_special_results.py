"""Aggregate RIK results outside the 145 mapped municipalities.

Usage: python scripts/add_special_results.py path/to/rik-results.xlsx
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

from add_districts import source_rows


SPECIAL = {
    "33000": ("special-abroad", "Inostranstvo"),
    "55001": ("special-prisons", "Kazneni zavodi"),
}
SUM_FIELDS = ("upisani_biraci", "glasali_biraci", "listici_u_kutiji",
              "vazeci_glasovi", "nevazeci_listici", "lista_1", "lista_3")


def main(source_path):
    grouped = defaultdict(list)
    for row in source_rows(source_path):
        code = row["sifra_okruga_regiona"].split("/")[-1]
        region = row["sifra_okruga_regiona"].split("/")[0]
        key = region if region == "RS23" else code
        if key in SPECIAL:
            grouped[key].append(row)
    if set(grouped) != set(SPECIAL):
        raise ValueError(f"Expected special categories {set(SPECIAL)}, found {set(grouped)}")

    result = []
    for code, (item_id, name) in SPECIAL.items():
        rows = grouped[code]
        sums = {field: sum(int(row[field]) for row in rows) for field in SUM_FIELDS}
        if sums["listici_u_kutiji"] != sums["vazeci_glasovi"] + sums["nevazeci_listici"]:
            raise ValueError(f"Ballot reconciliation failed for {name}")
        valid = sums["vazeci_glasovi"]
        registered = sums["upisani_biraci"]
        ballots = sums["listici_u_kutiji"]
        result.append({
            "id": item_id,
            "name": name,
            "region": code,
            "district": None,
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
            "special": True,
        })

    destination = Path(__file__).resolve().parents[1] / "data/special-results.js"
    destination.write_text("window.specialResults = " +
                           json.dumps(result, indent=2, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("Added: " + ", ".join(f"{item['name']} ({item['stations']})" for item in result))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/add_special_results.py path/to/rik-results.xlsx")
    main(sys.argv[1])
