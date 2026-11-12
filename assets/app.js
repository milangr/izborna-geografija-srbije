(() => {
  'use strict';
  const preferenceKey = 'izborna-geografija-prikaz-v1';
  const defaultMetrics = {'map-color': 'differencePer1000', 'map-texture': 'votersAttended',
    'scatter-x': 'turnout', 'scatter-y': 'differencePer1000',
    'scatter-size': 'registeredVoters', 'scatter-color': 'region',
    'region-box-y': 'differencePer1000', 'region-box-size': 'registeredVoters'};

  document.addEventListener('wheel', event => {
    const select = event.target.closest?.('select');
    if (event.ctrlKey || event.metaKey || !select || select.disabled || select.multiple || !event.deltaY) return;
    const direction = Math.sign(event.deltaY);
    for (let index = select.selectedIndex + direction; index >= 0 && index < select.options.length; index += direction) {
      const option = select.options[index];
      if (option.disabled || option.parentElement?.disabled) continue;
      event.preventDefault();
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change', {bubbles: true}));
      break;
    }
  }, {passive: false});

  const {data, specialResults, tableData, developmentLabels, maxVoteDifference, maxDifferencePer1000,
    maxWage, byId} = window.createElectionDataModel(window);
  const regions = {
    RS11: 'Beogradski region',
    RS12: 'Vojvodina',
    RS21: 'Šumadija i Zapadna Srbija',
    RS22: 'Južna i Istočna Srbija',
    RS23: 'Kosovo i Metohija',
    OTHER: 'Ostalo',
  };
  const regionCounts = Object.fromEntries(Object.keys(regions).map(code =>
    [code, tableData.filter(entry => entry.region === code && (code === 'OTHER' || !entry.special)).length]));
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
  const {number, wholeNumber, wageEur, signedDecimal, signedWholeNumber, byName, percent, compact,
    metrics, metricValue, summedMetrics, signed, metricLabel, mapLegendLabel,
    isDifference, columns, sourceLinks, columnHelp} = window.createMetricDefinitions({developmentLabels, shortRegions, tableRegions});
  const get = id => document.getElementById(id);
  const map = document.querySelector('.map');
  const stage = document.querySelector('.map-stage');
  const mapMunicipalityCount = get('map-municipality-count');
  const specialMapControls = stage.querySelector('.map-specials');
  const mappedSpecialResults = specialResults.filter(entry => entry.region === 'OTHER');
  const selection = map.querySelector('.selection');
  const hoverOutline = map.querySelector('.hover-outline');
  const mapReadout = document.querySelector('.map-panel .metric-controls');
  const filterLinkMode = get('filter-link-mode');
  const syncVisualFilters = {get checked() { return filterLinkMode.value === 'visual'; }};
  let selected = null;
  let selectedSpecial = null;
  let visualFilter = null;
  let matrixSelection = new Set();
  let scatter = null;
  let regionBars = null;
  let selectionSummary = null;
  const isVisible = id => selectedRegions.has(byId.get(id).region) &&
    (!visualFilter || visualFilter.has(id)) && matchesMatrixFilter(byId.get(id));
  const matchesMatrixFilter = entry => {
    if (!matrixSelection.size) return true;
    const color = mapColor.value;
    const texture = mapTexture.value;
    if (!Number.isFinite(entry[texture]) || !Number.isFinite(entry[color])) return false;
    const row = 2 - metricClass(entry[texture], metrics[texture].breaks);
    const column = color === 'developmentGroup2014'
      ? developmentColumns.indexOf(mapDevelopmentGroup(entry[color]))
      : mapColorClass(entry[color], color);
    return matrixSelection.has(row + ':' + column);
  };
  const isChartVisible = isVisible;
  const mapView = window.createMapView({map, stage, byId, selectedRegions, isVisible,
    getSelected: () => selected, onHover: setHover, wheelScale, touchPair,
    onChoose: unit => {
      if (syncVisualFilters.checked) clearTableFilters(true);
      choose(unit);
    },
  });
  const {outlineGroup, zoom, fitSelectedRegions} = mapView;

  const xyReferences = {};
  const metricDistributions = {};
  const xyReferenceLabel = () => 'Medijana opština';
  let distributionRevision = 0;
  const {describeDistribution} = window.electionCalculations;
  function refreshMetricDistributions() {
    const entries = data.filter(entry => isVisible(entry.id));
    for (const key of Object.keys(metrics)) {
      const values = metrics[key].categorical ? [] : entries.map(entry => entry[key])
        .filter(Number.isFinite).sort((a, b) => a - b);
      metricDistributions[key] = describeDistribution(values);
      xyReferences[key] = metrics[key].categorical ? NaN
        : metricDistributions[key]?.median ?? NaN;

    }
    distributionRevision++;
  }
  refreshMetricDistributions();
  const {showPlotValues} = window.createMetricReadout({metrics, regions, metricValue, metricLabel,
    xyReferences, metricDistributions, summedMetrics, isDifference, signed,
    state: {get visualFilter() { return visualFilter; }, get distributionRevision() { return distributionRevision; }},
  });
  const metricClass = (value, [low, high]) => value < low ? 0 : value < high ? 1 : 2;
  function rangeLabels(key) {
    const format = isDifference(key) ? metrics[key].format
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
    if (key === 'differencePer1000') {
      mapBreaks[key] = [-50, 50];
    } else if (key === 'averageNetWage2025') {
      mapBreaks[key] = metrics[key].breaks;
    } else if (isDifference(key)) {
      mapBreaks[key] = metrics[key].breaks;
    } else {
      const centralSpread = quantile(values, .8) - quantile(values, .2);
      const step = 10 ** Math.floor(Math.log10(centralSpread / 4 || 1));
      mapBreaks[key] = [1 / 3, 2 / 3].map(fraction => Math.round(quantile(values, fraction) / step) * step);
      if (mapBreaks[key][1] <= mapBreaks[key][0]) mapBreaks[key][1] = mapBreaks[key][0] + step;
    }
  }
  const mapColorClass = (value, key) => key === 'differencePer1000'
    ? value < -50 ? 0 : value > 50 ? 2 : 1
    : mapBreaks[key].reduce((level, boundary) => level + (value >= boundary), 0);
  const mapRangeLabels = key => {
    if (key === 'differencePer1000') return ['< −50', '≥ −50 i ≤ +50', '> +50'];
    const format = isDifference(key) ? metrics[key].format
      : metrics[key].unit === '%' ? percent : compact.format;
    const breaks = mapBreaks[key].map(format);
    return ['< ' + breaks[0], '≥ ' + breaks[0] + ' i < ' + breaks[1], '≥ ' + breaks[1]];
  };
  const mapDevelopmentGroup = code => code <= 2 ? 1 : code <= 4 ? 3 : 5;
  function metricSelect(id, defaultValue, includeRegions = false) {
    const select = get(id);
    if (includeRegions) select.add(new Option('Regija', 'region'));
    for (const key of Object.keys(metrics)) {
      if (metrics[key].categorical && ['map-texture', 'scatter-size', 'region-box-size', 'region-box-y'].includes(id)) continue;
      if (['scatter-size', 'region-box-size'].includes(id) && isDifference(key)) continue;
      select.add(new Option(metricLabel(key), key));
    }
    select.value = defaultMetrics[id] || defaultValue;
    const updateTitle = () => { select.title = select.selectedOptions[0]?.textContent || ''; };
    updateTitle();
    select.addEventListener('change', updateTitle);
    return select;
  }
  const mapColor = metricSelect('map-color', 'differencePer1000');
  const mapTexture = metricSelect('map-texture', 'votersAttended');
  const {mapLegend, regionLegend, developmentColumns, specialMapButtons,
    updateMapMetrics, updateLegendSelection} = window.createMapLegend({
    model: {data, mappedSpecialResults, regions, metrics, developmentLabels},
    controls: {mapColor, mapTexture, specialMapControls},
    state: {get matrixSelection() { return matrixSelection; },
      set matrixSelection(value) { matrixSelection = value; }},
    formatting: {metricClass, mapDevelopmentGroup, mapColorClass, metricLabel, mapLegendLabel,
      mapRangeLabels, rangeLabels},
    actions: {refreshVisuals, renderTable, syncVisualFilters, clearTableFilters, chooseSpecial,
      isVisible, showMapValues, getSelectedEntry: () => selectedSpecial || byId.get(selected?.id),
      hideTooltip, updateMapReadout},
  });

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
    return {id: 'regions-' + codes.join('-'), summaryLabel,
      ...window.electionCalculations.aggregateEntries(entries)};
  }

  mapColor.addEventListener('change', updateMapMetrics);
  mapTexture.addEventListener('change', updateMapMetrics);
  updateMapMetrics();

  const table = get('municipality-table');
  const tableBody = table.tBodies[0];
  const tableFoot = table.tFoot;
  const syncFilters = {get checked() { return filterLinkMode.value === 'table'; }};
  const selectedRows = new Set();
  const isSelectableRow = entry => !entry.special || entry.region === 'OTHER';
  let visibleRows = [];
  let tableFilteredRows = [];
  const tableHeader = window.createTableHeader({table, columns, tableData, regions, developmentLabels,
    byName, columnHelp, sourceLinks, selectedRows, isSelectableRow,
    getVisibleRows: () => visibleRows, renderTable});
  const {headers, rangeFilters, filterButtons, selectAll, nameFilter, regionFilter,
    districtFilter, developmentFilter, columnVisibility, columnButton} = tableHeader;
  selectionSummary = window.createSelectionSummary({panel: get('selection-summary'), columns, wholeNumber, totalValues,
    getState: () => ({entry: selectedSpecial || byId.get(selected?.id),
      entries: tableData.filter(entry => isVisible(entry.id)), visibleColumns: columnVisibility.selected,
      scopeLabel: selectedRegions.size === 1 ? regions[[...selectedRegions][0]]
        : selectedRegions.size === Object.keys(regions).length ? 'Sve regije' : 'Odabrane regije',
    }),
  });

  function renderTable() {
    const {sortKey, ascending} = tableHeader;
    for (const [key, header] of headers) {
      if (key === sortKey) header.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
      else header.removeAttribute('aria-sort');
    }
    filterButtons.get('name').classList.toggle('has-filter', nameFilter.isActive());
    filterButtons.get('region').classList.toggle('has-filter', regionFilter.isActive());
    filterButtons.get('district').classList.toggle('has-filter', districtFilter.isActive());
    filterButtons.get('developmentGroup2014').classList.toggle('has-filter', developmentFilter.isActive());
    const ranges = [...rangeFilters].map(([key, [min, max]]) => {
      filterButtons.get(key).classList.toggle('has-filter', Boolean(min.value || max.value));
      return [key, Number.isNaN(min.valueAsNumber) ? -Infinity : min.valueAsNumber,
        Number.isNaN(max.valueAsNumber) ? Infinity : max.valueAsNumber];
    });
    const choices = {id: nameFilter, region: regionFilter, district: districtFilter,
      developmentGroup2014: developmentFilter};
    const filtered = window.electionFilters.filterRows(tableData, {
      choices: Object.fromEntries(Object.entries(choices).map(([key, filter]) =>
        [key, filter.isActive() ? filter.selected : null])), ranges,
    });
    const visible = window.electionFilters.visibleTableRows(filtered, {
      linked: syncVisualFilters.checked, selectedRegions, matchesMatrixFilter,
      selectedId: selectedSpecial?.id || selected?.id,
    });
    visible.sort(window.electionFilters.compareRows({sortKey, ascending, byName, regions: tableRegions}));
    window.renderMunicipalityTable({visible, currentId: selectedSpecial?.id || selected?.id,
      elements: {table, tableBody, tableFoot, columnVisibility},
      model: {columns, selectedRows, syncFilters, regionFilter, districtFilter, tableRegions, developmentLabels,
        maxDifferencePer1000, maxVoteDifference, maxWage},
      formatting: {wholeNumber, isDifference, totalValues},
      actions: {isSelectableRow, updateTableStatus, choose, chooseSpecial, renderTable},
    });
    columnButton.classList.toggle('has-filter', columnVisibility.isActive());
    visibleRows = visible;
    tableFilteredRows = filtered;
    updateTableStatus();
  }

  function totalValues(visible) {
    const totals = window.electionCalculations.aggregateEntries(visible);
    // The table keeps its existing density scope and hides an unavailable/zero area.
    totals.density = Number.isFinite(totals.population) && totals.areaKm2
      ? totals.population / totals.areaKm2 : null;
    if (!totals.areaKm2) totals.areaKm2 = null;
    const formatters = {
      stations: wholeNumber.format, population: wholeNumber.format, density: number.format,
      registeredVoters: wholeNumber.format, votersAttended: wholeNumber.format,
      turnout: percent, validVotes: wholeNumber.format, invalidShare: percent,
      listVotes: wholeNumber.format, snsVotes: wholeNumber.format,
      voteDifference: signedWholeNumber.format, differencePer1000: signedDecimal.format,
      areaKm2: number.format, votes: percent, snsShare: percent,
    };
    return Object.fromEntries(Object.entries(formatters).map(([key, format]) =>
      [key, Number.isFinite(totals[key]) ? format(totals[key]) : '—']));
  }

  function updateTableStatus() {
    const selectable = visibleRows.filter(isSelectableRow);
    const filterSelectable = tableFilteredRows.filter(isSelectableRow);
    const visibleSelected = selectable.filter(entry => selectedRows.has(entry.id)).length;
    selectAll.checked = selectable.length > 0 && visibleSelected === selectable.length;
    selectAll.indeterminate = visibleSelected > 0 && visibleSelected < selectable.length;
    selectAll.disabled = selectable.length === 0;
    applyVisualFilter(selectedRows.size
      ? filterSelectable.filter(entry => selectedRows.has(entry.id)) : filterSelectable);
  }

  filterLinkMode.addEventListener('change', () => renderTable());
  function clearTableFilters(clearSelection = false, rerender = true) {
    nameFilter.clear();
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
    refreshVisuals();
  }
  function refreshVisuals() {
    refreshMetricDistributions();
    const countLabel = 'Odabrane opštine: ' + data.filter(entry => isVisible(entry.id)).length;
    if (mapMunicipalityCount.textContent !== countLabel) mapMunicipalityCount.textContent = countLabel;
    if (selected && !isVisible(selected.id)) choose(null);
    if (selectedSpecial && !isVisible(selectedSpecial.id)) choose(null);
    for (const entry of data) {
      const filtered = !isVisible(entry.id);
      get(entry.id).classList.toggle('is-filtered', filtered);
      get(entry.id + '-texture').classList.toggle('is-filtered', filtered);
    }
    for (const entry of mappedSpecialResults) specialMapButtons.get(entry.id).disabled =
      !isVisible(entry.id);
    regionBars?.applyFilter();
    hideTooltip();
    scatter?.refresh();
    get('jump-to-visuals').hidden = !visualFilter;
    selectionSummary?.refresh();
  }

  function hideTooltip() { mapView.hideTooltip(); }

  function setHover(entry) {
    const hovered = entry && isVisible(entry.id) ? entry : null;
    showMapValues(hovered || selectedSpecial || byId.get(selected?.id));
    scatter?.hover(hovered);
    regionBars?.hover(hovered);
    const unit = hovered && get(hovered.id);
    hoverOutline.setAttribute('visibility', unit ? 'visible' : 'hidden');
    if (unit) hoverOutline.setAttribute('d', unit.getAttribute('d'));
  }

  function choose(unit, updateSyncedTable = true) {
    selectedSpecial = null;
    for (const button of specialMapButtons.values()) button.setAttribute('aria-pressed', 'false');
    selected = unit && isVisible(unit.id) ? unit : null;
    const entry = byId.get(selected?.id);
    for (const row of tableBody.rows) row.classList.toggle('is-current', row.dataset.unitId === entry?.id);
    selection.setAttribute('visibility', entry ? 'visible' : 'hidden');
    scatter.select(entry);
    regionBars?.select(entry);
    updateMapReadout(entry);
    selectionSummary?.refresh();
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
    regionBars?.select(entry);
    showMapValues(entry);
    if (syncVisualFilters.checked) renderTable();
    selectionSummary?.refresh();
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

  scatter = window.createScatter({
    model: {data, mappedSpecialResults, byId, metrics, regions, selectedRegions, developmentLabels, xyReferences},
    formatting: {metricLabel, metricValue, isDifference, percent, number, wageEur, metricClass, rangeLabels, xyReferenceLabel},
    view: {metricSelect, showPlotValues, summarizeSelectedRegions, isChartVisible},
    interaction: {touchPair, wheelScale, onHover: setHover, onChoose: entry => {
      if (syncVisualFilters.checked) clearTableFilters(true);
      if (entry?.region === 'OTHER') chooseSpecial(entry);
      else choose(entry ? get(entry.id) : null);
      if (entry && mapView.scale > 1) zoom(1);
    }},
  });
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
    regionBars?.refreshRegionSelection();
    if (syncVisualFilters.checked) renderTable();
    else updateTableStatus();
    showMapValues(selectedSpecial || byId.get(selected?.id));
    fitSelectedRegions();
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
    });
    label.append(checkbox, `${name} (${regionCounts[code]})`);
    option.append(label, only);
    regionPicker.append(option);
  }
  selectAllRegions.addEventListener('click', () => {
    for (const code of Object.keys(regions)) selectedRegions.add(code);
    for (const input of regionPicker.querySelectorAll('input')) input.checked = true;
    refreshRegions();
  });
  renderTable();

  metricSelect('region-box-y', 'differencePer1000');
  metricSelect('region-box-size', 'registeredVoters');
  regionBars = window.createRegionBars({entries: tableData, regions, shortRegions, selectedRegions, metrics, metricLabel, metricValue, number, totalValues,
    isVisible: id => (!visualFilter || visualFilter.has(id)) && matchesMatrixFilter(byId.get(id)),
    onChoose: entry => {
      if (syncVisualFilters.checked) clearTableFilters(true);
      if (entry?.region === 'OTHER') chooseSpecial(entry);
      else choose(entry ? get(entry.id) : null);
      regionBars.select(entry);
    },
    onHover: entry => { setHover(entry); regionBars.hover(entry); }});

  const mapOptions = document.querySelector('.map-panel .visual-options');
  const scatterOptions = document.querySelector('.scatter-panel .visual-options');
  const mapLowerControls = document.createElement('div');
  mapLowerControls.className = 'map-lower-controls';
  mapOptions.parentElement.append(mapLowerControls);
  mapLowerControls.append(mapLegend, mapOptions);
  scatterOptions.parentElement.append(scatterOptions);

  window.initializeViewPreferences({preferenceKey, defaultMetrics, regions, selectedRegions, regionPicker,
    selectAllRegions, filterLinkMode, refreshRegions, renderTable});
  window.initializeHelpPopovers();
})();
