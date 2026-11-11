"""Add RIK electoral list 1 vote counts to the 145 base municipality records.

Usage: python scripts/add_sns_votes.py path/to/rik-results.xlsx
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

from add_districts import source_rows
from add_invalid_ballots import key, municipality_key


def main(source_path):
    destination = Path(__file__).resolve().parents[1] / "data/data.js"
    source = destination.read_text(encoding="utf-8")
    prefix, payload = source.split("window.municipalityData = ", 1)
    entries = json.loads(payload.strip().rstrip(";"))
    by_name = {key(entry["name"]): entry for entry in entries}
    if len(entries) != len(by_name) or len(entries) != 145:
        raise ValueError("Unexpected base municipality count or duplicate name")

    grouped = defaultdict(lambda: defaultdict(int))
    for row in source_rows(source_path):
        if row["sifra_okruga_regiona"].split("/")[0] not in {"RS11", "RS12", "RS21", "RS22"}:
            continue
        municipality = municipality_key(row)
        for field in ("lista_1", "lista_3", "vazeci_glasovi"):
            grouped[municipality][field] += int(row[field])
    if grouped.keys() != by_name.keys():
        raise ValueError(f"Municipality coverage mismatch: {by_name.keys() - grouped.keys()}")

    for name, entry in by_name.items():
        result = grouped[name]
        if result["lista_3"] != entry["listVotes"] or result["vazeci_glasovi"] != entry["validVotes"]:
            raise ValueError(f"Existing vote counts differ for {entry['name']}")
        entry["snsVotes"] = result["lista_1"]
    destination.write_text(prefix + "window.municipalityData = " +
                           json.dumps(entries, indent=2, ensure_ascii=False) + ";\n",
                           encoding="utf-8")
    print(f"Updated {len(entries)} base units; SNS votes: {sum(x['snsVotes'] for x in entries):,}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/add_sns_votes.py path/to/rik-results.xlsx")
    main(sys.argv[1])
