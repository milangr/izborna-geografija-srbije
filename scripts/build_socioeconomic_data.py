"""Build municipality development groups and 2025 average net wages.

Sources:
https://ras.gov.rs/uploads/2020/05/uredba-o-utvrdivanju-jedinstvene-liste-razvijenosti-regiona-i-jedinica.pdf
https://publikacije.stat.gov.rs/G2026/HtmlL/G20261050.html (table 4)
"""

import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GROUPS = {
    1: "Bačka Palanka|Beograd|Beočin|Bor|Valjevo|Vrbas|Vršac|Kanjiža|Kragujevac|Lajkovac|Niš|Novi Sad|Pančevo|Pećinci|Požarevac|Senta|Stara Pazova|Subotica|Užice|Čačak",
    2: "Ada|Aleksandrovac|Apatin|Aranđelovac|Arilje|Bačka Topola|Bački Petrovac|Bečej|Vranje|Vrnjačka Banja|Gornji Milanovac|Zaječar|Zrenjanin|Inđija|Jagodina|Kikinda|Kosjerić|Kruševac|Kula|Lapovo|Majdanpek|Novi Kneževac|Pirot|Požega|Rača|Ruma|Smederevo|Sombor|Sremska Mitrovica|Sremski Karlovci|Temerin|Topola|Čajetina|Šabac",
    3: "Alibunar|Bajina Bašta|Batočina|Bač|Bela Crkva|Bogatić|Boljevac|Velika Plana|Veliko Gradište|Vladimirci|Despotovac|Žabalj|Žitište|Ivanjica|Irig|Kladovo|Knić|Kovačica|Kovin|Koceljeva|Kraljevo|Leskovac|Loznica|Lučani|Ljubovija|Mali Iđoš|Negotin|Nova Crnja|Novi Bečej|Novi Pazar|Osečina|Odžaci|Paraćin|Plandište|Prokuplje|Svilajnac|Sečanj|Smederevska Palanka|Sokobanja|Srbobran|Titel|Trstenik|Ćićevac|Ćuprija|Ub|Čoka|Šid",
    4: "Aleksinac|Babušnica|Bela Palanka|Blace|Bojnik|Bosilegrad|Brus|Bujanovac|Varvarin|Vladičin Han|Vlasotince|Gadžin Han|Golubac|Dimitrovgrad|Doljevac|Žabari|Žagubica|Žitorađa|Knjaževac|Krupanj|Kuršumlija|Kučevo|Lebane|Ljig|Mali Zvornik|Malo Crniće|Medveđa|Merošina|Mionica|Nova Varoš|Opovo|Petrovac na Mlavi|Preševo|Priboj|Prijepolje|Ražanj|Raška|Rekovac|Svrljig|Sjenica|Surdulica|Trgovište|Tutin|Crna Trava",
}
DEVASTATED = "Babušnica|Bela Palanka|Bojnik|Bosilegrad|Bujanovac|Vladičin Han|Golubac|Žitorađa|Kuršumlija|Lebane|Mali Zvornik|Medveđa|Merošina|Preševo|Prijepolje|Svrljig|Surdulica|Trgovište|Tutin".split("|")


def read_js_array(filename):
    source = (ROOT / filename).read_text(encoding="utf-8-sig")
    return json.loads(source[source.index("["):source.rindex("]") + 1])


def wages_from_rzs():
    source = (ROOT / "rzs-wages-2025-source.html").read_text(encoding="utf-8-sig")
    table = source.split('id="tables5"', 1)[1].split("</table>", 1)[0]
    wages = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, flags=re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S)
        if len(cells) != 9:
            continue
        name = html.unescape(re.sub(r"<[^>]+>", "", cells[0])).strip()
        annual_net = html.unescape(re.sub(r"<[^>]+>", "", cells[6])).strip()
        if annual_net.isdigit():
            if name in wages:
                raise ValueError(f"Duplicate RZS wage row: {name}")
            wages[name] = int(annual_net)
    return wages


def main():
    groups = {}
    for group, names in GROUPS.items():
        for name in names.split("|"):
            if name in groups:
                raise ValueError(f"Duplicate development group: {name}")
            groups[name] = group
    assert len(groups) == 145
    assert len(DEVASTATED) == 19 and all(groups[name] == 4 for name in DEVASTATED)
    wages = wages_from_rzs()
    # RZS prefixes these two city totals with "Grad"; the election table does not.
    wages["Niš"] = wages["Grad Niš"]
    wages["Novi Sad"] = wages["Grad Novi Sad"]
    names = [entry["name"] for entry in read_js_array("data.js") if entry["name"] != "Beograd"]
    belgrade = [entry["name"] for entry in read_js_array("beograd-results.js")]
    missing_groups = sorted(set(names) - groups.keys())
    unused_groups = sorted(groups.keys() - set(names) - {"Beograd"})
    if missing_groups or unused_groups:
        raise ValueError(f"Development match: missing={missing_groups}, unused={unused_groups}")
    missing_wages = sorted(set(names + belgrade) - wages.keys())
    if missing_wages:
        raise ValueError(f"RZS wage match: missing={missing_wages}")
    output = {}
    for name in names + belgrade:
        group = 1 if name in belgrade else groups[name]
        output[name] = {"developmentGroup2014": 5 if name in DEVASTATED else group,
                        "averageNetWage2025": wages[name]}
    (ROOT / "socioeconomic-data.js").write_text(
        "// Vlada RS: stepen razvijenosti JLS 2014; RZS: prosječna neto zarada 2025 po opštini prebivališta zaposlenih.\n"
        "window.socioeconomicData = " + json.dumps(output, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    print(f"Built {len(output)} matched entries; {len(wages)} RZS source rows.")


if __name__ == "__main__":
    main()
