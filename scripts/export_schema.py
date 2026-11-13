"""Shared source reader and base columns for the XLSX export."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REGIONS = {
    "RS11": "Beogradski region",
    "RS12": "Vojvodina",
    "RS21": "Šumadija i Zapadna Srbija",
    "RS22": "Južna i Istočna Srbija",
    "RS23": "Kosovo i Metohija",
    "33000": "Ostalo",
    "55001": "Ostalo",
}

# Base export columns. The JS generator adds development, wages and normalized difference.
# Percent values in site data are 0-100;
# XLSX stores them as fractions so Excel can calculate with them normally.
COLUMNS = [
    ("name", "Opština ili grad", "text"),
    ("region", "Statistička regija", "text"),
    ("district", "Okrug", "text"),
    ("votes", "Udio Lista3 (%)", "percent"),
    ("listVotes", "Glasovi Lista3", "integer"),
    ("snsShare", "Udio Lista1 (%)", "percent"),
    ("snsVotes", "Glasovi Lista1", "integer"),
    ("voteDifference", "Razlika glasova (Lista3 - Lista1)", "signed_integer"),
    ("validVotes", "Važeći glasovi", "integer"),
    ("invalidShare", "Nevažeći listići (%)", "percent"),
    ("turnout", "Izlaznost (%)", "percent"),
    ("votersAttended", "Birači koji su izašli", "integer"),
    ("registeredVoters", "Upisani birači", "integer"),
    ("stations", "Biračka mjesta", "integer"),
    ("population", "Stanovništvo (2025)", "integer"),
    ("density", "Gustina (2025) (stan./km²)", "decimal"),
    ("areaKm2", "Površina (km²)", "decimal"),
    ("age0_14Share", "Uzrast 0-14 (%)", "percent"),
    ("youthShare", "Uzrast 15-29 (%)", "percent"),
    ("age30_44Share", "Uzrast 30-44 (%)", "percent"),
    ("age45_64Share", "Uzrast 45-64 (%)", "percent"),
    ("age65PlusShare", "Uzrast 65+ (%)", "percent"),
    ("higherEducationShare", "Više ili visoko obrazovanje (2022) (%)", "percent"),
]


def read_js_array(filename):
    source = (ROOT / filename).read_text(encoding="utf-8-sig")
    return json.loads(source[source.index("["):source.rindex("]") + 1])
