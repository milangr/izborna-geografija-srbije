(() => {
  'use strict';
  window.createMetricReadout = ({metrics, regions, metricValue, metricLabel, xyReferences, metricDistributions, summedMetrics, isDifference, signed, state}) => {
    const get = id => document.getElementById(id);
    function showPlotValues(readout, entry, controls, regionSummary = false) {
      const scope = readout.closest('.panel').querySelector('.readout-scope');
      const scopeText = !entry ? 'Nema podataka' : regionSummary
        ? entry.summaryLabel + (state.visualFilter ? ' · filtrirani zbir' : ' · zbir')
        : entry.name + (entry.special ? ' · zbirna jedinica' : ' · opština');
      scope.textContent = scopeText;
      scope.title = scopeText;
      const cacheKey = [entry?.id || '', state.distributionRevision, regionSummary,
        ...controls.map(id => get(id).value),
        ...(regionSummary ? controls.map(id => entry?.[get(id).value]) : [])].join('|');
      if (readout.dataset.values === cacheKey) return;
      readout.dataset.values = cacheKey;
      if (activeMiniBox && readout.contains(activeMiniBox)) hideMiniBoxTooltip();
      for (const id of controls) {
        const key = get(id).value;
        const result = get(id + '-value');
        const visual = get(id + '-visual');
        const value = document.createElement('strong');
        value.textContent = entry ? (key === 'region' ? entry.summaryLabel || regions[entry.region]
          : regionSummary && metrics[key].categorical ? 'po grupama' : metricValue(entry, key)) : '-';
        result.replaceChildren(value);
        visual.replaceChildren();
        if (key !== 'region') appendMiniBox(result, visual, key, entry, id.startsWith('scatter-'), regionSummary);
        result.title = result.textContent;
      }
    }

    const miniBoxTooltip = document.createElement('div');
    miniBoxTooltip.id = 'metric-box-tooltip';
    miniBoxTooltip.className = 'metric-box-tooltip';
    miniBoxTooltip.setAttribute('role', 'tooltip');
    miniBoxTooltip.hidden = true;
    document.body.append(miniBoxTooltip);
    let activeMiniBox = null;
    function hideMiniBoxTooltip() {
      if (activeMiniBox) activeMiniBox.removeAttribute('aria-describedby');
      activeMiniBox = null;
      miniBoxTooltip.hidden = true;
    }
    function positionMiniBoxTooltip(box) {
      const anchor = box.getBoundingClientRect();
      const tooltipWidth = miniBoxTooltip.offsetWidth;
      const tooltipHeight = miniBoxTooltip.offsetHeight;
      miniBoxTooltip.style.left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - tooltipWidth / 2,
        window.innerWidth - tooltipWidth - 12)) + 'px';
      miniBoxTooltip.style.top = (anchor.bottom + tooltipHeight + 8 <= window.innerHeight
        ? anchor.bottom + 8 : Math.max(8, anchor.top - tooltipHeight - 8)) + 'px';
    }
    function showMiniBoxTooltip(box, rows) {
      if (activeMiniBox && activeMiniBox !== box) activeMiniBox.removeAttribute('aria-describedby');
      activeMiniBox = box;
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const header = document.createElement('tr');
      for (const text of ['Opis', 'Vrijednost']) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = text;
        header.append(cell);
      }
      thead.append(header);
      const tbody = document.createElement('tbody');
      for (const [description, amount] of rows) {
        const row = document.createElement('tr');
        const labelCell = document.createElement('th');
        labelCell.scope = 'row';
        labelCell.textContent = description;
        const valueCell = document.createElement('td');
        valueCell.textContent = amount;
        row.append(labelCell, valueCell);
        tbody.append(row);
      }
      table.append(thead, tbody);
      miniBoxTooltip.replaceChildren(table);
      miniBoxTooltip.hidden = false;
      box.setAttribute('aria-describedby', miniBoxTooltip.id);
      positionMiniBoxTooltip(box);
    }
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && activeMiniBox) hideMiniBoxTooltip();
    });
    const updateMiniBoxTooltipPosition = () => {
      if (!activeMiniBox) return;
      if (!activeMiniBox.isConnected) hideMiniBoxTooltip();
      else positionMiniBoxTooltip(activeMiniBox);
    };
    window.addEventListener('scroll', updateMiniBoxTooltipPosition, {passive: true});
    window.addEventListener('resize', updateMiniBoxTooltipPosition);

    function appendMiniBox(value, visual, key, entry, xy = false, regionSummary = false) {
      if (metrics[key].categorical || !entry || !Number.isFinite(entry[key])) return;
      const reference = xyReferences[key];
      const distribution = metricDistributions[key];
      if (!distribution) return;
      const {q1, median, mean, q3, whiskerLow, whiskerHigh, below, above} = distribution;
      const current = entry[key];
      const showCurrent = !regionSummary || !summedMetrics.has(key);
      let low = whiskerLow, high = whiskerHigh;
      const padding = (high - low || Math.abs(high) || 1) * .04;
      low -= padding;
      high += padding;
      const position = amount => 100 * (amount - low) / (high - low);
      const miniBox = document.createElement('span');
      miniBox.className = 'metric-mini-box';
      miniBox.classList.toggle('is-distribution-only', !showCurrent);
      miniBox.setAttribute('role', 'img');
      const formatted = amount => metricValue({[key]: amount}, key);
      const rows = [
        ['Q1', formatted(q1)],
        ['Medijana', formatted(median)],
        ['Prosjek', formatted(mean)],
        ['Q3', formatted(q3)],
      ];
      miniBox.setAttribute('aria-label', metricLabel(key) + '. ' + rows.map(([label, amount]) =>
        label + ': ' + amount).join('. '));
      miniBox.tabIndex = 0;
      miniBox.addEventListener('pointerenter', () => showMiniBoxTooltip(miniBox, rows));
      miniBox.addEventListener('pointerleave', () => {
        if (activeMiniBox === miniBox && document.activeElement !== miniBox) hideMiniBoxTooltip();
      });
      miniBox.addEventListener('focus', () => showMiniBoxTooltip(miniBox, rows));
      miniBox.addEventListener('blur', () => {
        if (activeMiniBox === miniBox) hideMiniBoxTooltip();
      });
      const addMark = (className, left, width) => {
        const mark = document.createElement('span');
        mark.className = className;
        mark.style.left = left + '%';
        if (width != null) mark.style.width = width + '%';
        miniBox.append(mark);
        return mark;
      };
      addMark('metric-mini-whisker', position(whiskerLow), position(whiskerHigh) - position(whiskerLow));
      addMark('metric-mini-cap', position(whiskerLow));
      addMark('metric-mini-cap', position(whiskerHigh));
      addMark('metric-mini-iqr', position(q1), position(q3) - position(q1));
      addMark('metric-mini-median', position(median));
      const clippedMean = Math.max(whiskerLow, Math.min(mean, whiskerHigh));
      addMark('metric-mini-mean', position(clippedMean)).classList.toggle('is-outside', clippedMean !== mean);
      if (below) addMark('metric-mini-outliers', position(whiskerLow));
      if (above) addMark('metric-mini-outliers', position(whiskerHigh));
      if (showCurrent) {
        const clipped = Math.max(whiskerLow, Math.min(current, whiskerHigh));
        const marker = addMark('metric-mini-current', position(clipped));
        marker.classList.toggle('is-outside', clipped !== current);
      }
      const note = document.createElement('span');
      note.className = 'plot-benchmark';
      note.title = 'Klasična medijana vidljivih opština i gradova sa dostupnim podacima: svaka jedinica ima jednaku težinu.\nPosebne zbirne jedinice nisu uključene.';
      if (Number.isFinite(reference)) {
        const shortLabel = 'Med.';
        note.textContent = shortLabel + ' ' + metricValue({[key]: reference}, key);
        const percentage = metrics[key].unit === '%';
        if (!isDifference(key) && reference !== 0 && current !== reference) {
          const difference = percentage ? current - reference : 100 * (current - reference) / Math.abs(reference);
          note.title += '\nOdstupanje: ' + signed.format(difference) + (percentage ? ' p. p.' : '%') + '.';
        }
      }
      visual.append(miniBox);
      value.append(note);
    }
    return {showPlotValues};
  };
})();
