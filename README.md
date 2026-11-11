# Izborna geografija Srbije

**Interaktivni pregled parlamentarnih izbora 2026. po opštinama i gradovima Srbije.** Mapa, XY grafikon i tabela povezuju izborne rezultate s demografskim i socioekonomskim pokazateljima.

**[Otvori interaktivni prikaz](https://milangr.github.io/izborna-geografija-srbije/)**

![Naslovna slika projekta s mapom opština Srbije](assets/preview.png)

## Šta se može istražiti

- **Mapa:** izaberi pokazatelje za boju opštine i gustinu tačaka, uvećaj prikaz i pogledaj vrijednosti za pojedinačnu opštinu.
- **XY grafikon:** uporedi opštine izborom X i Y ose te veličine i boje krugova. Izbor opštine povezan je s mapom.
- **Tabela:** sortiraj i filtriraj rezultate po opštini, regiji, okrugu i dostupnim pokazateljima. Filteri se po želji primjenjuju i na mapu i grafikon.
- **Preuzimanje:** na stranici je dostupan XLSX sa svim redovima i ukupnim zbirom.

Prikaz obuhvata **161 opštinu i grad** te **22 kosovske opštine s izbornim rezultatima**. Beograd je prikazan kroz 17 gradskih opština. Inostranstvo i zavodi za izvršenje sankcija prikazani su kao zasebni zbirni redovi, bez opštinske geometrije.

Za detaljno poređenje preporučuje se širi ekran. Stranica radi i na telefonu, uz zumiranje mape i grafikona te vodoravno pomjeranje tabele.

## Podaci i način računanja

Izborni rezultati potiču iz [konačnog izvještaja RIK-a](https://www.rik.parlament.gov.rs/vest/sr/822434/75-sednica-republicke-izborne-komisije.php) i [CSV-a po biračkim mjestima](https://www.rik.parlament.gov.rs/export-results/680072/2). Izbori su održani 25. oktobra 2026, a ponovljeno glasanje na 53 biračka mjesta 1. novembra. Udio liste predstavlja njen broj glasova podijeljen ukupnim brojem važećih glasova; izlaznost je broj birača koji su izašli podijeljen brojem upisanih birača.

Demografski pokazatelji koriste [procjene stanovništva RZS-a za 2025](https://publikacije.stat.gov.rs/G2026/HtmlL/G20261178.html) i [Popis 2022](https://popis2022.stat.gov.rs/popisni-podaci-eksel-tabele/). Površine beogradskih opština dolaze iz [Statističkog godišnjaka RZS 2025](https://publikacije.stat.gov.rs/G2025/pdf/G20252058.pdf). Za ostale jedinice površina je izračunata iz pojednostavljenih granica. Podaci o visokom obrazovanju za opštine izvan Beograda preuzeti su od [Stanja Srbije](https://stanjesrbije.rs/pokazatelj/degree/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).

Osnovne opštinske granice dolaze iz [geoBoundaries SRB ADM2](https://www.geoboundaries.org/api/current/gbOpen/SRB/ADM2/) ([tačna korištena verzija](https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SRB/ADM2/geoBoundaries-SRB-ADM2_simplified.geojson)). Izvorni podaci uključuju OpenStreetMap i Wambacher: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Unutrašnje granice Beograda i kosovskih opština izvedene su iz [RIK-ovih vektorskih slojeva](https://www.rik.parlament.gov.rs/542645/rezultati/); osnovni obris Kosova preuzet je iz [Eurostat GISCO NUTS 2024](https://gisco-services.ec.europa.eu/distribution/v2/nuts/nuts-2024-files.html) (© EuroGeographics © UN-FAO © Turkstat).

### Ograničenja prikaza

- Demografski podaci nisu uporedivo dostupni za 22 kosovske opštine. Sedam dodatnih kosovskih oblika nema izborni rezultat i na mapi ostaje sivo.
- Granice Beograda i kosovskih opština približno su poravnate s osnovnom mapom. Nisu pogodne za precizno mjerenje površine ili utvrđivanje administrativne granice.
- Za opštine izvan Beograda gustina stanovništva koristi površinu izvedenu iz pojednostavljenih geometrija; beogradske površine su službene i zaokružene na cijeli km².
- Zbirni pokazatelji računaju se iz pripadajućih ukupnih brojeva gdje je to moguće. Udio mladih i visokog obrazovanja u zbirnom prikazu je prosjek opštinskih udjela s dostupnim podatkom.

Dodatna objašnjenja pojedinačnih pokazatelja i izvora nalaze se u odjeljku **Izvori** na [stranici projekta](https://milangr.github.io/izborna-geografija-srbije/).

## Pokretanje i struktura repozitorija

Stranica je statična: otvori `index.html` u pregledniku ili posluži korijen repozitorija lokalnim HTTP serverom, na primjer `python -m http.server 8000`. Nije potreban korak izgradnje za prikaz stranice.

- `index.html` je ulazna stranica, a `assets/` sadrži stilove, aplikacijski kod, ikonu i naslovnu sliku.
- `data/` sadrži podatke i geometrije koje stranica učitava te XLSX za preuzimanje.
- `sources/` čuva izvorne RIK, RZS i geografske datoteke korištene u pripremi.
- `scripts/` sadrži postupke za pripremu podataka, geometrija i XLSX datoteke.

Za ponovno generisanje XLSX datoteke nakon izmjene izvora pokreni `python scripts/build_socioeconomic_data.py`, a zatim `node scripts/build_export_xlsx.mjs` (potreban je `@oai/artifact-tool`).

Za vlastiti kod projekta nije odabrana posebna licenca. Licence i atribucije izvora podataka i granica navedene su iznad i na stranici projekta.
