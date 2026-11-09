# Izborna geografija Srbije

Interaktivna mapa konačnih rezultata parlamentarnih izbora 2026. za 161 opštinu i grad te 22 kosovske opštine. Demografski pokazatelji dostupni su za prvih 161 jedinicu.

## Pregled i objava na GitHub Pages

- Za lokalni pregled otvori `index.html`. Ostale datoteke ostavi u istom folderu.
- `favicon.ico` je ikona stranice; po potrebi se može ponovo napraviti pomoću `scripts/build_favicon.py` (Pillow).
- Na besplatnom GitHub planu napravi **javni** repozitorij i prenesi sadržaj ovog foldera u korijen grane `main`, uključujući `.nojekyll`. Datoteke iz `.gitignore` ne dodaj u repozitorij.
- Na GitHubu otvori **Settings → Pages → Build and deployment → Deploy from a branch**, izaberi `main` i **/(root)**, pa sačuvaj. Adresa će biti `https://KORISNICKO_IME.github.io/NAZIV_REPOZITORIJA/`.
- Ako projekat objaviš u javnom repozitoriju nazvanom tačno `KORISNICKO_IME.github.io`, adresa će biti `https://KORISNICKO_IME.github.io/`.
- GitHub Pages objavljuje statične datoteke. Podaci u JavaScript datotekama koje stranica učitava dostupni su svakome ko otvori sajt. U javnom repozitoriju dostupni su i izvorni kod, skripte i izvorne geometrije. Ne dodaj privatne podatke ni pristupne ključeve.

