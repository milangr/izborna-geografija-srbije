(() => {
  'use strict';
  window.createMetricDefinitions = ({developmentLabels, shortRegions, tableRegions}) => {
    const isDifference = key => key === 'voteDifference' || key === 'differencePer1000';
    const number = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 1});
    const wholeNumber = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 0});
    const wageEur = value => wholeNumber.format(value) + ' €';
    const signedDecimal = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 1, signDisplay: 'exceptZero'});
    const signedWholeNumber = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 0, signDisplay: 'exceptZero'});
    const byName = new Intl.Collator('sr-Latn-RS');
    const percent = value => number.format(value) + '%';
    const densityText = value => number.format(value) + ' stan./km²';
    const metrics = {
      developmentGroup2014: {label: 'Stepen razvijenosti', categorical: true,
        format: value => developmentLabels[value]},
      averageNetWage2025: {label: 'Prosj. neto zarada', unit: 'EUR',
        breaks: [750, 850], format: wageEur},
      votes: {label: 'Udio Lista3 (%)', unit: '%', breaks: [35, 50], format: percent},
      listVotes: {label: 'Glasovi Lista3', breaks: [5000, 20000]},
      snsShare: {label: 'Udio Lista1 (%)', unit: '%', breaks: [35, 50], format: percent},
      snsVotes: {label: 'Glasovi Lista1', breaks: [5000, 20000]},
      voteDifference: {label: 'Razlika glasova (Lista3 - Lista1)', breaks: [0, 5000], format: signedWholeNumber.format},
      differencePer1000: {label: 'Razlika na 1.000 izašlih', normalized: true, breaks: [0, 100], format: signedDecimal.format},
      validVotes: {label: 'Važeći glasovi', breaks: [10000, 40000]},
      invalidShare: {label: 'Nevažeći listići (%)', unit: '%', breaks: [1.2, 1.6], format: percent},
      turnout: {label: 'Izlaznost (%)', unit: '%', breaks: [50, 65], format: percent},
      votersAttended: {label: 'Izašli birači', breaks: [10000, 40000]},
      registeredVoters: {label: 'Upisani birači', breaks: [20000, 60000]},
      stations: {label: 'Biračka mjesta', breaks: [30, 75]},
      population: {label: 'Broj stanovnika', breaks: [20000, 75000]},
      density: {label: 'Gustina', unit: 'stan./km²', breaks: [60, 150], format: densityText},
      areaKm2: {label: 'Površina', unit: 'km²', breaks: [300, 700], format: value => number.format(value) + ' km²'},
      age0_14Share: {label: 'Uzrast 0-14 (%)', unit: '%', breaks: [13, 15], format: percent},
      youthShare: {label: 'Uzrast 15-29 (%)', unit: '%', breaks: [14.5, 15.5], format: percent},
      age30_44Share: {label: 'Uzrast 30-44 (%)', unit: '%', breaks: [18, 21], format: percent},
      age45_64Share: {label: 'Uzrast 45-64 (%)', unit: '%', breaks: [27, 30], format: percent},
      age65PlusShare: {label: 'Uzrast 65+ (%)', unit: '%', breaks: [20, 25], format: percent},
      higherEducationShare: {label: 'Više/visoko obrazovani (%)', unit: '%', breaks: [11, 15], format: percent},
    };
    const metricValue = (entry, key) => Number.isFinite(entry[key])
      ? (metrics[key].format || wholeNumber.format)(entry[key]) : '-';
    const summedMetrics = new Set(['listVotes', 'snsVotes', 'voteDifference', 'validVotes',
      'votersAttended', 'registeredVoters', 'stations', 'population', 'areaKm2']);
    const signed = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 1, signDisplay: 'exceptZero'});
    const metricLabel = key => {
      const {label, unit} = metrics[key];
      return unit && !label.endsWith('(' + unit + ')') ? label + ' (' + unit + ')' : label;
    };
    const mapLegendLabel = (key, label = metricLabel(key)) => {
      if (label.endsWith(' (hilj.)')) return label.replace(/ \(hilj\.\)$/, '\n(hilj.)');
      const breaks = [...label.matchAll(/ /g)].map(match => match.index);
      const split = breaks.reduce((best, index) => {
        const longest = Math.max(index, label.length - index - 1);
        return !best || longest < best.longest ? {index, longest} : best;
      }, null);
      return split ? label.slice(0, split.index) + '\n' + label.slice(split.index + 1) : label;
    };
    const metricColumns = Object.entries(metrics).map(([key, metric]) => ({
      key,
      label: metricLabel(key),
      format: isDifference(key) ? metrics[key].format
        : metric.unit === '%' ? percent
        : metric.unit === 'stan./km²' || metric.unit === 'km²' ? number.format : wholeNumber.format,
    })).filter(column => !['developmentGroup2014', 'averageNetWage2025'].includes(column.key));
    const columns = [
      {key: 'name', label: 'Opština / grad'},
      {key: 'region', label: 'Regija', format: code => shortRegions[code] || tableRegions[code]},
      {key: 'district', label: 'Okrug', format: value => value.replace(/ okrug$/, '')},
      {key: 'developmentGroup2014', label: metricLabel('developmentGroup2014'), format: value => developmentLabels[value]},
      {key: 'averageNetWage2025', label: metricLabel('averageNetWage2025'), format: wageEur},
      metricColumns.find(column => column.key === 'voteDifference'),
      metricColumns.find(column => column.key === 'differencePer1000'),
      ...metricColumns.filter(column => !isDifference(column.key)),
    ];
    const sourceLinks = {
      rik: ['RIK · konačni rezultati', 'https://www.rik.parlament.gov.rs/542645/rezultati/'],
      rikCsv: ['RIK · podaci po biračkim mjestima', 'https://www.rik.parlament.gov.rs/export-results/680072/2'],
      population: ['RZS · procjene stanovništva 2025', 'https://publikacije.stat.gov.rs/G2026/HtmlL/G20261178.html'],
      development: ['Vlada RS · uredba za 2014', 'https://ras.gov.rs/uploads/2020/05/uredba-o-utvrdivanju-jedinstvene-liste-razvijenosti-regiona-i-jedinica.pdf'],
      wages: ['RZS · zarade 2025, tabela 4', 'https://publikacije.stat.gov.rs/G2026/HtmlL/G20261050.html'],
      exchangeRate: ['NBS · prosječni kurs za 2025', 'https://www.nbs.rs/export/sites/NBS_site/documents-eng/publikacije/sb/sb_03_26.pdf'],
      ages: ['RZS · Popis 2022, starost', 'https://publikacije.stat.gov.rs/G2024/PdfE/G202413051.pdf'],
      education: ['RZS · Popis 2022, obrazovanje', 'https://popis2022.stat.gov.rs/popisni-podaci-eksel-tabele/'],
      educationShare: ['Stanje Srbije · obrazovanje', 'https://stanjesrbije.rs/pokazatelj/degree/'],
      boundaries: ['geoBoundaries · granice opština', 'https://www.geoboundaries.org/api/current/gbOpen/SRB/ADM2/'],
      belgradeArea: ['RZS · površine Beograda, tabela 20.1', 'https://publikacije.stat.gov.rs/G2025/pdf/G20252058.pdf'],
    };
    const columnHelp = {
      name: ['Naziv opštine ili grada za koji su prikazani rezultati.\nBeograd je razložen na 17 gradskih opština.', ['rik']],
      region: ['Statistička regija kojoj pripada jedinica; „Ostalo” označava glasanje bez opštinske geometrije.', ['rik']],
      district: ['Upravni okrug opštine ili grada.\nZa Inostranstvo i Kaznene zavode prikazan je naziv posebne kategorije.', ['rik']],
      developmentGroup2014: ['Zvanična klasifikacija iz 2014: I iznad prosjeka; II 80-100%; III 60-80%; IV ispod 60%.\nV je devastirana podgrupa IV, ispod 50%.\nSvih 17 beogradskih opština ima grupu Grada Beograda.', ['development']],
      differencePer1000: ['1000 × (glasovi Lista3 - glasovi Lista1) / broj izašlih.\nPozitivno znači prednost Liste3, negativno prednost Liste1.\nZbirna vrijednost računa se iz ukupnih glasova i izašlih.', ['rik']],
      voteDifference: ['Glasovi Lista3 minus glasovi Lista1.\nPozitivna traka ide udesno, negativna ulijevo.', ['rik']],
      votes: ['Udio glasova za Lista3 među važećim glasovima.\nTraka prikazuje udio na skali od 0 do 100%.', ['rik']],
      listVotes: ['Broj glasova za Lista3.', ['rik']],
      snsShare: ['Udio glasova za Lista1 među važećim glasovima.', ['rik']],
      snsVotes: ['Broj glasova za Lista1.', ['rik']],
      validVotes: ['Broj važećih glasova.', ['rik']],
      invalidShare: ['Broj nevažećih listića podijeljen brojem listića pronađenih u kutijama.', ['rik']],
      turnout: ['Broj birača koji su izašli podijeljen brojem upisanih birača.', ['rik']],
      votersAttended: ['Broj birača koji su izašli na glasanje.', ['rik']],
      registeredVoters: ['Broj upisanih birača.', ['rik']],
      stations: ['Broj jedinstvenih biračkih mjesta u konačnim podacima RIK-a.', ['rikCsv']],
      population: ['Godišnji prosjek procijenjenog broja stanovnika u 2025.', ['population']],
      density: ['Procijenjeni broj stanovnika 2025. podijeljen površinom opštine u km².', ['population', 'boundaries', 'belgradeArea']],
      areaKm2: ['Površina u km²: za beogradske opštine prema RZS-u, za ostale iz pojednostavljenih granica.', ['belgradeArea', 'boundaries']],
      age0_14Share: ['Udio stanovnika od 0 do 14 godina prema Popisu 2022; zbir grupa 0-4, 5-9 i 10-14.', ['ages']],
      youthShare: ['Udio stanovnika od 15 do 29 godina prema Popisu 2022; zbir grupa 15-19, 20-24 i 25-29.', ['ages']],
      age30_44Share: ['Udio stanovnika od 30 do 44 godine prema Popisu 2022; zbir grupa 30-34, 35-39 i 40-44.', ['ages']],
      age45_64Share: ['Udio stanovnika od 45 do 64 godine prema Popisu 2022; zbir grupa 45-49, 50-54, 55-59 i 60-64.', ['ages']],
      age65PlusShare: ['Udio stanovnika od 65 godina naviše prema Popisu 2022.', ['ages']],
      higherEducationShare: ['Udio stanovnika od 15 godina naviše s višim ili visokim obrazovanjem prema Popisu 2022.', ['education', 'educationShare']],
      averageNetWage2025: ['Prosječna mjesečna neto zarada u 2025. prema prebivalištu zaposlenih.\nPribližan prikaz u EUR: izvorni RSD iznos podijeljen kursom 117,2026.\nFilter koristi EUR.', ['wages', 'exchangeRate']],
    };
    return {number, wholeNumber, wageEur, signedDecimal, signedWholeNumber, byName, percent, metrics, metricValue, summedMetrics, signed, metricLabel, mapLegendLabel, isDifference, columns, sourceLinks, columnHelp};
  };
})();
