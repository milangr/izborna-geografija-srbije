"""Build the complete, filter-independent XLSX linked from index.html.

Uses only Python's standard library. Run from any directory:
    python scripts/build_export_xlsx.py
"""

import json
import math
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "izborna-geografija-srbije-2026.xlsx"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT = "http://schemas.openxmlformats.org/package/2006/content-types"
ET.register_namespace("", NS)
ET.register_namespace("r", REL)

REGIONS = {
    "RS11": "Beogradski region",
    "RS12": "Vojvodina",
    "RS21": "Šumadija i Zapadna Srbija",
    "RS22": "Južna i Istočna Srbija",
    "RS23": "Kosovo i Metohija",
    "33000": "Ostalo",
    "55001": "Ostalo",
}

# Same keys and order as the table in app.js. Percent values in JS are 0–100;
# XLSX stores them as fractions so Excel can calculate with them normally.
COLUMNS = [
    ("name", "Opština ili grad", "text"),
    ("region", "Statistička regija", "text"),
    ("district", "Okrug", "text"),
    ("votes", "Udio studentske liste (%)", "percent"),
    ("listVotes", "Glasovi studentske liste", "integer"),
    ("snsShare", "Udio SNS liste (%)", "percent"),
    ("snsVotes", "Glasovi SNS liste", "integer"),
    ("voteDifference", "Razlika glasova (studentska − SNS)", "signed_integer"),
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


def col_name(number):
    result = ""
    while number:
        number, digit = divmod(number - 1, 26)
        result = chr(65 + digit) + result
    return result


def xml(element):
    return ET.tostring(element, encoding="utf-8", xml_declaration=True)


def cell(row, column, value, kind="text", total=False):
    if value is None or isinstance(value, float) and not math.isfinite(value):
        return
    style = {"text": (2, 6), "integer": (3, 7), "decimal": (4, 8),
             "percent": (5, 9), "signed_integer": (10, 11)}[kind][int(total)]
    item = ET.SubElement(row, f"{{{NS}}}c", {"r": f"{col_name(column)}{row.attrib['r']}", "s": str(style)})
    if kind == "text":
        item.set("t", "inlineStr")
        ET.SubElement(ET.SubElement(item, f"{{{NS}}}is"), f"{{{NS}}}t").text = str(value)
    else:
        ET.SubElement(item, f"{{{NS}}}v").text = str(value / 100 if kind == "percent" else value)


def make_styles():
    stylesheet = ET.Element(f"{{{NS}}}styleSheet")
    formats = ET.SubElement(stylesheet, f"{{{NS}}}numFmts", {"count": "4"})
    for identifier, pattern in [(164, "#,##0"), (165, "#,##0.0"), (166, "0.0%"),
                                (167, "+#,##0;-#,##0;0")]:
        ET.SubElement(formats, f"{{{NS}}}numFmt", {"numFmtId": str(identifier), "formatCode": pattern})
    fonts = ET.SubElement(stylesheet, f"{{{NS}}}fonts", {"count": "3"})
    for bold in (False, True, True):
        font = ET.SubElement(fonts, f"{{{NS}}}font")
        ET.SubElement(font, f"{{{NS}}}sz", {"val": "11"})
        if bold:
            ET.SubElement(font, f"{{{NS}}}b")
    fills = ET.SubElement(stylesheet, f"{{{NS}}}fills", {"count": "4"})
    for pattern, color in [("none", None), ("gray125", None), ("solid", "DCEAF7"), ("solid", "E9F3FB")]:
        fill = ET.SubElement(fills, f"{{{NS}}}fill")
        pattern_fill = ET.SubElement(fill, f"{{{NS}}}patternFill", {"patternType": pattern})
        if color:
            ET.SubElement(pattern_fill, f"{{{NS}}}fgColor", {"rgb": "FF" + color})
            ET.SubElement(pattern_fill, f"{{{NS}}}bgColor", {"indexed": "64"})
    borders = ET.SubElement(stylesheet, f"{{{NS}}}borders", {"count": "1"})
    border = ET.SubElement(borders, f"{{{NS}}}border")
    for edge in ("left", "right", "top", "bottom", "diagonal"):
        ET.SubElement(border, f"{{{NS}}}{edge}")
    ET.SubElement(stylesheet, f"{{{NS}}}cellStyleXfs", {"count": "1"}).append(ET.Element(f"{{{NS}}}xf", {"numFmtId": "0", "fontId": "0", "fillId": "0", "borderId": "0"}))
    xfs = ET.SubElement(stylesheet, f"{{{NS}}}cellXfs", {"count": "12"})
    for font, fill, number_format in [(0, 0, 0), (1, 2, 0), (0, 0, 0), (0, 0, 164), (0, 0, 165), (0, 0, 166),
                                      (2, 3, 0), (2, 3, 164), (2, 3, 165), (2, 3, 166),
                                      (0, 0, 167), (2, 3, 167)]:
        ET.SubElement(xfs, f"{{{NS}}}xf", {"numFmtId": str(number_format), "fontId": str(font),
                                              "fillId": str(fill), "borderId": "0", "xfId": "0",
                                              "applyNumberFormat": "1"})
    styles = ET.SubElement(stylesheet, f"{{{NS}}}cellStyles", {"count": "1"})
    ET.SubElement(styles, f"{{{NS}}}cellStyle", {"name": "Normal", "xfId": "0", "builtinId": "0"})
    return xml(stylesheet)


def make_sheet(rows):
    sheet = ET.Element(f"{{{NS}}}worksheet")
    last_column = col_name(len(COLUMNS) + 1)
    ET.SubElement(sheet, f"{{{NS}}}dimension", {"ref": f"A1:{last_column}{len(rows) + 2}"})
    views = ET.SubElement(sheet, f"{{{NS}}}sheetViews")
    view = ET.SubElement(views, f"{{{NS}}}sheetView", {"workbookViewId": "0"})
    ET.SubElement(view, f"{{{NS}}}pane", {"xSplit": "3", "ySplit": "1", "topLeftCell": "D2", "activePane": "bottomRight", "state": "frozen"})
    cols = ET.SubElement(sheet, f"{{{NS}}}cols")
    for index in range(1, len(COLUMNS) + 2):
        width = 6 if index == 1 else 29 if index == 2 else 30 if index in (3, 4) else 17
        ET.SubElement(cols, f"{{{NS}}}col", {"min": str(index), "max": str(index), "width": str(width), "customWidth": "1"})
    sheet_data = ET.SubElement(sheet, f"{{{NS}}}sheetData")
    header = ET.SubElement(sheet_data, f"{{{NS}}}row", {"r": "1"})
    for index, label in enumerate(["Br."] + [column[1] for column in COLUMNS], 1):
        item = ET.SubElement(header, f"{{{NS}}}c", {"r": f"{col_name(index)}1", "s": "1", "t": "inlineStr"})
        ET.SubElement(ET.SubElement(item, f"{{{NS}}}is"), f"{{{NS}}}t").text = label
    for index, entry in enumerate(rows, 1):
        row = ET.SubElement(sheet_data, f"{{{NS}}}row", {"r": str(index + 1)})
        cell(row, 1, index, "integer")
        for column, (key, _, kind) in enumerate(COLUMNS, 2):
            value = entry.get(key)
            if key == "region":
                value = REGIONS.get(value, value)
            elif key == "district" and entry.get("region") in ("33000", "55001"):
                value = entry["name"]
            cell(row, column, value, kind)
    total_row = ET.SubElement(sheet_data, f"{{{NS}}}row", {"r": str(len(rows) + 2)})
    cell(total_row, 1, "Σ", total=True)
    cell(total_row, 2, f"Ukupno ({len(rows)})", total=True)
    def total(key):
        return sum(entry.get(key) or 0 for entry in rows)
    totals = {key: total(key) for key in ("listVotes", "snsVotes", "validVotes", "votersAttended",
                                         "registeredVoters", "stations", "population", "areaKm2")}
    valid, registered = totals["validVotes"], totals["registeredVoters"]
    ballots = total("ballotsInBox")
    totals["votes"] = 100 * totals["listVotes"] / valid if valid else None
    totals["snsShare"] = 100 * totals["snsVotes"] / valid if valid else None
    totals["voteDifference"] = totals["listVotes"] - totals["snsVotes"]
    totals["invalidShare"] = 100 * total("invalidVotes") / ballots if ballots else None
    totals["turnout"] = 100 * totals["votersAttended"] / registered if registered else None
    totals["density"] = totals["population"] / totals["areaKm2"] if totals["areaKm2"] else None
    for column, (key, _, kind) in enumerate(COLUMNS, 2):
        cell(total_row, column, totals.get(key), kind, total=True)
    ET.SubElement(sheet, f"{{{NS}}}autoFilter", {"ref": f"A1:{last_column}{len(rows) + 1}"})
    return xml(sheet)


def main():
    data = [entry for entry in read_js_array("data.js") if entry["name"] != "Beograd"]
    data += read_js_array("beograd-results.js")
    kosovo = read_js_array("kosovo-results.js")
    data += [entry for entry in kosovo if entry.get("mapped")]
    data += [entry for entry in kosovo if not entry.get("mapped")]
    data += read_js_array("special-results.js")
    data.sort(key=lambda entry: entry["name"].casefold())
    for entry in data:
        valid = entry.get("validVotes")
        sns = entry.get("snsVotes")
        entry["snsShare"] = 100 * sns / valid if sns is not None and valid else None
        entry["voteDifference"] = entry["listVotes"] - sns if sns is not None else None

    workbook = ET.Element(f"{{{NS}}}workbook")
    sheets = ET.SubElement(workbook, f"{{{NS}}}sheets")
    ET.SubElement(sheets, f"{{{NS}}}sheet", {"name": "Opštine i gradovi", "sheetId": "1", f"{{{REL}}}id": "rId1"})
    root_rels = ET.Element(f"{{{PKG_REL}}}Relationships")
    ET.SubElement(root_rels, f"{{{PKG_REL}}}Relationship", {"Id": "rId1", "Type": REL + "/officeDocument", "Target": "xl/workbook.xml"})
    book_rels = ET.Element(f"{{{PKG_REL}}}Relationships")
    ET.SubElement(book_rels, f"{{{PKG_REL}}}Relationship", {"Id": "rId1", "Type": REL + "/worksheet", "Target": "worksheets/sheet1.xml"})
    ET.SubElement(book_rels, f"{{{PKG_REL}}}Relationship", {"Id": "rId2", "Type": REL + "/styles", "Target": "styles.xml"})
    types = ET.Element(f"{{{CONTENT}}}Types")
    ET.SubElement(types, f"{{{CONTENT}}}Default", {"Extension": "rels", "ContentType": "application/vnd.openxmlformats-package.relationships+xml"})
    ET.SubElement(types, f"{{{CONTENT}}}Default", {"Extension": "xml", "ContentType": "application/xml"})
    for name, content_type in [("/xl/workbook.xml", "sheet.main+xml"), ("/xl/worksheets/sheet1.xml", "worksheet+xml"),
                               ("/xl/styles.xml", "styles+xml")]:
        ET.SubElement(types, f"{{{CONTENT}}}Override", {"PartName": name,
            "ContentType": "application/vnd.openxmlformats-officedocument.spreadsheetml." + content_type})
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
        for filename, content in [("[Content_Types].xml", xml(types)), ("_rels/.rels", xml(root_rels)),
                                  ("xl/workbook.xml", xml(workbook)), ("xl/_rels/workbook.xml.rels", xml(book_rels)),
                                  ("xl/worksheets/sheet1.xml", make_sheet(data)), ("xl/styles.xml", make_styles())]:
            archive.writestr(filename, content)
    print(f"Wrote {OUTPUT.name}: {len(data)} data rows and a total row")


if __name__ == "__main__":
    main()
