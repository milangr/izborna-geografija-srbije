(() => {
  'use strict';

  const kosovoResults = window.kosovoResults || [];
  const data = [...window.municipalityData.filter(entry => entry.name !== 'Beograd'),
    ...window.beogradResults, ...kosovoResults.filter(entry => entry.mapped)];
  const specialResults = [...kosovoResults.filter(entry => !entry.mapped).map(entry => ({...entry, special: true})),
    ...(window.specialResults || []).map(entry => ({...entry, region: 'OTHER', district: entry.name}))];
  const tableData = [...data, ...specialResults];
  const developmentLabels = {1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V'};
  for (const entry of tableData) {
    const socioeconomic = window.socioeconomicData?.[entry.name];
    entry.developmentGroup2014 = socioeconomic?.developmentGroup2014 ?? null;
    entry.averageNetWage2025 = socioeconomic?.averageNetWage2025 ?? null;
    entry.snsShare = Number.isFinite(entry.snsVotes) && Number.isFinite(entry.validVotes) && entry.validVotes > 0
      ? 100 * entry.snsVotes / entry.validVotes : null;
    entry.voteDifference = Number.isFinite(entry.listVotes) && Number.isFinite(entry.snsVotes)
      ? entry.listVotes - entry.snsVotes : null;
  }
  const maxVoteDifference = Math.max(1, ...tableData.map(entry => Math.abs(entry.voteDifference || 0)));
  const maxWage = Math.max(1, ...tableData.map(entry => entry.averageNetWage2025 || 0));
  const byId = new Map(tableData.map(entry => [entry.id, entry]));
  const number = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 1});
  const wholeNumber = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 0});
  const signedWholeNumber = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 0, signDisplay: 'exceptZero'});
  const byName = new Intl.Collator('sr-Latn-RS');
  const regions = {
    RS11: 'Beogradski region',
    RS12: 'Vojvodina',
    RS21: 'Šumadija i Zapadna Srbija',
    RS22: 'Južna i Istočna Srbija',
    RS23: 'Kosovo i Metohija',
    OTHER: 'Ostalo',
  };
  const tableRegions = {
    ...regions,
    OTHER: 'Ostalo',
  };
  const selectedRegions = new Set(Object.keys(regions));
  const shortRegions = {
    RS11: 'Beograd',
    RS12: 'Vojvodina',
    RS21: 'Šum. i Zap. Srb.',
    RS22: 'Juž. i Ist. Srb.',
    RS23: 'Kosovo i Metohija',
    OTHER: 'Ostalo',
  };
  const get = id => document.getElementById(id);
  const map = document.querySelector('.map');
  const stage = document.querySelector('.map-stage');
  const specialMapControls = stage.querySelector('.map-specials');
  const mappedSpecialResults = specialResults.filter(entry => entry.region === 'OTHER');
  const selection = map.querySelector('.selection');
  const hoverOutline = map.querySelector('.hover-outline');
  const tooltip = stage.querySelector('.map-tooltip');
  const mapReadout = document.querySelector('.map-panel .metric-controls');
  const beogradShapeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  beogradShapeGroup.classList.add('beograd-shapes');
  for (const shape of window.beogradShapes) {
    const unit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    unit.id = shape.id;
    unit.setAttribute('d', shape.path);
    unit.classList.add('unit');
    unit.dataset.unit = '';
    beogradShapeGroup.append(unit);
    const texture = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    texture.id = shape.id + '-texture';
    texture.classList.add('texture');
    texture.setAttribute('d', shape.path);
    beogradShapeGroup.append(texture);
  }
  const kosovoShapeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  kosovoShapeGroup.classList.add('kosovo-shapes');
  for (const shape of window.kosovoShapes) {
    const unit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    unit.setAttribute('d', shape.path);
    unit.classList.add('unit', 'missing');
    if (shape.id) {
      unit.id = shape.id;
      unit.dataset.unit = '';
    } else {
      unit.classList.add('unreported');
    }
    kosovoShapeGroup.append(unit);
    if (shape.id) {
      const texture = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      texture.id = shape.id + '-texture';
      texture.classList.add('texture');
      texture.setAttribute('d', shape.path);
      kosovoShapeGroup.append(texture);
    }
  }
  const outlineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  outlineGroup.classList.add('region-outlines');
  const kosovoBase = map.querySelector('.unit.missing');
  for (const [code, path] of Object.entries({...window.regionOutlines, RS23: kosovoBase.getAttribute('d')})) {
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    outline.classList.add('region-outline');
    outline.dataset.region = code;
    outline.setAttribute('d', path);
    outlineGroup.append(outline);
  }
  map.insertBefore(outlineGroup, hoverOutline);
  map.insertBefore(kosovoShapeGroup, outlineGroup);
  map.insertBefore(beogradShapeGroup, outlineGroup);
  get('rs-municipality-23-texture').remove();
  get('rs-municipality-23').remove();
  for (const unit of map.querySelectorAll('.beograd-shapes [data-unit], .kosovo-shapes [data-unit]')) {
    const bounds = unit.getBBox();
    unit.dataset.x = bounds.x + bounds.width / 2;
    unit.dataset.y = bounds.y + bounds.height / 2;
  }
  const patterns = map.querySelectorAll('pattern[data-map-pattern]');
  const [,, width, height] = map.getAttribute('viewBox').split(' ').map(Number);
  const maxMapZoom = 12;
  let scale = 1;
  let left = 0;
  let top = 0;
  let selected = null;
  let selectedSpecial = null;
  let drag = null;
  let mapPinch = null;
  let ignoreMapClickUntil = 0;
  let visualFilter = null;
  let scatter = null;
  const isVisible = id => selectedRegions.has(byId.get(id).region) && (!visualFilter || visualFilter.has(id));

  const percent = value => number.format(value) + '%';
  const densityText = value => number.format(value) + ' stan./km²';
  const compact = new Intl.NumberFormat('sr-Latn-RS', {notation: 'compact', maximumFractionDigits: 1});
  const metrics = {
    developmentGroup2014: {label: 'Razvijenost (2014)', categorical: true,
      format: value => developmentLabels[value]},
    averageNetWage2025: {label: 'Prosj. neto zarada (2025)', unit: 'RSD',
      breaks: [90000, 110000]},
    votes: {label: 'Udio liste Lista3 (%)', unit: '%', breaks: [35, 50], format: percent},
    listVotes: {label: 'Glasovi liste Lista3', breaks: [5000, 20000]},
    snsShare: {label: 'Udio SNS liste (%)', unit: '%', breaks: [35, 50], format: percent},
    snsVotes: {label: 'Glasovi SNS liste', breaks: [5000, 20000]},
    voteDifference: {label: 'Razlika glasova (Lista3 − SNS)', breaks: [0, 5000], format: signedWholeNumber.format},
    validVotes: {label: 'Važeći glasovi', breaks: [10000, 40000]},
    invalidShare: {label: 'Nevažeći listići (%)', unit: '%', breaks: [1.2, 1.6], format: percent},
    turnout: {label: 'Izlaznost (%)', unit: '%', breaks: [50, 65], format: percent},
    votersAttended: {label: 'Birači koji su izašli', breaks: [10000, 40000]},
    registeredVoters: {label: 'Upisani birači', breaks: [20000, 60000]},
    stations: {label: 'Biračka mjesta', breaks: [30, 75]},
    population: {label: 'Stanovništvo (2025)', breaks: [20000, 75000]},
    density: {label: 'Gustina (2025)', unit: 'stan./km²', breaks: [60, 150], format: densityText},
    areaKm2: {label: 'Površina', unit: 'km²', breaks: [300, 700], format: value => number.format(value) + ' km²'},
    youthShare: {label: 'Mladi 15–29 (2022) (%)', unit: '%', breaks: [14.5, 15.5], format: percent},
    age65PlusShare: {label: 'Uzrast 65+ (2025) (%)', unit: '%', breaks: [24, 26.5], format: percent},
    higherEducationShare: {label: 'Više ili visoko obrazovanje (2022) (%)', unit: '%', breaks: [11, 15], format: percent},
  };
  const metricValue = (entry, key) => Number.isFinite(entry[key])
    ? (metrics[key].format || wholeNumber.format)(entry[key]) : '—';
  const aggregateMetricLabels = {
    votes: 'Ukupni udio', snsShare: 'Ukupni udio', invalidShare: 'Ukupni udio',
    turnout: 'Ukupna izlaznost', density: 'Ukupna gustina', age65PlusShare: 'Ponderisani udio',
    voteDifference: 'Zbirna razlika',
  };
  const metricAverages = {};
  let averageRevision = 0;
  const benchmarkLabel = key => aggregateMetricLabels[key] || 'Prosjek opština';
  function refreshMetricAverages() {
    const entries = data.filter(entry => isVisible(entry.id));
    const summary = summarizeSelectedRegions();
    for (const key of Object.keys(metrics)) {
      if (metrics[key].categorical) {
        metricAverages[key] = NaN;
        continue;
      }
      if (key in aggregateMetricLabels) {
        metricAverages[key] = summary?.[key] ?? NaN;
      } else {
        const values = entries.map(entry => entry[key]).filter(Number.isFinite);
        metricAverages[key] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
      }
    }
    averageRevision++;
  }
  refreshMetricAverages();
  const signed = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 1, signDisplay: 'exceptZero'});
  const metricLabel = key => {
    const {label, unit} = metrics[key];
    return unit && !label.endsWith('(' + unit + ')') ? label + ' (' + unit + ')' : label;
  };
  const mapLegendLabel = key => {
    const label = metricLabel(key);
    const breaks = [...label.matchAll(/ /g)].map(match => match.index);
    const split = breaks.reduce((best, index) => {
      const longest = Math.max(index, label.length - index - 1);
      return !best || longest < best.longest ? {index, longest} : best;
    }, null);
    return split ? label.slice(0, split.index) + '\n' + label.slice(split.index + 1) : label;
  };
  function showPlotValues(readout, entry, controls, regionSummary = false) {
    const scope = readout.closest('.panel').querySelector('.readout-scope');
    const scopeText = !entry ? 'Nema podataka' : regionSummary
      ? entry.summaryLabel + (visualFilter ? ' · filtrirani zbir' : ' · zbir')
      : entry.name + (entry.special ? ' · zbirna jedinica' : ' · opština');
    scope.textContent = scopeText;
    scope.title = scopeText;
    const state = [entry?.id || '', averageRevision, regionSummary,
      ...controls.map(id => get(id).value),
      ...(regionSummary ? controls.map(id => entry?.[get(id).value]) : [])].join('|');
    if (readout.dataset.values === state) return;
    readout.dataset.values = state;
    for (const id of controls) {
      const key = get(id).value;
      const result = get(id + '-value');
      const value = document.createElement('strong');
      value.textContent = entry ? (key === 'region' ? entry.summaryLabel || regions[entry.region]
        : regionSummary && metrics[key].categorical ? 'po grupama' : metricValue(entry, key)) : '—';
      result.replaceChildren(value);
      if (!regionSummary && key !== 'region') appendBenchmark(result, key, entry);
      result.title = result.textContent;
    }
  }

  function appendBenchmark(value, key, entry) {
    if (metrics[key].categorical) return;
    const average = metricAverages[key];
    if (!Number.isFinite(average)) return;
    const track = document.createElement('span');
    track.className = 'benchmark-track';
    track.setAttribute('aria-hidden', 'true');
    const note = document.createElement('span');
    note.className = 'plot-benchmark';
    note.title = key in aggregateMetricLabels
      ? 'Vrijednost iz zbirnih podataka za vidljive opštine.'
      : 'Aritmetički prosjek vidljivih opština i gradova.';
    note.textContent = benchmarkLabel(key) + ' ' + metricValue({[key]: average}, key);
    if (key === 'voteDifference') {
      value.append(note);
      return;
    }
    if (entry && Number.isFinite(entry[key])) {
      const current = entry[key];
      const point = document.createElement('span');
      point.className = 'benchmark-point';
      point.classList.add(current < average ? 'is-below' : current > average ? 'is-above' : 'is-average');
      point.style.setProperty('--point', 100 * current / (current + average) + '%');
      track.append(point);
      const percentage = metrics[key].unit === '%';
      const difference = percentage ? current - average : 100 * (current - average) / average;
      note.textContent += ' · ' + signed.format(difference) + (percentage ? ' p. p.' : '%');
    }
    value.append(track, note);
  }
  const metricClass = (value, [low, high]) => value < low ? 0 : value < high ? 1 : 2;
  function rangeLabels(key) {
    const format = key === 'voteDifference' ? signedWholeNumber.format
      : metrics[key].unit === '%' ? percent : compact.format;
    const [low, high] = metrics[key].breaks.map(format);
    return ['< ' + low, '≥ ' + low + ' i < ' + high, '≥ ' + high];
  }
  const mapBreaks = {};
  for (const key of Object.keys(metrics)) {
    if (metrics[key].categorical) continue;
    const values = data.map(entry => entry[key]).filter(Number.isFinite).sort((a, b) => a - b);
    if (!values.length) continue;
    const quantile = (items, fraction) => items[Math.min(items.length - 1, Math.ceil(items.length * fraction) - 1)];
    if (key === 'voteDifference') {
      mapBreaks[key] = metrics[key].breaks;
    } else {
      const centralSpread = quantile(values, .8) - quantile(values, .2);
      const step = 10 ** Math.floor(Math.log10(centralSpread / 4 || 1));
      mapBreaks[key] = [1 / 3, 2 / 3].map(fraction => Math.round(quantile(values, fraction) / step) * step);
      if (mapBreaks[key][1] <= mapBreaks[key][0]) mapBreaks[key][1] = mapBreaks[key][0] + step;
    }
  }
  const mapColorClass = (value, key) => mapBreaks[key].reduce((level, boundary) => level + (value >= boundary), 0);
  const mapRangeLabels = key => {
    const format = key === 'voteDifference' ? signedWholeNumber.format
      : metrics[key].unit === '%' ? percent : compact.format;
    const breaks = mapBreaks[key].map(format);
    return ['< ' + breaks[0], '≥ ' + breaks[0] + ' i < ' + breaks[1], '≥ ' + breaks[1]];
  };
  const mapDevelopmentGroup = code => code <= 2 ? 1 : code <= 4 ? 3 : 5;
  function metricSelect(id, defaultValue, includeRegions = false) {
    const select = get(id);
    if (includeRegions) select.add(new Option('Statistička regija', 'region'));
    for (const key of Object.keys(metrics)) {
      if (metrics[key].categorical && (id === 'map-texture' || id === 'scatter-size')) continue;
      if (id === 'scatter-size' && key === 'voteDifference') continue;
      select.add(new Option(metricLabel(key), key));
    }
    select.value = defaultValue;
    const updateTitle = () => { select.title = select.selectedOptions[0]?.textContent || ''; };
    updateTitle();
    select.addEventListener('change', updateTitle);
    select.addEventListener('wheel', event => {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      const next = select.selectedIndex + Math.sign(event.deltaY);
      if (next >= 0 && next < select.options.length) {
        select.selectedIndex = next;
        select.dispatchEvent(new Event('change', {bubbles: true}));
      } else {
        const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
        window.scrollBy(event.deltaX * step, event.deltaY * step);
      }
    }, {passive: false});
    return select;
  }
  const mapColor = metricSelect('map-color', 'voteDifference');
  const mapTexture = metricSelect('map-texture', 'density');
  const mapLegend = document.querySelector('.map-panel .legend');
  const colorCaption = mapLegend.querySelector('caption');
  const colorMatrix = mapLegend.querySelector('table');
  const regionLegend = mapLegend.querySelector('.map-region-legend');
  colorMatrix.classList.add('map-numeric-legend');
  const numericHead = colorMatrix.querySelector('thead tr');
  numericHead.replaceChildren(document.createElement('th'));
  for (let level = 0; level < 3; level++) {
    const heading = document.createElement('th');
    heading.scope = 'col';
    numericHead.append(heading);
  }
  const numericBody = colorMatrix.querySelector('tbody');
  numericBody.replaceChildren();
  for (let density = 2; density >= 0; density--) {
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.className = 'row-head';
    row.append(heading);
    for (let level = 0; level < 3; level++) {
      const cell = document.createElement('td');
      const swatch = document.createElement('span');
      swatch.className = 'map-color-swatch v' + level;
      swatch.style.setProperty('--dot-spacing', [11, 7, 4][density] + 'px');
      swatch.setAttribute('aria-hidden', 'true');
      cell.append(swatch);
      row.append(cell);
    }
    numericBody.append(row);
  }
  const developmentLegend = document.createElement('table');
  developmentLegend.className = 'map-development-legend';
  developmentLegend.setAttribute('aria-label', 'Boja razvijenosti po gustini tačaka');
  mapLegend.append(developmentLegend);
  const developmentTitle = document.createElement('caption');
  developmentTitle.textContent = 'Boja · Razvijenost (2014)';
  developmentLegend.append(developmentTitle);
  const developmentHead = document.createElement('thead');
  const developmentHeadRow = document.createElement('tr');
  developmentHeadRow.append(document.createElement('th'));
  const developmentColumns = [5, 3, 1];
  for (const [index] of developmentColumns.entries()) {
    const heading = document.createElement('th');
    heading.scope = 'col';
    heading.textContent = ['V', 'III · IV', 'I · II'][index];
    developmentHeadRow.append(heading);
  }
  developmentHead.append(developmentHeadRow);
  developmentLegend.append(developmentHead);
  const developmentBody = document.createElement('tbody');
  for (let density = 2; density >= 0; density--) {
    const row = document.createElement('tr');
    const rowHeading = document.createElement('th');
    rowHeading.scope = 'row';
    rowHeading.className = 'row-head';
    row.append(rowHeading);
    for (const code of developmentColumns) {
      const cell = document.createElement('td');
      const swatch = document.createElement('span');
      swatch.className = 'map-development-swatch';
      swatch.dataset.development = code;
      swatch.style.setProperty('--dot-spacing', [11, 7, 4][density] + 'px');
      swatch.setAttribute('aria-hidden', 'true');
      cell.append(swatch);
      row.append(cell);
    }
    developmentBody.append(row);
  }
  developmentLegend.append(developmentBody);
  const developmentNote = document.createElement('p');
  developmentNote.className = 'map-development-note';
  developmentNote.textContent = 'V = devastirano; po uredbi podgrupa IV';
  mapLegend.append(developmentNote);
  const textureCaption = document.createElement('p');
  textureCaption.className = 'map-legend-label';
  mapLegend.prepend(textureCaption);
  const regionTitle = document.createElement('li');
  regionTitle.className = 'map-region-title';
  regionTitle.textContent = 'Boja · Statistička regija';
  regionLegend.append(regionTitle);
  for (const [code, name] of Object.entries(regions)) {
    const item = document.createElement('li');
    item.dataset.region = code;
    item.textContent = name;
    regionLegend.append(item);
  }

  const specialMapButtons = new Map();
  for (const entry of mappedSpecialResults) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-special-button';
    button.setAttribute('aria-label', 'Prikaži ' + entry.name + ' na mapi');
    button.setAttribute('aria-pressed', 'false');
    const circle = document.createElement('span');
    circle.className = 'map-special-circle';
    circle.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = entry.name;
    button.append(circle, label);
    button.addEventListener('click', () => {
      if (syncVisualFilters.checked) clearTableFilters(true);
      chooseSpecial(entry);
    });
    button.addEventListener('pointerenter', () => {
      if (isVisible(entry.id)) showMapValues(entry);
    });
    button.addEventListener('pointerleave', () => showMapValues(selectedSpecial || byId.get(selected?.id)));
    button.addEventListener('focus', () => {
      if (isVisible(entry.id)) showMapValues(entry);
    });
    button.addEventListener('blur', () => showMapValues(selectedSpecial || byId.get(selected?.id)));
    specialMapControls.append(button);
    specialMapButtons.set(entry.id, button);
  }

  function updateMapMetrics() {
    const color = mapColor.value;
    const texture = mapTexture.value;
    for (const entry of data) {
      const unit = get(entry.id);
      unit.classList.remove('v0', 'v1', 'v2', 'v3', 'v4', 'is-diverging', ...Object.keys(developmentLabels).map(code => 'development-' + code));
      unit.dataset.region = entry.region;
      unit.classList.toggle('is-region-color', color === 'region');
      unit.classList.toggle('missing', color !== 'region' && !Number.isFinite(entry[color]));
      if (color === 'developmentGroup2014' && Number.isFinite(entry[color])) {
        unit.classList.add('development-' + mapDevelopmentGroup(entry[color]));
      } else if (color !== 'region' && Number.isFinite(entry[color])) {
        unit.classList.add('v' + mapColorClass(entry[color], color));
      }
      const densityClass = Number.isFinite(entry[texture])
        ? metricClass(entry[texture], metrics[texture].breaks) : null;
      get(entry.id + '-texture').setAttribute('fill', densityClass == null
        ? 'none' : 'url(#rs-municipal-dots-' + densityClass + ')');
    }
    for (const entry of mappedSpecialResults) {
      const circle = specialMapButtons.get(entry.id).querySelector('.map-special-circle');
      const colorClass = color === 'developmentGroup2014' && Number.isFinite(entry[color])
        ? 'development-' + mapDevelopmentGroup(entry[color]) : color !== 'region' && Number.isFinite(entry[color])
        ? 'v' + mapColorClass(entry[color], color) : '';
      const textureClass = Number.isFinite(entry[texture])
        ? metricClass(entry[texture], metrics[texture].breaks) : null;
      circle.className = 'map-special-circle' + (color === 'region' ? ' is-region-color' : '')
        + (colorClass ? ' ' + colorClass : '')
        + (textureClass == null ? ' no-texture' : '');
      if (textureClass != null) circle.style.setProperty('--dot-spacing', [11, 7, 4][textureClass] + 'px');
    }
    colorMatrix.hidden = color === 'region' || color === 'developmentGroup2014';
    regionLegend.hidden = color !== 'region';
    developmentLegend.hidden = color !== 'developmentGroup2014';
    developmentNote.hidden = color !== 'developmentGroup2014';
    mapLegend.classList.toggle('is-matrix', !colorMatrix.hidden);
    mapLegend.classList.toggle('is-development', color === 'developmentGroup2014');
    if (color !== 'region') colorCaption.textContent = 'Boja · ' + metricLabel(color);
    textureCaption.textContent = mapLegendLabel(texture);
    const headings = colorMatrix.querySelectorAll('thead th');
    headings[0].textContent = '';
    const colorRanges = !colorMatrix.hidden ? mapRangeLabels(color) : [];
    colorRanges.forEach((label, index) => {
      const bounds = label.split(' i ');
      if (bounds.length === 2) {
        const first = document.createElement('span');
        first.className = 'range-line';
        first.textContent = bounds[0];
        const second = document.createElement('span');
        second.className = 'range-line';
        second.textContent = 'i ' + bounds[1];
        headings[index + 1].replaceChildren(first, second);
      } else headings[index + 1].textContent = label;
      headings[index + 1].title = metricLabel(color) + ': ' + label;
    });
    const textureRanges = rangeLabels(texture).reverse();
    textureRanges.forEach((label, index) => {
      const bounds = label.split(' i ');
      for (const table of [colorMatrix, developmentLegend]) {
        const row = table.querySelectorAll('tbody th')[index];
        if (bounds.length === 2) {
          const first = document.createElement('span');
          first.className = 'range-line';
          first.textContent = bounds[0];
          const second = document.createElement('span');
          second.className = 'range-line';
          second.textContent = 'i ' + bounds[1];
          row.replaceChildren(first, second);
        } else row.textContent = label;
        row.title = metricLabel(texture) + ': ' + label;
      }
      developmentLegend.querySelectorAll('tbody tr')[index].querySelectorAll('td').forEach((cell, columnIndex) => {
        cell.setAttribute('aria-label', 'Razvijenost ' + developmentHeadRow.children[columnIndex + 1].textContent + '; ' + metricLabel(texture) + ': ' + label);
      });
    });
    if (!colorMatrix.hidden) {
      colorMatrix.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
        row.querySelectorAll('td').forEach((cell, columnIndex) => {
          const description = 'Boja opštine · ' + metricLabel(color) + ': ' + colorRanges[columnIndex]
            + '\nGustina tačaka · ' + metricLabel(texture) + ': ' + textureRanges[rowIndex];
          cell.dataset.tooltip = description;
          cell.setAttribute('aria-label', description.replace('\n', '; '));
          cell.tabIndex = 0;
        });
      });
    }
    hideTooltip();
    updateMapReadout(selectedSpecial || byId.get(selected?.id));
  }

  function updateLegendSelection(entry) {
    for (const item of mapLegend.querySelectorAll('.is-selected')) {
      item.classList.remove('is-selected');
    }
    if (!entry) return;
    const color = mapColor.value;
    if (color === 'region') {
      regionLegend.querySelector('[data-region="' + entry.region + '"]')?.classList.add('is-selected');
      return;
    }
    const colorValue = entry[color];
    const textureValue = entry[mapTexture.value];
    if (!Number.isFinite(colorValue) || !Number.isFinite(textureValue)) return;
    const table = color === 'developmentGroup2014' ? developmentLegend : colorMatrix;
    const column = color === 'developmentGroup2014'
      ? developmentColumns.indexOf(mapDevelopmentGroup(colorValue))
      : mapColorClass(colorValue, color);
    const row = 2 - metricClass(textureValue, metrics[mapTexture.value].breaks);
    table.querySelectorAll('tbody tr')[row]?.querySelectorAll('td')[column]?.classList.add('is-selected');
  }

  function updateMapReadout(entry) {
    showMapValues(entry);
  }

  function showMapValues(entry) {
    const summary = !entry ? summarizeSelectedRegions() : null;
    showPlotValues(mapReadout, entry || summary, ['map-color', 'map-texture'], Boolean(summary));
    updateLegendSelection(entry);
  }
  function summarizeSelectedRegions() {
    const entries = tableData.filter(entry => isVisible(entry.id));
    if (!entries.length) return null;
    const codes = [...selectedRegions];
    const summaryLabel = codes.length === 1 ? regions[codes[0]]
      : codes.length === Object.keys(regions).length ? 'Sve regije' : 'Odabrane regije (' + codes.length + ')';
    const sum = key => entries.reduce((total, entry) => total + (Number.isFinite(entry[key]) ? entry[key] : 0), 0);
    const sumAvailable = key => entries.some(entry => Number.isFinite(entry[key])) ? sum(key) : null;
    const ratio = (numerator, denominator) => denominator ? 100 * numerator / denominator : null;
    const populationEntries = entries.filter(entry => Number.isFinite(entry.population) && Number.isFinite(entry.areaKm2));
    const population = populationEntries.reduce((total, entry) => total + entry.population, 0);
    const area = populationEntries.reduce((total, entry) => total + entry.areaKm2, 0);
    const populationWeighted = key => {
      const available = entries.filter(entry => Number.isFinite(entry.population) && Number.isFinite(entry[key]));
      const weight = available.reduce((total, entry) => total + entry.population, 0);
      return weight ? available.reduce((total, entry) => total + entry.population * entry[key], 0) / weight : null;
    };
    const municipalAverage = key => {
      const values = entries.map(entry => entry[key]).filter(Number.isFinite);
      return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
    };
    return {
      id: 'regions-' + codes.join('-'), summaryLabel,
      votes: ratio(sum('listVotes'), sum('validVotes')),
      snsShare: ratio(sum('snsVotes'), sum('validVotes')),
      listVotes: sum('listVotes'), snsVotes: sum('snsVotes'), validVotes: sum('validVotes'),
      voteDifference: sum('listVotes') - sum('snsVotes'),
      invalidShare: ratio(sum('invalidVotes'), sum('ballotsInBox')),
      turnout: ratio(sum('votersAttended'), sum('registeredVoters')),
      votersAttended: sum('votersAttended'), registeredVoters: sum('registeredVoters'),
      stations: sum('stations'), population: sumAvailable('population'),
      areaKm2: sumAvailable('areaKm2'), density: area ? population / area : null,
      age65PlusShare: populationWeighted('age65PlusShare'),
      youthShare: municipalAverage('youthShare'),
      higherEducationShare: municipalAverage('higherEducationShare'),
      averageNetWage2025: municipalAverage('averageNetWage2025'),
    };
  }
  mapColor.addEventListener('change', updateMapMetrics);
  mapTexture.addEventListener('change', updateMapMetrics);
  updateMapMetrics();

  const metricColumns = Object.entries(metrics).map(([key, metric]) => ({
    key,
    label: metricLabel(key),
    format: key === 'voteDifference' ? signedWholeNumber.format
      : metric.unit === '%' ? percent
      : metric.unit === 'stan./km²' || metric.unit === 'km²' ? number.format : wholeNumber.format,
  })).filter(column => !['developmentGroup2014', 'averageNetWage2025'].includes(column.key));
  const columns = [
    {key: 'name', label: 'Opština ili grad'},
    {key: 'region', label: 'Statistička regija', format: code => shortRegions[code] || tableRegions[code]},
    {key: 'district', label: 'Okrug', format: value => value.replace(/ okrug$/, '')},
    {key: 'developmentGroup2014', label: 'Razvijenost (2014)', format: value => developmentLabels[value]},
    {key: 'averageNetWage2025', label: 'Prosj. neto zarada (2025)', format: wholeNumber.format},
    metricColumns.find(column => column.key === 'voteDifference'),
    ...metricColumns.filter(column => column.key !== 'voteDifference'),
  ];
  const sourceLinks = {
    rik: ['RIK · konačni rezultati', 'https://www.rik.parlament.gov.rs/542645/rezultati/'],
    rikCsv: ['RIK · podaci po biračkim mjestima', 'https://www.rik.parlament.gov.rs/export-results/680072/2'],
    population: ['RZS · procjene stanovništva 2025', 'https://publikacije.stat.gov.rs/G2026/HtmlL/G20261178.html'],
    development: ['Vlada RS · uredba za 2014', 'https://ras.gov.rs/uploads/2020/05/uredba-o-utvrdivanju-jedinstvene-liste-razvijenosti-regiona-i-jedinica.pdf'],
    wages: ['RZS · zarade 2025, tabela 4', 'https://publikacije.stat.gov.rs/G2026/HtmlL/G20261050.html'],
    ages: ['RZS · Popis 2022, starost', 'https://publikacije.stat.gov.rs/G2024/PdfE/G202413051.pdf'],
    education: ['RZS · Popis 2022, obrazovanje', 'https://popis2022.stat.gov.rs/popisni-podaci-eksel-tabele/'],
    educationShare: ['Stanje Srbije · obrazovanje', 'https://stanjesrbije.rs/pokazatelj/degree/'],
    boundaries: ['geoBoundaries · granice opština', 'https://www.geoboundaries.org/api/current/gbOpen/SRB/ADM2/'],
    belgradeArea: ['RZS · površine Beograda, tabela 20.1', 'https://publikacije.stat.gov.rs/G2025/pdf/G20252058.pdf'],
  };
  const columnHelp = {
    name: ['Naziv opštine ili grada za koji su prikazani rezultati. Beograd je razložen na 17 gradskih opština.', ['rik']],
    region: ['Statistička regija kojoj pripada jedinica; „Ostalo” označava glasanje bez opštinske geometrije.', ['rik']],
    district: ['Upravni okrug opštine ili grada. Za Inostranstvo i Kaznene zavode prikazan je naziv posebne kategorije.', ['rik']],
    developmentGroup2014: ['Razvijenost JLS prema uredbi iz 2014.\nNapomena: Ovo je posljednja dostupna zvanična klasifikacija.\n\nI — iznad prosjeka\nII — 80–100% prosjeka\nIII — 60–80% prosjeka\nIV — ispod 60% prosjeka\nV — devastirano, ispod 50% prosjeka; prikazano kao peta kategorija, a po uredbi je podgrupa IV.\n\nSvih 17 beogradskih opština ima grupu Grada Beograda.', ['development']],
    voteDifference: ['Glasovi studentske liste minus glasovi SNS liste. Pozitivna traka ide udesno, negativna ulijevo.', ['rik']],
    votes: ['Udio glasova studentske liste Lista3 među važećim glasovima. Traka prikazuje udio na skali od 0 do 100%.', ['rik']],
    listVotes: ['Broj glasova studentske liste Lista3.', ['rik']],
    snsShare: ['Udio glasova liste koalicije SNS (lista 1) među važećim glasovima.', ['rik']],
    snsVotes: ['Broj glasova liste koalicije SNS (lista 1).', ['rik']],
    validVotes: ['Broj važećih glasova.', ['rik']],
    invalidShare: ['Broj nevažećih listića podijeljen brojem listića pronađenih u kutijama.', ['rik']],
    turnout: ['Broj birača koji su izašli podijeljen brojem upisanih birača.', ['rik']],
    votersAttended: ['Broj birača koji su izašli na glasanje.', ['rik']],
    registeredVoters: ['Broj upisanih birača.', ['rik']],
    stations: ['Broj jedinstvenih biračkih mjesta u konačnim podacima RIK-a.', ['rikCsv']],
    population: ['Godišnji prosjek procijenjenog broja stanovnika u 2025.', ['population']],
    density: ['Procijenjeni broj stanovnika 2025. podijeljen površinom opštine u km².', ['population', 'boundaries', 'belgradeArea']],
    areaKm2: ['Površina u km²: za beogradske opštine prema RZS-u, za ostale iz pojednostavljenih granica.', ['belgradeArea', 'boundaries']],
    youthShare: ['Udio stanovnika od 15 do 29 godina prema Popisu 2022; zbir grupa 15–19, 20–24 i 25–29.', ['ages']],
    age65PlusShare: ['Udio stanovnika od 65 godina naviše u procjeni stanovništva za 2025.', ['population']],
    higherEducationShare: ['Udio stanovnika od 15 godina naviše s višim ili visokim obrazovanjem prema Popisu 2022.', ['education', 'educationShare']],
    averageNetWage2025: ['Prosječna mjesečna neto zarada za januar–decembar 2025. prema opštini prebivališta zaposlenih, u dinarima. Traka je srazmjerna najvećoj vrijednosti u tabeli.', ['wages']],
  };
  const table = get('municipality-table');
  const tableBody = table.tBodies[0];
  const tableFoot = table.tFoot;
  const syncFilters = get('sync-table-filters');
  const syncVisualFilters = get('sync-visual-filters');
  let sortKey = 'name';
  let ascending = true;
  const searchKey = text => text.toLocaleLowerCase('sr-Latn-RS').normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'dj');
  const nameKeys = new Map(tableData.map(entry => [entry.id, searchKey(entry.name)]));
  const headingRow = table.tHead.insertRow();
  const selectionHeading = document.createElement('th');
  selectionHeading.scope = 'col';
  selectionHeading.className = 'row-select';
  const selectAll = document.createElement('input');
  selectAll.type = 'checkbox';
  selectAll.setAttribute('aria-label', 'Označi sve trenutno prikazane redove');
  selectAll.title = 'Označi sve trenutno prikazane redove';
  selectionHeading.append(selectAll);
  headingRow.append(selectionHeading);
  const numberHeading = document.createElement('th');
  numberHeading.scope = 'col';
  numberHeading.className = 'row-number';
  numberHeading.textContent = 'Br.';
  numberHeading.tabIndex = 0;
  headingRow.append(numberHeading);
  let activeColumnHelp = null;
  let helpHideTimer = null;
  const addColumnHelp = (trigger, key) => {
    const hoverTarget = trigger.querySelector('.column-title-text') || trigger;
    const [description, sources] = columnHelp[key];
    const popup = document.createElement('div');
    popup.id = 'column-help-' + key;
    popup.className = 'column-help-popover';
    popup.setAttribute('popover', 'manual');
    popup.setAttribute('role', 'tooltip');
    const paragraph = document.createElement('p');
    paragraph.textContent = description;
    popup.append(paragraph);
    const sourceLine = document.createElement('div');
    sourceLine.className = 'column-help-sources';
    sourceLine.append('Izvor: ');
    if (sources.length) for (const [index, source] of sources.entries()) {
      if (index) sourceLine.append(' · ');
      const [label, href] = sourceLinks[source];
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = label;
      sourceLine.append(link);
    }
    else sourceLine.append('redni broj je generisan u tabeli');
    popup.append(sourceLine);
    trigger.setAttribute('aria-describedby', popup.id);
    const show = () => {
      if (columnDrag) return;
      clearTimeout(helpHideTimer);
      if (activeColumnHelp && activeColumnHelp !== popup) activeColumnHelp.hidePopover();
      const rect = hoverTarget.getBoundingClientRect();
      popup.style.left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - 328)) + 'px';
      popup.style.top = Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - 180)) + 'px';
      if (!popup.matches(':popover-open')) popup.showPopover();
      activeColumnHelp = popup;
    };
    const scheduleHide = () => {
      clearTimeout(helpHideTimer);
      helpHideTimer = setTimeout(() => {
        if (activeColumnHelp === popup && popup.matches(':popover-open')) {
          popup.hidePopover();
          activeColumnHelp = null;
        }
      }, 160);
    };
    hoverTarget.addEventListener('mouseenter', show);
    hoverTarget.addEventListener('mouseleave', scheduleHide);
    trigger.addEventListener('focus', show);
    trigger.addEventListener('blur', scheduleHide);
    popup.addEventListener('mouseenter', () => clearTimeout(helpHideTimer));
    popup.addEventListener('mouseleave', scheduleHide);
    popup.addEventListener('focusin', () => clearTimeout(helpHideTimer));
    popup.addEventListener('focusout', scheduleHide);
    table.closest('.table-panel').append(popup);
  };
  columnHelp.number = ['Redni broj reda u početnom abecednom poretku.', []];
  addColumnHelp(numberHeading, 'number');
  const headers = new Map();
  const rangeFilters = new Map();
  const search = document.createElement('input');
  search.id = 'table-search';
  search.type = 'search';
  search.placeholder = 'Pretraži po nazivu';
  search.setAttribute('aria-label', 'Naziv opštine ili grada');
  const createChoiceFilter = (id, label, options) => {
    const selected = new Set();
    const element = document.createElement('div');
    element.id = id;
    element.className = 'choice-filter';
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', label);
    const status = document.createElement('div');
    status.className = 'choice-filter-status';
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.textContent = 'Prikaži sve';
    const count = document.createElement('span');
    status.append(count, clearButton);
    const list = document.createElement('div');
    list.className = 'choice-filter-list';
    const inputs = new Map();
    for (const [value, text] of options) {
      const option = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      option.append(input, document.createTextNode(text));
      list.append(option);
      inputs.set(String(value), input);
      input.addEventListener('input', () => {
        if (input.checked) selected.add(input.value);
        else selected.delete(input.value);
        update();
      });
    }
    const update = () => {
      for (const [value, input] of inputs) input.checked = selected.has(value);
      count.textContent = selected.size ? 'Izabrano: ' + selected.size : 'Sve vrijednosti';
      clearButton.disabled = selected.size === 0;
    };
    const clear = () => { selected.clear(); update(); };
    const toggle = value => {
      value = String(value);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      update();
    };
    clearButton.addEventListener('click', () => { clear(); renderTable(); });
    element.append(status, list);
    update();
    return {element, selected, clear, toggle};
  };
  const filterButtons = new Map();
  const selectedRows = new Set();
  let visibleRows = [];
  let tableFilteredRows = [];
  selectAll.addEventListener('change', () => {
    for (const entry of visibleRows.filter(entry => !entry.special)) {
      if (selectAll.checked) selectedRows.add(entry.id);
      else selectedRows.delete(entry.id);
    }
    renderTable();
  });
  const districtRegions = new Map();
  for (const entry of tableData) {
    if (entry.district) districtRegions.set(entry.district, entry.region);
  }
  const regionFilter = createChoiceFilter('table-region', 'Regija', Object.entries(regions));
  const districtOptions = [...districtRegions].sort((a, b) =>
    byName.compare(regions[a[1]], regions[b[1]]) || byName.compare(a[0], b[0]))
    .map(([district, region]) => [district, district + ' · ' + regions[region]]);
  const districtFilter = createChoiceFilter('table-district', 'Okrug', districtOptions);
  const developmentFilter = createChoiceFilter('table-development', 'Stepen razvijenosti (2014)',
    Object.entries(developmentLabels));

  let columnDrag = null;
  const tableScroll = table.closest('.table-scroll');
  const clearColumnDrop = () => {
    for (const heading of headingRow.cells) heading.removeAttribute('data-drop-side');
  };
  const moveColumn = (sourceKey, targetKey, side) => {
    if (sourceKey === targetKey) return;
    const sourceIndex = columns.findIndex(column => column.key === sourceKey);
    const targetIndex = columns.findIndex(column => column.key === targetKey);
    if (sourceIndex < 1 || targetIndex < 1) return;
    const [column] = columns.splice(sourceIndex, 1);
    const index = columns.findIndex(item => item.key === targetKey) + (side === 'after' ? 1 : 0);
    columns.splice(index, 0, column);
    headingRow.replaceChildren(selectionHeading, numberHeading, ...columns.map(item => headers.get(item.key)));
    renderTable();
  };
  const finishColumnDrag = event => {
    if (!columnDrag || event.pointerId !== columnDrag.pointerId) return;
    const {sourceKey, targetKey, side} = columnDrag;
    columnDrag = null;
    document.body.style.userSelect = '';
    clearColumnDrop();
    if (event.type === 'pointerup' && targetKey) moveColumn(sourceKey, targetKey, side);
  };
  for (const column of columns) {
    const heading = document.createElement('th');
    heading.scope = 'col';
    heading.className = 'col-' + column.key;
    heading.dataset.columnKey = column.key;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'column-sort';
    const label = document.createElement('span');
    label.className = 'column-title-text';
    label.textContent = column.label;
    button.append(label);
    const headingLines = column.key === 'averageNetWage2025'
      ? ['Prosječna', 'neto zarada', '2025']
      : column.key === 'voteDifference' ? ['Razlika', 'glasova', '(Lista3 − SNS)'] : null;
    if (headingLines) {
      button.classList.add('is-three-line');
      button.setAttribute('aria-label', column.label);
      label.replaceChildren(...headingLines.flatMap((line, index) =>
        index ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)]));
    }
    button.addEventListener('click', () => {
      ascending = sortKey === column.key ? !ascending : ['name', 'region', 'district'].includes(column.key);
      sortKey = column.key;
      renderTable();
    });
    const group = document.createElement('div');
    group.className = 'column-heading';
    group.append(button);
    addColumnHelp(button, column.key);
    if (column.key !== 'name') {
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'column-drag-handle';
      grip.textContent = '⋮⋮';
      grip.title = 'Prevuci za promjenu redoslijeda kolone';
      grip.setAttribute('aria-label', 'Pomjeri kolonu ' + column.label);
      grip.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        if (activeColumnHelp) {
          activeColumnHelp.hidePopover();
          activeColumnHelp = null;
        }
        columnDrag = {pointerId: event.pointerId, sourceKey: column.key, startX: event.clientX,
          startY: event.clientY, targetKey: null, side: null};
        grip.setPointerCapture(event.pointerId);
        document.body.style.userSelect = 'none';
        event.preventDefault();
      });
      grip.addEventListener('pointermove', event => {
        if (!columnDrag || event.pointerId !== columnDrag.pointerId) return;
        if (Math.hypot(event.clientX - columnDrag.startX, event.clientY - columnDrag.startY) < 5) return;
        const scrollRect = tableScroll.getBoundingClientRect();
        if (event.clientX > scrollRect.right - 28) tableScroll.scrollLeft += 18;
        else if (event.clientX < scrollRect.left + 28) tableScroll.scrollLeft -= 18;
        clearColumnDrop();
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('th[data-column-key]');
        const targetKey = target?.dataset.columnKey;
        if (!targetKey || targetKey === 'name' || targetKey === columnDrag.sourceKey) {
          columnDrag.targetKey = null;
          return;
        }
        const side = event.clientX < target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2
          ? 'before' : 'after';
        target.dataset.dropSide = side;
        columnDrag.targetKey = targetKey;
        columnDrag.side = side;
      });
      grip.addEventListener('pointerup', finishColumnDrag);
      grip.addEventListener('pointercancel', finishColumnDrag);
      grip.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const index = columns.findIndex(item => item.key === column.key);
        const adjacent = columns[index + (event.key === 'ArrowLeft' ? -1 : 1)];
        if (!adjacent || adjacent.key === 'name') return;
        event.preventDefault();
        moveColumn(column.key, adjacent.key, event.key === 'ArrowLeft' ? 'before' : 'after');
        grip.focus();
      });
      group.append(grip);
    }
    heading.append(group);
    headingRow.append(heading);
    headers.set(column.key, heading);
    const popup = document.createElement('div');
    popup.id = 'range-' + column.key;
    popup.className = 'range-popover';
    popup.setAttribute('popover', 'auto');
    const title = document.createElement('p');
    title.textContent = column.label;
    popup.append(title);
    if (column.key === 'name') popup.append(search);
    else if (column.key === 'region') popup.append(regionFilter.element);
    else if (column.key === 'district') popup.append(districtFilter.element);
    else if (column.key === 'developmentGroup2014') popup.append(developmentFilter.element);
    else {
      const range = document.createElement('div');
      range.className = 'filter-range';
      const inputs = ['Min', 'Maks'].map(bound => {
        const label = document.createElement('label');
        label.textContent = bound;
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.setAttribute('aria-label', column.label + ' — ' + bound);
        input.dataset.bound = bound === 'Min' ? 'min' : 'max';
        input.dataset.column = column.key;
        label.append(input);
        range.append(label);
        return input;
      });
      popup.append(range);
      rangeFilters.set(column.key, inputs);
    }
    const filter = document.createElement('button');
    filter.type = 'button';
    filter.className = 'column-filter-button';
    filter.setAttribute('popovertarget', popup.id);
    filter.setAttribute('aria-label', 'Filter za ' + column.label);
    filter.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v5l-4 2v-7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    group.append(filter);
    filterButtons.set(column.key, filter);
    table.closest('.table-panel').append(popup);
    popup.addEventListener('beforetoggle', event => {
      if (event.newState !== 'open') return;
      const rect = filter.getBoundingClientRect();
      popup.style.left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - 243)) + 'px';
      popup.style.top = rect.bottom + 5 + 'px';
    });
    popup.addEventListener('toggle', event => {
      if (event.newState === 'open') popup.style.top = Math.max(8,
        Math.min(filter.getBoundingClientRect().bottom + 5, window.innerHeight - popup.offsetHeight - 8)) + 'px';
    });
    popup.addEventListener('input', renderTable);
  }

  const updateFrozenColumns = () => {
    table.style.setProperty('--selection-column-width', selectionHeading.getBoundingClientRect().width + 'px');
    table.style.setProperty('--number-column-width', numberHeading.getBoundingClientRect().width + 'px');
  };
  const frozenColumnObserver = new ResizeObserver(updateFrozenColumns);
  frozenColumnObserver.observe(selectionHeading);
  frozenColumnObserver.observe(numberHeading);

  function renderTable() {
    for (const [key, header] of headers) {
      if (key === sortKey) header.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
      else header.removeAttribute('aria-sort');
    }
    const query = searchKey(search.value.trim());
    const region = regionFilter.selected;
    const district = districtFilter.selected;
    filterButtons.get('name').classList.toggle('has-filter', Boolean(query));
    filterButtons.get('region').classList.toggle('has-filter', region.size > 0);
    filterButtons.get('district').classList.toggle('has-filter', district.size > 0);
    filterButtons.get('developmentGroup2014').classList.toggle('has-filter', developmentFilter.selected.size > 0);
    const ranges = [...rangeFilters].map(([key, [min, max]]) => {
      filterButtons.get(key).classList.toggle('has-filter', Boolean(min.value || max.value));
      return [key, Number.isNaN(min.valueAsNumber) ? -Infinity : min.valueAsNumber,
        Number.isNaN(max.valueAsNumber) ? Infinity : max.valueAsNumber];
    });
    const filtered = tableData.filter(entry => nameKeys.get(entry.id).includes(query) &&
      (!region.size || region.has(entry.region)) &&
      (!district.size || district.has(entry.district)) &&
      (!developmentFilter.selected.size || developmentFilter.selected.has(String(entry.developmentGroup2014))) &&
      ranges.every(([key, min, max]) => (min === -Infinity && max === Infinity) ||
        (entry[key] != null && entry[key] >= min && entry[key] <= max)));
    const activeSelection = selectedSpecial?.id || selected?.id;
    const visible = syncVisualFilters.checked
      ? filtered.filter(entry => selectedRegions.has(entry.region) &&
        (!activeSelection || entry.id === activeSelection))
      : filtered;
    visible.sort((a, b) => {
      const nameOrder = byName.compare(a.name, b.name);
      if (!['name', 'region', 'district'].includes(sortKey)) {
        if (a[sortKey] == null) return b[sortKey] == null ? nameOrder : 1;
        if (b[sortKey] == null) return -1;
      }
      const primary = sortKey === 'name' ? nameOrder
        : sortKey === 'region' ? byName.compare(tableRegions[a.region], tableRegions[b.region])
        : sortKey === 'district' ? byName.compare(a.district || '', b.district || '')
        : a[sortKey] - b[sortKey];
      return (ascending ? primary : -primary) || nameOrder;
    });
    const rows = document.createDocumentFragment();
    for (const [index, entry] of visible.entries()) {
      const row = document.createElement('tr');
      row.dataset.unitId = entry.id;
      row.classList.toggle('is-special', Boolean(entry.special));
      row.classList.toggle('is-mapped-special', entry.region === 'OTHER');
      row.classList.toggle('is-current', selected?.id === entry.id || selectedSpecial?.id === entry.id);
      if (!entry.special) row.addEventListener('click', event => {
        if (event.target.closest('input')) return;
        if (syncFilters.checked && selectedRows.size && !selectedRows.has(entry.id)) {
          selectedRows.add(entry.id);
          checkbox.checked = true;
          updateTableStatus();
        }
        choose(get(entry.id));
      });
      else if (entry.region === 'OTHER') row.addEventListener('click', () => chooseSpecial(entry));
      const selectCell = row.insertCell();
      selectCell.className = 'row-select';
      const numberCell = row.insertCell();
      numberCell.className = 'row-number';
      numberCell.textContent = String(index + 1);
      const checkbox = document.createElement('input');
      if (!entry.special) {
        checkbox.type = 'checkbox';
        checkbox.value = entry.id;
        checkbox.checked = selectedRows.has(entry.id);
        checkbox.setAttribute('aria-label', 'Označi ' + entry.name);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedRows.add(entry.id);
          else selectedRows.delete(entry.id);
          updateTableStatus();
        });
        selectCell.append(checkbox);
      }
      const name = document.createElement('th');
      name.scope = 'row';
      name.className = 'row-name';
      if (entry.special && entry.region !== 'OTHER') {
        name.textContent = entry.name;
      } else {
        const nameButton = document.createElement('button');
        nameButton.type = 'button';
        nameButton.className = 'table-name-button';
        nameButton.textContent = entry.name;
        nameButton.setAttribute('aria-label', 'Prikaži ' + entry.name + ' na mapi');
        name.append(nameButton);
      }
      row.append(name);
      for (const {key, format = wholeNumber.format} of columns.slice(1)) {
        const cell = row.insertCell();
        if (key === 'region' || key === 'district') {
          cell.className = key === 'region' ? 'region-cell' : 'district-cell';
          cell.title = key === 'region' ? tableRegions[entry.region] : entry.district || '';
          if (entry[key]) {
            const filterValue = document.createElement('button');
            const filterControl = key === 'region' ? regionFilter : districtFilter;
            const value = entry[key];
            filterValue.type = 'button';
            filterValue.className = 'table-filter-value';
            filterValue.textContent = format(value);
            filterValue.setAttribute('aria-label', 'Filtriraj po ' + (key === 'region' ? 'regiji' : 'okrugu') + ': ' + cell.title);
            filterValue.setAttribute('aria-pressed', String(filterControl.selected.has(value)));
            filterValue.addEventListener('click', event => {
              event.stopPropagation();
              filterControl.toggle(value);
              renderTable();
            });
            cell.append(filterValue);
            continue;
          }
        }
        if (key === 'developmentGroup2014') {
          cell.className = 'development-cell';
          if (entry[key] === 5) {
            const label = document.createElement('span');
            label.textContent = developmentLabels[entry[key]];
            label.title = 'Devastirano; po uredbi podgrupa IV';
            cell.append(label);
            continue;
          }
        }
        if (key === 'voteDifference' && Number.isFinite(entry[key])) {
          cell.className = 'difference-cell';
          const bar = document.createElement('span');
          bar.className = 'difference-bar' + (entry[key] < 0 ? ' is-negative' : entry[key] === 0 ? ' is-zero' : '');
          bar.style.setProperty('--bar-width', 50 * Math.abs(entry[key]) / maxVoteDifference + '%');
          const fill = document.createElement('span');
          fill.className = 'difference-fill';
          fill.setAttribute('aria-hidden', 'true');
          const value = document.createElement('span');
          value.className = 'difference-number';
          value.textContent = format(entry[key]);
          bar.append(fill, value);
          cell.append(bar);
        } else if (key === 'votes' && Number.isFinite(entry[key])) {
          cell.className = 'share-cell';
          const bar = document.createElement('span');
          bar.className = 'share-bar';
          bar.style.setProperty('--bar-width', Math.max(0, Math.min(100, entry[key])) + '%');
          const fill = document.createElement('span');
          fill.className = 'share-fill';
          fill.setAttribute('aria-hidden', 'true');
          const value = document.createElement('span');
          value.className = 'share-number';
          value.textContent = format(entry[key]);
          bar.append(fill, value);
          cell.append(bar);
        } else if (key === 'averageNetWage2025' && Number.isFinite(entry[key])) {
          cell.className = 'wage-cell';
          const bar = document.createElement('span');
          bar.className = 'wage-bar';
          bar.style.setProperty('--bar-width', 100 * entry[key] / maxWage + '%');
          const fill = document.createElement('span');
          fill.className = 'wage-fill';
          fill.setAttribute('aria-hidden', 'true');
          const value = document.createElement('span');
          value.className = 'wage-number';
          value.textContent = format(entry[key]);
          bar.append(fill, value);
          cell.append(bar);
        } else cell.textContent = entry[key] == null ? '—' : format(entry[key]);
      }
      rows.append(row);
    }
    if (!visible.length) {
      const row = document.createElement('tr');
      const cell = row.insertCell();
      cell.colSpan = columns.length + 2;
      cell.className = 'empty-row';
      cell.textContent = 'Nema opština ili gradova koji odgovaraju filterima.';
      rows.append(row);
    }
    tableBody.replaceChildren(rows);
    renderTotal(visible);
    visibleRows = visible;
    tableFilteredRows = filtered;
    updateTableStatus();
  }

  function renderTotal(visible) {
    const sum = key => visible.reduce((total, entry) => total + (entry[key] || 0), 0);
    const registered = sum('registeredVoters');
    const attended = sum('votersAttended');
    const valid = sum('validVotes');
    const invalid = sum('invalidVotes');
    const ballots = sum('ballotsInBox');
    const list = sum('listVotes');
    const sns = sum('snsVotes');
    const area = sum('areaKm2');
    const population = sum('population');
    const hasPopulation = visible.some(entry => Number.isFinite(entry.population));
    const totals = {
      stations: wholeNumber.format(sum('stations')),
      population: hasPopulation ? wholeNumber.format(population) : '—',
      density: hasPopulation && area ? number.format(population / area) : '—',
      registeredVoters: wholeNumber.format(registered),
      votersAttended: wholeNumber.format(attended),
      turnout: registered ? percent(100 * attended / registered) : '—',
      validVotes: wholeNumber.format(valid),
      invalidShare: ballots ? percent(100 * invalid / ballots) : '—',
      listVotes: wholeNumber.format(list),
      snsVotes: wholeNumber.format(sns),
      voteDifference: signedWholeNumber.format(list - sns),
      areaKm2: area ? number.format(area) : '—',
      votes: valid ? percent(100 * list / valid) : '—',
      snsShare: valid ? percent(100 * sns / valid) : '—',
    };
    tableFoot.replaceChildren();
    const row = tableFoot.insertRow();
    row.insertCell().textContent = '';
    const numberCell = row.insertCell();
    numberCell.className = 'row-number';
    numberCell.textContent = 'Σ';
    const title = document.createElement('th');
    title.scope = 'row';
    title.className = 'row-name';
    title.textContent = 'Ukupno (' + visible.length + ')';
    row.append(title);
    for (const {key} of columns.slice(1)) {
      const cell = row.insertCell();
      if (key === 'region' || key === 'district') cell.className = key === 'region' ? 'region-cell' : 'district-cell';
      cell.textContent = totals[key] ?? '—';
    }
  }

  function updateTableStatus() {
    const selectable = visibleRows.filter(entry => !entry.special);
    const filterSelectable = tableFilteredRows.filter(entry => !entry.special);
    const visibleSpecial = tableFilteredRows.filter(entry => entry.region === 'OTHER');
    const visibleSelected = selectable.filter(entry => selectedRows.has(entry.id)).length;
    selectAll.checked = selectable.length > 0 && visibleSelected === selectable.length;
    selectAll.indeterminate = visibleSelected > 0 && visibleSelected < selectable.length;
    selectAll.disabled = selectable.length === 0;
    applyVisualFilter([...visibleSpecial,
      ...(selectedRows.size ? filterSelectable.filter(entry => selectedRows.has(entry.id)) : filterSelectable)]);
  }

  syncFilters.addEventListener('change', () => {
    if (syncFilters.checked) syncVisualFilters.checked = false;
    renderTable();
  });
  syncVisualFilters.addEventListener('change', () => {
    if (syncVisualFilters.checked) syncFilters.checked = false;
    renderTable();
  });
  function clearTableFilters(clearSelection = false, rerender = true) {
    search.value = '';
    regionFilter.clear();
    districtFilter.clear();
    developmentFilter.clear();
    for (const inputs of rangeFilters.values()) for (const input of inputs) input.value = '';
    if (clearSelection) selectedRows.clear();
    if (rerender) renderTable();
  }
  get('clear-table-filters').addEventListener('click', () => clearTableFilters());
  function applyVisualFilter(visible) {
    visualFilter = syncFilters.checked ? new Set(visible.map(entry => entry.id)) : null;
    refreshMetricAverages();
    if (selected && !isVisible(selected.id)) choose(null);
    if (selectedSpecial && !isVisible(selectedSpecial.id)) choose(null);
    for (const entry of data) {
      const filtered = !isVisible(entry.id);
      get(entry.id).classList.toggle('is-filtered', filtered);
      get(entry.id + '-texture').classList.toggle('is-filtered', filtered);
    }
    for (const entry of mappedSpecialResults) specialMapButtons.get(entry.id).disabled =
      !isVisible(entry.id);
    scatter.applyFilter();
    hideTooltip();
    scatter.refreshAverages();
    get('jump-to-visuals').hidden = !visualFilter;
  }

  function hideTooltip() {
    tooltip.hidden = true;
    setHover(null);
  }

  function setHover(entry) {
    const hovered = entry && isVisible(entry.id) ? entry : null;
    showMapValues(hovered || selectedSpecial || byId.get(selected?.id));
    scatter?.hover(hovered);
    const unit = hovered && get(hovered.id);
    hoverOutline.setAttribute('visibility', unit ? 'visible' : 'hidden');
    if (unit) hoverOutline.setAttribute('d', unit.getAttribute('d'));
  }

  function updateView(nextScale, x, y) {
    scale = Math.max(1, Math.min(maxMapZoom, nextScale));
    left = Math.max(0, Math.min(width - width / scale, x - width / (2 * scale)));
    top = Math.max(0, Math.min(height - height / scale, y - height / (2 * scale)));
    map.setAttribute('viewBox', [left, top, width / scale, height / scale].join(' '));
    map.classList.toggle('is-zoomed', scale > 1);
    get('map-zoom-in').disabled = scale >= maxMapZoom;
    get('map-zoom-out').disabled = scale <= 1;
    for (const pattern of patterns) pattern.setAttribute('patternTransform', 'scale(' + 1 / scale + ')');
    hideTooltip();
  }

  function choose(unit, updateSyncedTable = true) {
    selectedSpecial = null;
    for (const button of specialMapButtons.values()) button.setAttribute('aria-pressed', 'false');
    selected = unit && isVisible(unit.id) ? unit : null;
    const entry = byId.get(selected?.id);
    for (const row of tableBody.rows) row.classList.toggle('is-current', row.dataset.unitId === entry?.id);
    selection.setAttribute('visibility', entry ? 'visible' : 'hidden');
    scatter.select(entry);
    updateMapReadout(entry);
    if (updateSyncedTable && syncVisualFilters.checked) renderTable();
    if (!entry) return;
    selection.setAttribute('d', selected.getAttribute('d'));
  }

  function chooseSpecial(entry) {
    if (!isVisible(entry.id)) return;
    choose(null, false);
    selectedSpecial = entry;
    specialMapButtons.get(entry.id).setAttribute('aria-pressed', 'true');
    for (const row of tableBody.rows) row.classList.toggle('is-current', row.dataset.unitId === entry.id);
    scatter.select(entry);
    showMapValues(entry);
    if (syncVisualFilters.checked) renderTable();
  }

  function zoom(factor) {
    const x = selected ? Number(selected.dataset.x) : left + width / (2 * scale);
    const y = selected ? Number(selected.dataset.y) : top + height / (2 * scale);
    updateView(scale * factor, x, y);
  }

  function wheelScale(event, current, maximum) {
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
    return Math.max(1, Math.min(maximum, current * Math.exp(-delta * .002)));
  }

  function touchPair(touches) {
    const a = touches[0], b = touches[1];
    return {x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2,
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)};
  }

  for (const [id, factor] of [['map-zoom-in', 1.6], ['map-zoom-out', 1 / 1.6]])
    get(id).addEventListener('click', () => zoom(factor));

  map.addEventListener('touchstart', event => {
    if (event.touches.length !== 2) return;
    const pair = touchPair(event.touches);
    const transform = map.getScreenCTM();
    if (!transform || !pair.distance) return;
    mapPinch = {...pair, scale, anchor: new DOMPoint(pair.x, pair.y).matrixTransform(transform.inverse())};
    drag = null;
    ignoreMapClickUntil = Date.now() + 500;
  }, {passive: true});
  map.addEventListener('touchmove', event => {
    if (!mapPinch || event.touches.length !== 2) return;
    event.preventDefault();
    const pair = touchPair(event.touches);
    const next = Math.max(1, Math.min(maxMapZoom, mapPinch.scale * pair.distance / mapPinch.distance));
    const bounds = map.getBoundingClientRect();
    const pixelsPerUnit = map.getScreenCTM().a * next / scale;
    updateView(next, mapPinch.anchor.x + (bounds.left + bounds.width / 2 - pair.x) / pixelsPerUnit,
      mapPinch.anchor.y + (bounds.top + bounds.height / 2 - pair.y) / pixelsPerUnit);
    ignoreMapClickUntil = Date.now() + 500;
  }, {passive: false});
  for (const type of ['touchend', 'touchcancel'])
    map.addEventListener(type, event => { if (event.touches.length < 2) mapPinch = null; });

  map.addEventListener('wheel', event => {
    if (event.ctrlKey) return;
    const next = wheelScale(event, scale, maxMapZoom);
    if (next === scale) return;
    const transform = map.getScreenCTM();
    if (!transform) return;
    event.preventDefault();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    updateView(next, point.x + (width / 2 - (point.x - left) * scale) / next,
      point.y + (height / 2 - (point.y - top) * scale) / next);
  }, {passive: false});


  map.addEventListener('click', event => {
    if (drag?.moved || Date.now() < ignoreMapClickUntil) return;
    const unit = event.target.closest('[data-unit]');
    if (syncVisualFilters.checked) clearTableFilters(true);
    choose(unit);
    if (!unit) hideTooltip();
  });

  function showTooltip(event) {
    const unit = event.target.closest('[data-unit]');
    const entry = byId.get(unit?.id);
    if (!entry || !isVisible(entry.id) || event.pointerType === 'touch' || drag?.moved) {
      hideTooltip();
      return;
    }
    tooltip.textContent = entry.name;
    setHover(entry);
    tooltip.hidden = false;
    const bounds = stage.getBoundingClientRect();
    const x = Math.max(6, Math.min(event.clientX - bounds.left + 12, bounds.width - tooltip.offsetWidth - 6));
    const above = event.clientY - bounds.top - tooltip.offsetHeight - 10;
    const y = above > 6 ? above : event.clientY - bounds.top + 16;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  map.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left, top, moved: false};
  });
  map.addEventListener('pointermove', event => {
    if (mapPinch) return;
    if (!drag || event.pointerId !== drag.id || !event.buttons || scale === 1) {
      if (!event.buttons) drag = null;
      showTooltip(event);
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      map.setPointerCapture(event.pointerId);
      map.classList.add('is-dragging');
    }
    const unitsPerPixel = 1 / map.getScreenCTM().a;
    updateView(scale, drag.left + width / (2 * scale) - dx * unitsPerPixel,
      drag.top + height / (2 * scale) - dy * unitsPerPixel);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    map.addEventListener(type, () => map.classList.remove('is-dragging'));
  }
  map.addEventListener('pointerleave', hideTooltip);

  function createScatter() {
    const stage = document.querySelector('.scatter-stage');
    const svg = stage.querySelector('svg');
    const tip = stage.querySelector('.map-tooltip');
    const readout = document.querySelector('.scatter-panel .metric-controls');
    const legend = document.querySelector('.scatter-regions');
    const xControl = metricSelect('scatter-x', 'voteDifference');
    const yControl = metricSelect('scatter-y', 'validVotes');
    const sizeControl = metricSelect('scatter-size', 'registeredVoters');
    const colorControl = metricSelect('scatter-color', 'region', true);
    const zoom = {
      x: {min: get('scatter-x-min'), max: get('scatter-x-max')},
      y: {min: get('scatter-y-min'), max: get('scatter-y-max')},
    };
    const svgNode = (tag, attributes, parent, label) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      if (label) element.textContent = label;
      parent.append(element);
      return element;
    };
    const defs = svgNode('defs', {}, svg);
    const clip = svgNode('clipPath', {id: 'scatter-plot-clip'}, defs);
    const clipRect = svgNode('rect', {}, clip);
    const axes = svgNode('g', {'aria-hidden': 'true'}, svg);
    const marks = svgNode('g', {'aria-hidden': 'true', 'clip-path': 'url(#scatter-plot-clip)'}, svg);
    const points = new Map();
    const plotData = [...data, ...mappedSpecialResults];
    const sizeLegend = document.querySelector('.scatter-legend');
    const sizeLabel = get('scatter-size-label');
    let highlighted = null;
    let hoveredPoint = null;
    let currentEntry;
    let chartScaleX = 1;
    let chartScaleY = 1;
    let chartLeft = 0;
    let chartTop = 0;
    let plot;
    let chartDrag = null;
    let chartPinch = null;
    let ignoreChartClickUntil = 0;

    for (const entry of plotData) {
      const dot = svgNode('circle', {class: 'scatter-mark' + (entry.special ? ' is-special' : ''),
        'data-unit-id': entry.id, 'data-region': entry.region}, marks);
      points.set(entry.id, dot);
    }

    function niceStep(roughStep) {
      const base = 10 ** Math.floor(Math.log10(roughStep));
      return [1, 2, 5, 10].find(n => n * base >= roughStep) * base;
    }

    function axis(key, tickCount, start, scale) {
      if (metrics[key].categorical) {
        const span = 5;
        const min = .5 + start * span;
        return {min, max: min + span / scale, step: 1,
          format: value => Math.round(value) === 5 ? 'V' : developmentLabels[Math.round(value)] || '—'};
      }
      const values = plotData.filter(entry => isVisible(entry.id) && hasPlotValue(entry))
        .map(entry => entry[key]).sort((a, b) => a - b);
      const isPercent = metrics[key].unit === '%';
      let lower = values.length ? values[0] : 0;
      let upper = values.length ? values.at(-1) : 1;
      const roughStep = (upper - lower) / tickCount || 1;
      const step = key === 'votes' || key === 'snsShare' || key === 'turnout'
        ? (tickCount < 5 ? 20 : 10)
        : niceStep(roughStep);
      const padding = (upper - lower || step) * .04;
      const min = key === 'voteDifference'
        ? Math.floor((lower - padding) / step) * step
        : Math.max(0, Math.floor((lower - padding) / step) * step);
      const max = Math.max(min + step, Math.ceil((upper + padding) / step) * step);
      const span = max - min;
      const visibleMin = min + start * span;
      const visibleSpan = span / scale;
      const tickStep = scale === 1 ? step : niceStep(visibleSpan / tickCount);
      return {min: visibleMin, max: visibleMin + visibleSpan, step: tickStep,
        format: isPercent ? percent : compact.format};
    }

    function draw() {
      const w = svg.clientWidth;
      const h = svg.clientHeight;
      if (!w || !h) return;
      svg.classList.toggle('is-zoomed', chartScaleX > 1 || chartScaleY > 1);
      const right = w - 24, top = 23, bottom = h - 53;
      const xKey = xControl.value, yKey = yControl.value;
      const xAxis = axis(xKey, w < 530 ? 4 : 7, chartLeft, chartScaleX);
      const yAxis = axis(yKey, 6, 1 - chartTop - 1 / chartScaleY, chartScaleY);
      const yTicks = [];
      for (let value = Math.ceil(yAxis.min / yAxis.step) * yAxis.step; value <= yAxis.max; value += yAxis.step)
        yTicks.push({value, label: yAxis.format(value)});
      svg.setAttribute('viewBox', [0, 0, w, h].join(' '));
      const measure = svgNode('text', {visibility: 'hidden'}, axes);
      const widestTick = Math.max(0, ...yTicks.map(tick => {
        measure.textContent = tick.label;
        return measure.getComputedTextLength();
      }));
      measure.remove();
      const left = Math.max(68, Math.ceil(widestTick) + 32);
      plot = {left, right, top, bottom};
      clipRect.setAttribute('x', left);
      clipRect.setAttribute('y', top);
      clipRect.setAttribute('width', right - left);
      clipRect.setAttribute('height', bottom - top);
      for (const [bounds, values] of [[zoom.x, xAxis], [zoom.y, yAxis]]) {
        bounds.min.title = values.format(values.min);
        bounds.max.title = values.format(values.max);
        bounds.min.setAttribute('aria-valuetext', values.format(values.min));
        bounds.max.setAttribute('aria-valuetext', values.format(values.max));
      }
      const x = value => left + (value - xAxis.min) / (xAxis.max - xAxis.min) * (right - left);
      const y = value => bottom - (value - yAxis.min) / (yAxis.max - yAxis.min) * (bottom - top);
      const categoryOffset = (entry, salt) => {
        let hash = salt;
        for (const char of entry.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
        return (Math.abs(hash) % 1000 / 999 - .5) * .6;
      };
      axes.replaceChildren();
      const line = (x1, y1, x2, y2, className) =>
        svgNode('line', {x1, y1, x2, y2, class: className}, axes);
      const text = (x, y, text, attributes = {}) =>
        svgNode('text', {x, y, ...attributes}, axes, text);
      for (let value = Math.ceil(xAxis.min / xAxis.step) * xAxis.step; value <= xAxis.max; value += xAxis.step) {
        const position = x(value);
        line(position, top, position, bottom, 'scatter-grid');
        text(position, bottom + 18, xAxis.format(value), {'text-anchor': 'middle'});
      }
      for (const tick of yTicks) {
        const position = y(tick.value);
        line(left, position, right, position, 'scatter-grid');
        text(left - 8, position + 4, tick.label, {'text-anchor': 'end'});
      }
      line(left, bottom, right, bottom, 'scatter-axis');
      line(left, bottom, left, top, 'scatter-axis');
      if (['votes', 'snsShare'].includes(xKey) && xAxis.min <= 50 && xAxis.max >= 50) line(x(50), top, x(50), bottom, 'scatter-reference');
      if (['votes', 'snsShare'].includes(yKey) && yAxis.min <= 50 && yAxis.max >= 50) line(left, y(50), right, y(50), 'scatter-reference');
      const averageY = metricAverages[yKey];
      if (Number.isFinite(averageY) && averageY >= yAxis.min && averageY <= yAxis.max) {
        const position = y(averageY);
        line(left, position, right, position, 'scatter-average');
        text(right - 5, Math.max(top + 11, position - 5), benchmarkLabel(yKey) + ': ' + metricValue({[yKey]: averageY}, yKey),
          {'text-anchor': 'end', class: 'scatter-average-label'});
      }
      text((left + right) / 2, h - 12, metricLabel(xKey), {'text-anchor': 'middle', class: 'axis-title'});
      const midY = (top + bottom) / 2;
      text(16, midY, metricLabel(yKey), {transform: 'rotate(-90 16 ' + midY + ')', 'text-anchor': 'middle', class: 'axis-title'});
      for (const entry of plotData) {
        const dot = points.get(entry.id);
        dot.setAttribute('cx', Number.isFinite(entry[xKey])
          ? x(entry[xKey] + (metrics[xKey].categorical ? categoryOffset(entry, 13) : 0)) : -10000);
        dot.setAttribute('cy', Number.isFinite(entry[yKey])
          ? y(entry[yKey] + (metrics[yKey].categorical ? categoryOffset(entry, 97) : 0)) : -10000);
      }
    }

    function resetView() {
      chartScaleX = 1;
      chartScaleY = 1;
      chartLeft = 0;
      chartTop = 0;
      syncZoomControls();
      chartDrag = null;
      chartPinch = null;
      svg.classList.remove('is-dragging');
      hideScatterTooltip();
    }


    function plotPoint(event) {
      if (!plot) return null;
      const bounds = svg.getBoundingClientRect();
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      return x >= plot.left && x <= plot.right && y >= plot.top && y <= plot.bottom ? {x, y} : null;
    }

    function moveChart(left, top) {
      chartLeft = Math.max(0, Math.min(1 - 1 / chartScaleX, left));
      chartTop = Math.max(0, Math.min(1 - 1 / chartScaleY, top));
      syncZoomControls();
      hideScatterTooltip();
      draw();
    }

    svg.addEventListener('touchstart', event => {
      if (event.touches.length !== 2 || !plot) return;
      const pair = touchPair(event.touches);
      if (!pair.distance) return;
      const bounds = svg.getBoundingClientRect();
      const fractionX = Math.max(0, Math.min(1, (pair.x - bounds.left - plot.left) / (plot.right - plot.left)));
      const fractionY = Math.max(0, Math.min(1, (pair.y - bounds.top - plot.top) / (plot.bottom - plot.top)));
      chartPinch = {distance: pair.distance, scaleX: chartScaleX, scaleY: chartScaleY,
        anchorX: chartLeft + fractionX / chartScaleX, anchorY: chartTop + fractionY / chartScaleY};
      chartDrag = null;
      ignoreChartClickUntil = Date.now() + 500;
    }, {passive: true});
    svg.addEventListener('touchmove', event => {
      if (!chartPinch || event.touches.length !== 2) return;
      event.preventDefault();
      const pair = touchPair(event.touches);
      const bounds = svg.getBoundingClientRect();
      const fractionX = Math.max(0, Math.min(1, (pair.x - bounds.left - plot.left) / (plot.right - plot.left)));
      const fractionY = Math.max(0, Math.min(1, (pair.y - bounds.top - plot.top) / (plot.bottom - plot.top)));
      chartScaleX = Math.max(1, Math.min(20, chartPinch.scaleX * pair.distance / chartPinch.distance));
      chartScaleY = Math.max(1, Math.min(20, chartPinch.scaleY * pair.distance / chartPinch.distance));
      moveChart(chartPinch.anchorX - fractionX / chartScaleX,
        chartPinch.anchorY - fractionY / chartScaleY);
      ignoreChartClickUntil = Date.now() + 500;
    }, {passive: false});
    for (const type of ['touchend', 'touchcancel'])
      svg.addEventListener(type, event => { if (event.touches.length < 2) chartPinch = null; });

    function syncZoomControls() {
      for (const [bounds, min, max] of [
        [zoom.x, chartLeft * 100, (chartLeft + 1 / chartScaleX) * 100],
        [zoom.y, (1 - chartTop - 1 / chartScaleY) * 100, (1 - chartTop) * 100],
      ]) {
        bounds.min.value = Math.round(min * 2) / 2;
        bounds.max.value = Math.round(max * 2) / 2;
        bounds.min.parentElement.style.setProperty('--range-start', min + '%');
        bounds.min.parentElement.style.setProperty('--range-end', max + '%');
      }
    }

    for (const [dimension, bounds] of Object.entries(zoom)) {
      for (const handle of [bounds.min, bounds.max]) {
        handle.addEventListener('input', () => {
          let min = Number(bounds.min.value);
          let max = Number(bounds.max.value);
          if (max - min < 5) {
            if (handle === bounds.min) min = max - 5;
            else max = min + 5;
            handle.value = handle === bounds.min ? min : max;
          }
          const scale = 100 / (max - min);
          if (dimension === 'x') {
            chartScaleX = scale;
            chartLeft = min / 100;
          } else {
            chartScaleY = scale;
            chartTop = (100 - max) / 100;
          }
          syncZoomControls();
          hideScatterTooltip();
          draw();
        });
      }
    }

    svg.addEventListener('wheel', event => {
      if (event.ctrlKey) return;
      const point = plotPoint(event);
      const nextX = wheelScale(event, chartScaleX, 20);
      const nextY = wheelScale(event, chartScaleY, 20);
      if (!point || (nextX === chartScaleX && nextY === chartScaleY)) return;
      event.preventDefault();
      const differenceX = 1 / chartScaleX - 1 / nextX;
      const differenceY = 1 / chartScaleY - 1 / nextY;
      chartScaleX = nextX;
      chartScaleY = nextY;
      moveChart(chartLeft + (point.x - plot.left) / (plot.right - plot.left) * differenceX,
        chartTop + (point.y - plot.top) / (plot.bottom - plot.top) * differenceY);
    }, {passive: false});

    svg.addEventListener('pointerdown', event => {
      chartDrag = null;
      if ((chartScaleX === 1 && chartScaleY === 1) || event.button !== 0 || !plotPoint(event)) return;
      chartDrag = {id: event.pointerId, x: event.clientX, y: event.clientY,
        left: chartLeft, top: chartTop, moved: false};
    });

    function dragChart(event) {
      if (chartPinch) return false;
      if (!chartDrag || event.pointerId !== chartDrag.id || !(event.buttons & 1) || (chartScaleX === 1 && chartScaleY === 1)) return false;
      const dx = event.clientX - chartDrag.x;
      const dy = event.clientY - chartDrag.y;
      if (!chartDrag.moved && Math.hypot(dx, dy) < 5) return false;
      if (!chartDrag.moved) {
        chartDrag.moved = true;
        svg.setPointerCapture(event.pointerId);
        svg.classList.add('is-dragging');
      }
      moveChart(chartDrag.left - dx / ((plot.right - plot.left) * chartScaleX),
        chartDrag.top - dy / ((plot.bottom - plot.top) * chartScaleY));
      return true;
    }

    function select(entry) {
      currentEntry = entry;
      highlighted?.classList.remove('is-selected');
      highlighted = points.get(entry?.id);
      highlighted?.classList.add('is-selected');
      if (highlighted) marks.append(highlighted);
      showScatterValues(entry);
    }

    function showScatterValues(entry) {
      const summary = !entry ? summarizeSelectedRegions() : null;
      showPlotValues(readout, entry || summary,
        ['scatter-x', 'scatter-y', 'scatter-size', 'scatter-color'], Boolean(summary));
    }

    function hover(entry) {
      const nextPoint = points.get(entry?.id);
      if (hoveredPoint === nextPoint) return;
      hoveredPoint?.classList.remove('is-hovered');
      hoveredPoint = nextPoint;
      hoveredPoint?.classList.add('is-hovered');
      if (hoveredPoint) marks.append(hoveredPoint);
      else if (highlighted) marks.append(highlighted);
      showScatterValues(entry || currentEntry);
    }

    function hideScatterTooltip() {
      tip.hidden = true;
      setHover(null);
    }

    function updateMetrics() {
      const sizeKey = sizeControl.value;
      const colorKey = colorControl.value;
      const sizes = plotData.map(entry => entry[sizeKey]).filter(Number.isFinite);
      const maxSize = Math.max(...sizes);
      const radius = value => Number.isFinite(value) ? 18 * (value / maxSize) ** .3 : 0;
      for (const entry of [...plotData].sort((a, b) => b[sizeKey] - a[sizeKey])) {
        const dot = points.get(entry.id);
        dot.setAttribute('r', radius(entry[sizeKey]));
        delete dot.dataset.development;
        if (colorKey === 'region') delete dot.dataset.level;
        else if (colorKey === 'developmentGroup2014') {
          delete dot.dataset.level;
          if (Number.isFinite(entry[colorKey])) dot.dataset.development = entry[colorKey];
        }
        else if (Number.isFinite(entry[colorKey])) dot.dataset.level = metricClass(entry[colorKey], metrics[colorKey].breaks);
        else delete dot.dataset.level;
        marks.append(dot);
      }
      legend.replaceChildren();
      legend.classList.toggle('is-numeric', colorKey !== 'region' && colorKey !== 'developmentGroup2014');
      if (colorKey === 'region') {
        const title = document.createElement('li');
        title.className = 'scatter-color-title';
        title.textContent = 'Boja · Statistička regija';
        legend.append(title);
        for (const [code, name] of Object.entries(regions)) {
          const item = document.createElement('li');
          item.dataset.region = code;
          item.textContent = name;
          item.classList.toggle('is-inactive', !selectedRegions.has(code));
          legend.append(item);
        }
      } else if (colorKey === 'developmentGroup2014') {
        const title = document.createElement('li');
        title.className = 'scatter-color-title';
        title.textContent = 'Boja · ' + metricLabel(colorKey);
        legend.append(title);
        for (const [code, label] of Object.entries(developmentLabels)) {
          const item = document.createElement('li');
          item.dataset.development = code;
          item.textContent = label;
          legend.append(item);
        }
      } else {
        const title = document.createElement('li');
        title.className = 'scatter-color-title';
        title.textContent = 'Boja · ' + metricLabel(colorKey);
        legend.append(title);
        rangeLabels(colorKey).forEach((label, index) => {
          const item = document.createElement('li');
          item.dataset.level = index;
          item.textContent = label;
          legend.append(item);
        });
      }
      sizeLabel.textContent = metricLabel(sizeKey) + ' (ublažena skala)';
      const base = 10 ** Math.floor(Math.log10(maxSize));
      const high = [5, 2, 1].find(n => n * base <= maxSize) * base;
      const samples = sizeKey === 'averageNetWage2025'
        ? [Math.min(...sizes), (Math.min(...sizes) + maxSize) / 2, maxSize]
        : high >= 10000 ? [high / 100, high / 10, high] : [high / 10, high / 2, high];
      sizeLegend.replaceChildren();
      for (const value of samples) {
        const item = document.createElement('span');
        item.className = 'scatter-size';
        const sample = document.createElement('i');
        sample.setAttribute('aria-hidden', 'true');
        sample.style.setProperty('--diameter', 2 * radius(value) + 'px');
        item.append(sample, metrics[sizeKey].unit === '%' ? percent(value) : number.format(value));
        sizeLegend.append(item);
      }
      const xKey = xControl.value, yKey = yControl.value;
      get('scatter-description').textContent = 'X osa: ' + metricLabel(xKey) + '. Y osa: ' + metricLabel(yKey) +
        '. Veličina: ' + metricLabel(sizeKey) + '. Boja: ' + (colorKey === 'region' ? 'statistička regija' : metricLabel(colorKey)) +
        (metrics[yKey].categorical ? '.' : '. Horizontalna referentna linija: ' + benchmarkLabel(yKey) + ' — ' + metricValue({[yKey]: metricAverages[yKey]}, yKey) + '.') +
        ' Izaberi krug za tačne vrijednosti opštine, Inostranstva ili Kaznenih zavoda.';
      tip.hidden = true;
      select(currentEntry);
      applyFilter();
    }

    function entryAt(event) {
      const direct = byId.get(event.target.dataset.unitId);
      if (direct && isVisible(direct.id) && hasPlotValue(direct)) return direct;
      const point = plotPoint(event);
      if (!point) return null;
      let nearest;
      let distance = 6;
      for (const [id, dot] of points) {
        if (!isVisible(id) || !hasPlotValue(byId.get(id))) continue;
        const gap = Math.hypot(dot.cx.baseVal.value - point.x, dot.cy.baseVal.value - point.y);
        if (gap < distance) {
          nearest = byId.get(id);
          distance = gap;
        }
      }
      return nearest;
    }

    svg.addEventListener('pointermove', event => {
      if (dragChart(event)) return;
      const entry = entryAt(event);
      if (!entry || event.pointerType === 'touch') {
        hideScatterTooltip();
        return;
      }
      tip.hidden = false;
      tip.textContent = entry.name;
      setHover(entry);
      const bounds = stage.getBoundingClientRect();
      const left = Math.max(6, Math.min(event.clientX - bounds.left + 12, bounds.width - tip.offsetWidth - 6));
      const above = event.clientY - bounds.top - tip.offsetHeight - 10;
      tip.style.left = left + 'px';
      tip.style.top = (above > 6 ? above : event.clientY - bounds.top + 16) + 'px';
    });
    svg.addEventListener('pointerleave', hideScatterTooltip);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      svg.addEventListener(type, () => svg.classList.remove('is-dragging'));
    }
    svg.addEventListener('click', event => {
      if (Date.now() < ignoreChartClickUntil) return;
      if (chartDrag?.moved) {
        chartDrag = null;
        return;
      }
      const entry = entryAt(event);
      if (syncVisualFilters.checked) clearTableFilters(true);
      if (entry?.region === 'OTHER') chooseSpecial(entry);
      else choose(entry ? get(entry.id) : null);
      if (!entry) hideScatterTooltip();
      else if (scale > 1) zoom(1);
    });
    for (const control of [xControl, yControl, sizeControl, colorControl]) {
      control.addEventListener('change', () => {
        if (control === xControl || control === yControl) resetView();
        updateMetrics();
      });
    }
    updateMetrics();
    new ResizeObserver(draw).observe(svg);
    function hasPlotValue(entry) {
      return Number.isFinite(entry[xControl.value]) && Number.isFinite(entry[yControl.value]) &&
        Number.isFinite(entry[sizeControl.value]) &&
        (colorControl.value === 'region' || Number.isFinite(entry[colorControl.value]));
    }
    function applyFilter() {
      resetView();
      for (const [id, dot] of points) {
        dot.classList.toggle('is-filtered', !isVisible(id) || !hasPlotValue(byId.get(id)));
      }
      draw();
      hideScatterTooltip();
    }
    return {select, hover, applyFilter, refreshAverages: updateMetrics,
      refreshReadout: () => showScatterValues(currentEntry)};
  }

  scatter = createScatter();
  const regionPicker = document.querySelector('.region-picker-options');
  const selectAllRegions = get('select-all-regions');
  function refreshRegions() {
    if (syncVisualFilters.checked) clearTableFilters(true, false);
    selectAllRegions.disabled = selectedRegions.size === Object.keys(regions).length;
    for (const item of regionLegend.querySelectorAll('[data-region]')) {
      item.classList.toggle('is-inactive', !selectedRegions.has(item.dataset.region));
    }
    for (const outline of outlineGroup.children) {
      outline.classList.toggle('is-filtered', !selectedRegions.has(outline.dataset.region));
    }
    if (syncVisualFilters.checked) renderTable();
    else applyVisualFilter(visibleRows);
    showMapValues(selectedSpecial || byId.get(selected?.id));
  }
  function fitRegion(code) {
    const outline = [...outlineGroup.children].find(item => item.dataset.region === code);
    if (!outline) {
      updateView(1, width / 2, height / 2);
      return;
    }
    const bounds = outline.getBBox();
    if (!bounds.width || !bounds.height) return;
    const padding = 1.16;
    const fittedScale = Math.min(width / (bounds.width * padding),
      height / (bounds.height * padding), maxMapZoom);
    updateView(fittedScale, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  }
  for (const [code, name] of Object.entries(regions)) {
    const option = document.createElement('div');
    option.className = 'region-option';
    const label = document.createElement('label');
    label.dataset.region = code;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = code;
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedRegions.add(code);
      else selectedRegions.delete(code);
      if (!selectedRegions.size) {
        checkbox.checked = true;
        selectedRegions.add(code);
        return;
      }
      refreshRegions();
    });
    const only = document.createElement('button');
    only.type = 'button';
    only.className = 'region-only';
    only.textContent = 'Izdvoji';
    only.setAttribute('aria-label', 'Prikaži samo ' + name);
    only.addEventListener('click', () => {
      selectedRegions.clear();
      selectedRegions.add(code);
      for (const input of regionPicker.querySelectorAll('input')) input.checked = input.value === code;
      refreshRegions();
      fitRegion(code);
    });
    label.append(checkbox, name);
    option.append(label, only);
    regionPicker.append(option);
  }
  selectAllRegions.addEventListener('click', () => {
    for (const code of Object.keys(regions)) selectedRegions.add(code);
    for (const input of regionPicker.querySelectorAll('input')) input.checked = true;
    refreshRegions();
    updateView(1, width / 2, height / 2);
  });
  renderTable();

  const mapOptions = document.querySelector('.map-panel .visual-options');
  const scatterOptions = document.querySelector('.scatter-panel .visual-options');
  const regionPickerPanel = document.querySelector('.region-picker');
  const scatterRegions = document.querySelector('.scatter-regions');
  function alignPlotTops() {
    scatterOptions.style.marginBottom = '';
    regionPickerPanel.style.minHeight = '';
    scatterRegions.style.minHeight = '';
    if (window.innerWidth <= 900) return;
    const mapLegendBottom = mapLegend.getBoundingClientRect().bottom;
    const scatterOptionsBottom = scatterOptions.getBoundingClientRect().bottom;
    if (scatterOptionsBottom < mapLegendBottom)
      scatterOptions.style.marginBottom = mapLegendBottom - scatterOptionsBottom + 'px';
    const mapRow = regionPickerPanel.getBoundingClientRect();
    const scatterRow = scatterRegions.getBoundingClientRect();
    if (mapRow.bottom < scatterRow.bottom)
      regionPickerPanel.style.minHeight = mapRow.height + scatterRow.bottom - mapRow.bottom + 'px';
    else if (scatterRow.bottom < mapRow.bottom)
      scatterRegions.style.minHeight = scatterRow.height + mapRow.bottom - scatterRow.bottom + 'px';
  }
  const plotAlignmentObserver = new ResizeObserver(alignPlotTops);
  plotAlignmentObserver.observe(mapOptions);
  plotAlignmentObserver.observe(scatterOptions);
  plotAlignmentObserver.observe(mapLegend);
  plotAlignmentObserver.observe(regionPickerPanel);
  plotAlignmentObserver.observe(scatterRegions);
  window.addEventListener('resize', alignPlotTops);
  alignPlotTops();
})();
