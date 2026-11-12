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
# Percent values in site data are 0–100;
# XLSX stores them as fractions so Excel can calculate with them normally.
COLUMNS = [
    ("name", "Opština ili grad", "text"),
    ("region", "Statistička regija", "text"),
    ("district", "Okrug", "text"),
    ("votes", "Udio Lista3 (%)", "percent"),
    ("listVotes", "Glasovi Lista3", "integer"),
    ("snsShare", "Udio SNS (%)", "percent"),
    ("snsVotes", "Glasovi SNS", "integer"),
    ("voteDifference", "Razlika glasova (Lista3 − SNS)", "signed_integer"),
    ("validVotes", "Važeći glasovi", "integer"),
    ("invalidShare", "Nevažeći listići (%)", "percent"),
    ("turnout", "Izlaznost (%)", "percent"),
    ("votersAttended", "Birači koji su izašli", "integer"),
    ("registeredVoters", "Upisani birači", "integer"),
    ("stations", "Biračka mjesta", "integer"),
    ("population", "Stanovništvo (2025)", "integer"),
    ("density", "Gustina (2025) (stan./km²)", "decimal"),
    ("areaKm2", "Površina (km²)", "decimal"),
    ("youthShare", "Mladi 15–29 (2022) (%)", "percent"),
    ("age65PlusShare", "Uzrast 65+ (2025) (%)", "percent"),
    ("higherEducationShare", "Više ili visoko obrazovanje (2022) (%)", "percent"),
]


def read_js_array(filename):
    source = (ROOT / filename).read_text(encoding="utf-8-sig")
    return json.loads(source[source.index("["):source.rindex("]") + 1])