[Uputstvo za GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

Za vlastiti kod ovog projekta nije odabrana posebna licenca. Atribucije i licence izvora podataka i granica navedene su u odjeljku „Podaci” i na samoj stranici.

## Podaci

Osnovne vrijednosti su u `data.js`, a podaci za 17 beogradskih gradskih opština u `beograd-results.js`. Pri prikazu se zbirni red Beograda iz `data.js` zamjenjuje ovih 17 opština, tako da nema dvostrukog računanja. Svaki zapis sadrži broj glasova za studentsku listu (lista 3) i SNS koalicionu listu (lista 1), broj važećih glasova, procijenjeni broj stanovnika i površinu u km², iz kojih su izvedeni udjeli obje liste i gustina. Polje `id` povezuje zapis s granicom na mapi.

Okrug je preuzet iz kolone `okrug_region` u RIK Excel datoteci pomoću `scripts/add_districts.py`. Gradske opštine Niša, Požarevca i Užica su objedinjene u gradsku cjelinu; Beograd je prikazan po 17 gradskih opština. Svaka prikazana jedinica pripada tačno jednom okrugu.

Beogradski opštinski rezultati nastaju iz RIK XLSX-a pomoću `scripts/build_beograd_results.py`. Stanovništvo i udio 65+ dolaze iz [RZS procjena za 2025](https://publikacije.stat.gov.rs/G2026/HtmlL/G20261178.html), površine iz [Statističkog godišnjaka RZS 2025, tabela 20.1](https://publikacije.stat.gov.rs/G2025/pdf/G20252058.pdf), a udio mladih i školskog obrazovanja iz [opštinskih tabela Popisa 2022](https://popis2022.stat.gov.rs/popisni-podaci-eksel-tabele/). Skripta provjerava da se zbir izbornih glasova, stanovništva i popisnih udjela slaže s ranijim zbirnim redom Beograda. Granice 17 opština su iz [RIK-ovog vektorskog sloja](https://www.rik.parlament.gov.rs/js/map/assets/rs/jquery-jvectormap-data-rs11-lcc-cr.js), projektovane i približno poravnate s obrisom Beograda iz geoBoundaries pomoću `scripts/build_beograd_shapes.py`. Pošto se ta dva obrisa razlikuju, granice na mapi su približne. Gustine su izračunate iz službenih opštinskih površina, koje su u godišnjaku zaokružene na cijeli km².

Kosovska 22 opštinska reda nastaju iz istog Excel izvora pomoću `scripts/add_kosovo_results.py` i nalaze se u `kosovo-results.js`. Oblici 29 kosovskih opština preuzeti su iz [RIK-ove interaktivne mape](https://www.rik.parlament.gov.rs/542645/rezultati/) ([vektorski sloj](https://www.rik.parlament.gov.rs/js/map/assets/rs/jquery-jvectormap-data-rs23-lcc-cr.js), lokalna kopija `rik-kosovo-map.js`) i prilagođeni projekciji lokalne mape pomoću `scripts/build_kosovo_shapes.py`; 22 imaju izborne rezultate, a sedam ostaje sivo. Poravnanje s osnovnim obrisom je približno. Nema uporedivih demografskih metrika. Inostranstvo i zavodi za izvršenje sankcija su dva zbirna reda iz `scripts/add_special_results.py` i `special-results.js`, bez geometrije.

Udio nevažećih listića u tabeli računa se kao broj nevažećih listića podijeljen brojem listića pronađenih u kutijama. Ukupni red računa taj udio iz zbirnih brojeva. Izvorni brojevi se dodaju iz RIK CSV-a pomoću `scripts/add_invalid_ballots.py`. Glasovi SNS koalicione liste za osnovnih 145 jedinica dodaju se iz RIK XLSX-a pomoću `scripts/add_sns_votes.py`; beogradski, kosovski i posebni redovi dobijaju ih iz svojih skripti.

Tabela se može sortirati klikom na zaglavlje i filtrirati po nazivu, statističkoj regiji i rasponima brojčanih vrijednosti. Njene brojčane kolone odgovaraju metrikama koje se mogu izabrati na mapi i XY grafikonu. Opcija **Primijeni filtere na mapu i XY** prenosi isti izbor jedinica na oba prikaza. Na mapi ostaju sive granice ostalih opština, a XY zadržava skale radi poređenja. Broj biračkih mjesta predstavlja broj jedinstvenih biračkih mjesta u konačnom CSV-u za prikazanu jedinicu. Izlaznost je broj birača koji su izašli podijeljen brojem upisanih birača.

Veza **Preuzmi XLSX · svi redovi** preuzima svih 185 redova i ukupni red, nezavisno od filtera i sortiranja na stranici. Datoteka `izborna-geografija-srbije-2026.xlsx` nastaje iz istih JS podataka pomoću `python scripts/build_export_xlsx.py`; ponovo pokreni skriptu nakon izmjene podataka.

Udio mladih 15–29 računa se od ukupnog stanovništva prema [Popisu 2022, RZS](https://publikacije.stat.gov.rs/G2024/PdfE/G202413051.pdf), sabiranjem grupa 15–19, 20–24 i 25–29. Udio 65+ računa se od ukupnog stanovništva iz [procjena RZS-a za 2025, tabela 6](https://publikacije.stat.gov.rs/G2026/HtmlL/G20261178.html). Udio sa višim ili visokim obrazovanjem odnosi se na stanovnike od 15 godina naviše iz Popisa 2022. Za beogradske opštine izračunat je direktno iz opštinske tabele Popisa 2022; ostale opštinske udjele prenosi [Stanje Srbije](https://stanjesrbije.rs/pokazatelj/degree/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).

Mapa i XY grafikon prikazani su jedan pored drugog na širim ekranima. Na mapi se nezavisno biraju metrika boje i metrika gustine tačaka. Na XY grafikonu se biraju X i Y osa, veličina i boja kruga. Početni XY prikaz koristi udio važećih glasova za studentsku listu, izlaznost, broj birača koji su izašli i boju prema statističkoj regiji. Veličina koristi nelinearnu skalu koja povećava vidljivost manjih opština. Izbor opštine zajednički je za oba prikaza. Isprekidana linija prati prag od 50% na osi koja prikazuje udio studentske ili SNS liste.

Vodoravna referentna linija XY grafikona koristi iste zbirne pokazatelje kao kartice iznad: izlaznost je zbir izašlih podijeljen zbirom upisanih birača, izborni udjeli računaju se iz zbirnih glasova, gustina iz zbirnog stanovništva i površine, a udio 65+ ponderisan je stanovništvom. Za brojčane veličine te udjele mladih i visokog obrazovanja linija prikazuje aritmetički prosjek opština s dostupnom vrijednošću. U oba slučaja obuhvata opštine trenutno uključene regijama i, ako je uključena opcija „Primijeni filtere na mapu i XY”, filterom tabele.

Obrisi četiri statističke regije na mapi nastaju spajanjem postojećih opštinskih geometrija pomoću `scripts/build_region_outlines.py`. Kosovski obris je preuzet iz postojeće podloge. Prikazani su u bojama regija i prigušuju se kada se regija isključi iz prikaza.

Mapa dopušta uvećanje do 12 puta. Kada nijedna opština nije odabrana, polja iznad mape i XY grafikona prikazuju sažetak trenutno vidljivih opština u uključenim regijama. Brojevi su zbirni, izborni udjeli računaju se iz zbirnih glasova, gustina iz zbirnog stanovništva i površine, udio 65+ ponderisan je stanovništvom, a udjeli mladih i visokog obrazovanja prikazani su kao prosti prosjeci opština. Za Kosovo i Metohiju demografske vrijednosti ostaju nedostupne.

- [RIK CSV po biračkim mjestima](https://www.rik.parlament.gov.rs/export-results/680072/2) i [konačni izvještaj](https://www.rik.parlament.gov.rs/vest/sr/822434/75-sednica-republicke-izborne-komisije.php). Izbori su održani 25. oktobra 2026, a glasanje na 53 biračka mjesta ponovljeno 1. novembra. Udio predstavlja glasove za listu broj 3 podijeljene svim važećim glasovima. Beograd je razdvojen na gradske opštine; za Niš, Požarevac i Užice glasovi iz gradskih opština sabrani su u gradsku cjelinu.
- [RZS, procjena stanovništva za 2025, tabela 4](https://publikacije.stat.gov.rs/G2026/HtmlL/G20261178.html). Koristi se godišnji prosjek. Gustina je izračunata dijeljenjem procjene stanovništva površinom. Za beogradske opštine uzete su službene površine iz [RZS godišnjaka](https://publikacije.stat.gov.rs/G2025/pdf/G20252058.pdf); za ostale jedinice površina je izračunata iz pojednostavljenih granica geoBoundaries na sferi poluprečnika 6.371,0088 km.

Osnovne granice opština i gradova dolaze iz [geoBoundaries SRB ADM2](https://www.geoboundaries.org/api/current/gbOpen/SRB/ADM2/). Izvor su OpenStreetMap i Wambacher. © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Geometrije su projektovane i zaokružene za prikaz. Beograd je jedna teritorijalna jedinica u tom izvornom skupu; njegovu unutrašnju podjelu daje RIK-ova mapa.

[Tačna verzija GeoJSON granica korištena u prikazu](https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SRB/ADM2/geoBoundaries-SRB-ADM2_simplified.geojson)

Osnovni obris Kosova je iz [Eurostat GISCO NUTS 2024](https://gisco-services.ec.europa.eu/distribution/v2/nuts/nuts-2024-files.html). © EuroGeographics © UN-FAO © Turkstat. Opštinski oblici i rezultati za 22 opštine opisani su iznad; sedam oblika bez rezultata ostaje sivo.
