(() => {
  'use strict';
  window.createMapLegend = ({model, controls, state, formatting, actions}) => {
    const {data, mappedSpecialResults, regions, metrics, developmentLabels} = model;
    const {mapColor, mapTexture, specialMapControls} = controls;
    const {metricClass, mapDevelopmentGroup, mapColorClass, metricLabel, mapLegendLabel,
      mapRangeLabels, rangeLabels} = formatting;
    const {refreshVisuals, renderTable, syncVisualFilters, clearTableFilters, chooseSpecial,
      isVisible, showMapValues, getSelectedEntry, hideTooltip, updateMapReadout} = actions;
    const get = id => document.getElementById(id);
    const mapLegend = document.querySelector('.map-panel .legend');
    const colorCaption = mapLegend.querySelector('caption');
    const colorMatrix = mapLegend.querySelector('table');
    const regionLegend = mapLegend.querySelector('.map-region-legend');
    function addLegendFilterHelp(caption, id) {
      const heading = document.createElement('span');
      heading.className = 'map-legend-caption-title';
      const wrapper = document.createElement('div');
      wrapper.className = 'map-legend-caption-inner';
      const help = document.createElement('div');
      help.className = 'method-help map-legend-help';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'method-help-button';
      button.textContent = 'i';
      button.setAttribute('aria-label', 'Kako filtrirati pomoću matrice legende');
      button.setAttribute('aria-describedby', id);
      const tip = document.createElement('div');
      tip.className = 'method-tooltip';
      tip.id = id;
      tip.setAttribute('role', 'tooltip');
      for (const sentence of [
        'Klik na polje bira jednu kombinaciju boje i tačaka.',
        'Zaglavlje bira cijeli red ili kolonu.',
        'Ctrl-klik (Command-klik na Macu) dodaje ili uklanja izbor.',
        '× čisti filter.',
        'Izbor filtrira prikaze, a tabelu kada je uključeno „Grafikoni → tabela”.',
      ]) {
        const line = document.createElement('p');
        line.className = 'tooltip-sentence';
        line.textContent = sentence;
        tip.append(line);
      }
      help.append(button, tip);
      wrapper.append(heading, help);
      caption.replaceChildren(wrapper);
      return heading;
    }
    colorMatrix.classList.add('map-numeric-legend');
    const colorCaptionText = addLegendFilterHelp(colorCaption, 'map-numeric-filter-tip');
    const numericHead = colorMatrix.querySelector('thead tr');
    numericHead.replaceChildren(document.createElement('th'));
    for (let level = 0; level < 3; level++) {
      const heading = document.createElement('th');
      heading.scope = 'col';
      heading.dataset.filterKind = 'column';
      heading.dataset.filterColumn = level;
      numericHead.append(heading);
    }
    const numericBody = colorMatrix.querySelector('tbody');
    numericBody.replaceChildren();
    for (let density = 2; density >= 0; density--) {
      const row = document.createElement('tr');
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.className = 'row-head';
      heading.dataset.filterKind = 'row';
      heading.dataset.filterRow = 2 - density;
      row.append(heading);
      for (let level = 0; level < 3; level++) {
        const cell = document.createElement('td');
        cell.dataset.filterKind = 'cell';
        cell.dataset.filterRow = 2 - density;
        cell.dataset.filterColumn = level;
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
    const developmentCaptionText = addLegendFilterHelp(developmentTitle, 'map-development-filter-tip');
    developmentCaptionText.textContent = 'Boja · Stepen razvijenosti';
    developmentLegend.append(developmentTitle);
    const developmentHead = document.createElement('thead');
    const developmentHeadRow = document.createElement('tr');
    developmentHeadRow.append(document.createElement('th'));
    const developmentColumns = [5, 3, 1];
    for (const [index] of developmentColumns.entries()) {
      const heading = document.createElement('th');
      heading.scope = 'col';
      heading.dataset.filterKind = 'column';
      heading.dataset.filterColumn = index;
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
      rowHeading.dataset.filterKind = 'row';
      rowHeading.dataset.filterRow = 2 - density;
      row.append(rowHeading);
      for (const code of developmentColumns) {
        const cell = document.createElement('td');
        cell.dataset.filterKind = 'cell';
        cell.dataset.filterRow = 2 - density;
        cell.dataset.filterColumn = developmentColumns.indexOf(code);
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
    for (const table of [colorMatrix, developmentLegend]) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'map-legend-clear';
      clear.setAttribute('aria-label', 'Ukloni filter grafikona');
      clear.title = 'Ukloni filter grafikona';
      clear.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg>';
      clear.hidden = true;
      clear.addEventListener('click', event => {
        event.stopPropagation();
        state.matrixSelection = new Set();
        updateMatrixFilterSelection();
        refreshVisuals();
        if (syncVisualFilters.checked) renderTable();
      });
      table.querySelector('thead th').append(clear);
    }
    const developmentNote = document.createElement('p');
    developmentNote.className = 'map-development-note';
    developmentNote.textContent = 'V = devastirano; po uredbi podgrupa IV';
    mapLegend.append(developmentNote);
    const textureCaption = document.createElement('p');
    textureCaption.className = 'map-legend-label';
    mapLegend.prepend(textureCaption);
    const regionTitle = document.createElement('li');
    regionTitle.className = 'map-region-title';
    regionTitle.textContent = 'Boja · Regija';
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
      button.addEventListener('pointerleave', () => showMapValues(getSelectedEntry()));
      button.addEventListener('focus', () => {
        if (isVisible(entry.id)) showMapValues(entry);
      });
      button.addEventListener('blur', () => showMapValues(getSelectedEntry()));
      specialMapControls.append(button);
      specialMapButtons.set(entry.id, button);
    }

    function matrixCellsFor(target) {
      const kind = target.dataset.filterKind;
      const row = Number(target.dataset.filterRow);
      const column = Number(target.dataset.filterColumn);
      if (kind === 'row') return [0, 1, 2].map(index => row + ':' + index);
      if (kind === 'column') return [0, 1, 2].map(index => index + ':' + column);
      return [row + ':' + column];
    }
    function updateMatrixFilterSelection() {
      for (const table of [colorMatrix, developmentLegend]) {
        table.querySelector('.map-legend-clear').hidden = !state.matrixSelection.size;
        for (const target of table.querySelectorAll('[data-filter-kind]')) {
          const kind = target.dataset.filterKind;
          const active = matrixCellsFor(target).every(cell => state.matrixSelection.has(cell));
          target.classList.toggle('is-filter-active', kind === 'cell' && Boolean(active));
          target.setAttribute('aria-pressed', String(Boolean(active)));
          target.setAttribute('role', 'button');
          target.tabIndex = 0;
        }
      }
    }
    function toggleMatrixFilter(target, additive = false) {
      const cells = matrixCellsFor(target);
      const allSelected = cells.every(cell => state.matrixSelection.has(cell));
      if (additive) {
        for (const cell of cells) {
          if (allSelected) state.matrixSelection.delete(cell);
          else state.matrixSelection.add(cell);
        }
      } else state.matrixSelection = state.matrixSelection.size === cells.length && allSelected
        ? new Set() : new Set(cells);
      updateMatrixFilterSelection();
      refreshVisuals();
      if (syncVisualFilters.checked) renderTable();
    }
    for (const table of [colorMatrix, developmentLegend]) {
      table.addEventListener('click', event => {
        const target = event.target.closest('[data-filter-kind]');
        if (target && table.contains(target)) toggleMatrixFilter(target, event.ctrlKey || event.metaKey);
      });
      table.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target.closest('[data-filter-kind]');
        if (!target || !table.contains(target)) return;
        event.preventDefault();
        toggleMatrixFilter(target, event.ctrlKey || event.metaKey);
      });
    }

    function updateMapMetrics() {
      state.matrixSelection = new Set();
      updateMatrixFilterSelection();
      const color = mapColor.value;
      mapColor.closest('.map-panel').classList.toggle('is-normalized-difference', color === 'differencePer1000');
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
      if (color !== 'region') colorCaptionText.textContent = 'Boja · ' + metricLabel(color);
      textureCaption.textContent = mapLegendLabel(texture);
      const headings = colorMatrix.querySelectorAll('thead th');
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
          const range = document.createElement('span');
          range.className = 'map-density-range';
          range.append(...row.childNodes);
          const dots = document.createElement('span');
          dots.className = 'map-density-swatch';
          dots.style.setProperty('--dot-spacing', [11, 7, 4][2 - index] + 'px');
          dots.setAttribute('aria-hidden', 'true');
          row.append(range, dots);
        }
        developmentLegend.querySelectorAll('tbody tr')[index].querySelectorAll('td').forEach((cell, columnIndex) => {
          cell.setAttribute('aria-label', 'Stepen razvijenosti ' + developmentHeadRow.children[columnIndex + 1].textContent + '; ' + metricLabel(texture) + ': ' + label);
        });
      });
      if (!colorMatrix.hidden) {
        colorMatrix.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
          row.querySelectorAll('td').forEach((cell, columnIndex) => {
            const description = 'Boja opštine · ' + metricLabel(color) + ': ' + colorRanges[columnIndex]
              + '\nGustina tačaka · ' + metricLabel(texture) + ': ' + textureRanges[rowIndex];
            cell.setAttribute('aria-label', description.replace('\n', '; '));
            cell.tabIndex = 0;
          });
        });
      }
      hideTooltip();
      updateMapReadout(getSelectedEntry());
      refreshVisuals();
      if (syncVisualFilters.checked) renderTable();
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

    return {mapLegend, regionLegend, developmentColumns, specialMapButtons,
      updateMapMetrics, updateLegendSelection};
  };
})();
