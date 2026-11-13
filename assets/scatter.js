(() => {
  'use strict';
  window.createScatter = ({model, formatting, view, interaction}) => {
    const {data, mappedSpecialResults, byId, metrics, regions, selectedRegions, developmentLabels, xyReferences} = model;
    const {metricLabel, legendMetricLabel, metricValue, isDifference, percent, number, wageEur, metricClass, rangeLabels, xyReferenceLabel} = formatting;
    const {metricSelect, showPlotValues, summarizeSelectedRegions, isChartVisible} = view;
    const {touchPair, wheelScale, onChoose, onHover} = interaction;
    const {describeDistribution} = window.electionCalculations;
    const get = id => document.getElementById(id);
    const stage = document.querySelector('.scatter-stage');
    const svg = stage.querySelector('svg');
    const tip = stage.querySelector('.map-tooltip');
    const readout = document.querySelector('.scatter-panel .metric-controls');
    const legend = document.querySelector('.scatter-regions');
    const xControl = metricSelect('scatter-x', 'differencePer1000');
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
    const boxClip = svgNode('clipPath', {id: 'scatter-box-clip'}, defs);
    const boxClipRect = svgNode('rect', {}, boxClip);
    const axes = svgNode('g', {'aria-hidden': 'true'}, svg);
    const marks = svgNode('g', {'aria-hidden': 'true', 'clip-path': 'url(#scatter-plot-clip)'}, svg);
    const points = new Map();
    const plotData = [...data, ...mappedSpecialResults];
    const sizeLegend = document.querySelector('.scatter-legend');
    const sizeLabel = get('scatter-size-label');
    let highlighted = null;
    let hoveredPoint = null;
    let hoveredEntry = null;
    let currentEntry;
    let plot;

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
          format: value => Math.round(value) === 5 ? 'V' : developmentLabels[Math.round(value)] || '-'};
      }
      const values = plotData.filter(entry => isChartVisible(entry.id) && hasPlotValue(entry))
        .map(entry => entry[key]).sort((a, b) => a - b);
      const isPercent = metrics[key].unit === '%';
      let lower = values.length ? values[0] : 0;
      let upper = values.length ? values.at(-1) : 1;
      const roughStep = (upper - lower) / tickCount || 1;
      const step = key === 'votes' || key === 'snsShare' || key === 'turnout'
        ? (tickCount < 5 ? 20 : 10)
        : niceStep(roughStep);
      const padding = (upper - lower || step) * .04;
      const min = isDifference(key)
        ? Math.floor((lower - padding) / step) * step
        : Math.max(0, Math.floor((lower - padding) / step) * step);
      const max = Math.max(min + step, Math.ceil((upper + padding) / step) * step);
      const span = max - min;
      const visibleMin = min + start * span;
      const visibleSpan = span / scale;
      const tickStep = scale === 1 ? step : niceStep(visibleSpan / tickCount);
      const magnitude = Math.max(Math.abs(visibleMin), Math.abs(visibleMin + visibleSpan));
      const divisor = isPercent || metrics[key].normalized ? 1
        : magnitude >= 1e9 ? 1e9 : magnitude >= 1e6 ? 1e6 : magnitude >= 1000 ? 1000 : 1;
      const unit = divisor === 1e9 ? 'mlrd.' : divisor === 1e6 ? 'mil.' : divisor === 1000 ? 'hilj.' : '';
      return {min: visibleMin, max: visibleMin + visibleSpan, step: tickStep,
        unit, format: isPercent ? percent : value => number.format(value / divisor)};
    }

    function draw() {
      const axisEntry = hoveredEntry || currentEntry;
      const w = svg.clientWidth;
      const h = svg.clientHeight;
      if (!w || !h) return;
      svg.classList.toggle('is-zoomed', viewport.chartScaleX > 1 || viewport.chartScaleY > 1);
      const xKey = xControl.value, yKey = yControl.value;
      const hasYBox = !metrics[yKey].categorical;
      const right = w - (hasYBox ? 50 : 24), top = hasYBox ? 32 : 23, bottom = h - 53;
      const xAxis = axis(xKey, w < 530 ? 4 : 7, viewport.chartLeft, viewport.chartScaleX);
      const yAxis = axis(yKey, 6, 1 - viewport.chartTop - 1 / viewport.chartScaleY, viewport.chartScaleY);
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
      for (const [key, value] of Object.entries({x: right + 9, y: top, width: 34, height: bottom - top})) boxClipRect.setAttribute(key, value);
      for (const [bounds, values] of [[zoom.x, xAxis], [zoom.y, yAxis]]) {
        bounds.min.title = values.format(values.min) + (values.unit ? ' ' + values.unit : '');
        bounds.max.title = values.format(values.max) + (values.unit ? ' ' + values.unit : '');
        bounds.min.setAttribute('aria-valuetext', bounds.min.title);
        bounds.max.setAttribute('aria-valuetext', bounds.max.title);
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
      if (hasYBox) {
        const values = plotData.filter(entry => !entry.special && isChartVisible(entry.id) && hasPlotValue(entry))
          .map(entry => entry[yKey]).sort((a, b) => a - b);
        const distribution = describeDistribution(values);
        if (distribution) {
          const {min, q1, median, mean, q3, max, whiskerLow, whiskerHigh, below, above} = distribution;
          const box = svgNode('g', {class: 'scatter-box', 'clip-path': 'url(#scatter-box-clip)'}, axes);
          svgNode('title', {}, box, [
            `${metricLabel(yKey)} · ${values.length} opština`,
            `Minimum: ${metricValue({[yKey]: min}, yKey)}`,
            `Donji brk: ${metricValue({[yKey]: whiskerLow}, yKey)}`,
            `Q1: ${metricValue({[yKey]: q1}, yKey)}`,
            `Medijana: ${metricValue({[yKey]: median}, yKey)}`,
            `Q3: ${metricValue({[yKey]: q3}, yKey)}`,
            `Gornji brk: ${metricValue({[yKey]: whiskerHigh}, yKey)}`,
            `Maksimum: ${metricValue({[yKey]: max}, yKey)}`,
            `Izvan brkova: ${below} ispod, ${above} iznad`,
          ].join('\n'));
          const boxX = right + 24;
          svgNode('line', {x1: boxX, x2: boxX, y1: y(whiskerHigh), y2: y(whiskerLow), class: 'scatter-box-whisker'}, box);
          for (const value of [whiskerLow, whiskerHigh]) svgNode('line', {x1: boxX - 5, x2: boxX + 5, y1: y(value), y2: y(value), class: 'scatter-box-whisker'}, box);
          if (below) svgNode('circle', {cx: boxX, cy: y(min), r: 3, class: 'scatter-box-outlier'}, box);
          if (above) svgNode('circle', {cx: boxX, cy: y(max), r: 3, class: 'scatter-box-outlier'}, box);
          svgNode('rect', {x: boxX - 8, y: y(q3), width: 16, height: Math.max(1, y(q1) - y(q3)), class: 'scatter-box-range'}, box);
          svgNode('line', {x1: boxX - 8, x2: boxX + 8, y1: y(median), y2: y(median), class: 'scatter-box-median'}, box);
          const meanMark = svgNode('path', {d: `M ${boxX} ${y(mean) - 7} l 7 7 -7 7 -7 -7 Z`, class: 'scatter-box-mean region-box-mean'}, box);
          svgNode('title', {}, meanMark, `Prosjek opština: ${metricValue({[yKey]: mean}, yKey)}`);
          if (axisEntry && isChartVisible(axisEntry.id) && Number.isFinite(axisEntry[yKey]) &&
              axisEntry[yKey] >= yAxis.min && axisEntry[yKey] <= yAxis.max) {
            const position = y(axisEntry[yKey]);
            const marker = svgNode('g', {class: 'scatter-box-selected'}, box);
            const dot = points.get(axisEntry.id);
            if (dot) marker.style.setProperty('--selected-color', getComputedStyle(dot).fill);
            svgNode('title', {}, marker, `${axisEntry.name}: ${metricValue(axisEntry, yKey)}.\nMedijana: ${metricValue({[yKey]: median}, yKey)}; prosjek: ${metricValue({[yKey]: mean}, yKey)}.`);
            svgNode('line', {x1: boxX - 9, x2: boxX + 9, y1: position, y2: position}, marker);
            svgNode('path', {d: `M ${boxX + 14} ${position - 5} L ${boxX + 14} ${position + 5} L ${boxX + 8} ${position} Z`}, marker);
          }
        }
      }
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
      if (xKey === 'differencePer1000' && xAxis.min <= 0 && xAxis.max >= 0) {
        line(x(0), top, x(0), bottom, 'scatter-zero');
      }
      if (yKey === 'differencePer1000' && yAxis.min <= 0 && yAxis.max >= 0) {
        line(left, y(0), right, y(0), 'scatter-zero');
      }
      if (['votes', 'snsShare'].includes(xKey) && xAxis.min <= 50 && xAxis.max >= 50) line(x(50), top, x(50), bottom, 'scatter-reference');
      if (['votes', 'snsShare'].includes(yKey) && yAxis.min <= 50 && yAxis.max >= 50) line(left, y(50), right, y(50), 'scatter-reference');
      const averageX = xyReferences[xKey];
      if (xKey === 'differencePer1000' && Number.isFinite(averageX) && averageX >= xAxis.min && averageX <= xAxis.max) {
        const position = x(averageX);
        line(position, top, position, bottom, 'scatter-average');
        text(position + (position > (left + right) / 2 ? -5 : 5), top + 12,
          xyReferenceLabel(xKey) + ': ' + metricValue({[xKey]: averageX}, xKey),
          {'text-anchor': position > (left + right) / 2 ? 'end' : 'start', class: 'scatter-average-label'});
      }
      text((left + right) / 2, h - 12, metricLabel(xKey) + (xAxis.unit ? ` (${xAxis.unit})` : ''), {'text-anchor': 'middle', class: 'axis-title'});
      const midY = (top + bottom) / 2;
      text(16, midY, metricLabel(yKey) + (yAxis.unit ? ` (${yAxis.unit})` : ''), {transform: 'rotate(-90 16 ' + midY + ')', 'text-anchor': 'middle', class: 'axis-title'});
      for (const entry of plotData) {
        const dot = points.get(entry.id);
        dot.setAttribute('cx', Number.isFinite(entry[xKey])
          ? x(entry[xKey] + (metrics[xKey].categorical ? categoryOffset(entry, 13) : 0)) : -10000);
        dot.setAttribute('cy', Number.isFinite(entry[yKey])
          ? y(entry[yKey] + (metrics[yKey].categorical ? categoryOffset(entry, 97) : 0)) : -10000);
      }
      if (axisEntry && isChartVisible(axisEntry.id)) {
        for (const [dimension, key, scale, position] of [
          ['x', xKey, xAxis, x], ['y', yKey, yAxis, y],
        ]) {
          const value = axisEntry[key];
          if (!Number.isFinite(value) || value < scale.min || value > scale.max) continue;
          const marker = svgNode('g', {class: 'selected-axis-marker', 'data-axis': dimension}, axes);
          svgNode('title', {}, marker, `${axisEntry.name}: ${metricValue(axisEntry, key)}`);
          const p = position(value);
          svgNode('path', {d: dimension === 'x'
            ? `M ${p} ${bottom} l -5 8 h 10 Z`
            : `M ${left} ${p} l -8 -5 v 10 Z`}, marker);
          const label = svgNode('text', {x: dimension === 'x' ? p : left - 11,
            y: dimension === 'x' ? bottom + 22 : p + 4,
            'text-anchor': dimension === 'x' ? 'middle' : 'end'}, marker, scale.format(value));
          const box = label.getBBox();
          const background = svgNode('rect', {x: box.x - 2, y: box.y - 1,
            width: box.width + 4, height: box.height + 2, rx: 2}, marker);
          marker.insertBefore(background, label);
        }
      }
    }

    const viewport = window.createScatterViewport({svg, zoom, touchPair, wheelScale,
      getPlot: () => plot, draw, hideTooltip: hideScatterTooltip});

    function select(entry, redraw = true) {
      currentEntry = entry;
      highlighted?.classList.remove('is-selected');
      highlighted = points.get(entry?.id);
      highlighted?.classList.add('is-selected');
      if (highlighted) marks.append(highlighted);
      showScatterValues(entry);
      if (redraw) {
        draw();
        if (highlighted && !highlighted.classList.contains('is-filtered'))
          viewport.revealPoint(highlighted.cx.baseVal.value, highlighted.cy.baseVal.value);
      }
    }

    function showScatterValues(entry) {
      sizeLegend.querySelector('.scatter-size-selected')?.remove();
      if (entry) {
        const dot = points.get(entry.id);
        const item = document.createElement('span');
        item.className = 'scatter-size scatter-size-selected';
        const sample = document.createElement('i');
        sample.style.setProperty('--diameter', 2 * Number(dot?.getAttribute('r') || 0) + 'px');
        if (dot) sample.style.background = getComputedStyle(dot).fill;
        const label = document.createElement('span');
        label.textContent = metricValue(entry, sizeControl.value);
        item.append(sample, label);
        item.title = `${entry.name} · ${metricLabel(sizeControl.value)}: ${label.textContent}`;
        const references = [...sizeLegend.children].map(item => Number(item.dataset.value));
        const value = entry[sizeControl.value];
        let position = .5;
        if (Number.isFinite(value) && references.length === 3) {
          const interval = value <= references[1] ? 0 : 1;
          const span = references[interval + 1] - references[interval];
          const fraction = span ? Math.max(0, Math.min(1, (value - references[interval]) / span)) : .5;
          position = 1 / 6 + (interval + fraction) / 3;
        }
        item.style.left = (position * 100) + '%';
        sizeLegend.append(item);
      }
      const summary = !entry ? summarizeSelectedRegions() : null;
      showPlotValues(readout, entry || summary,
        ['scatter-x', 'scatter-y', 'scatter-size', 'scatter-color'], Boolean(summary));
    }

    function hover(entry) {
      const nextPoint = points.get(entry?.id);
      if (hoveredPoint === nextPoint) return;
      hoveredPoint?.classList.remove('is-hovered');
      hoveredPoint = nextPoint;
      hoveredEntry = nextPoint ? entry : null;
      hoveredPoint?.classList.add('is-hovered');
      if (hoveredPoint) marks.append(hoveredPoint);
      else if (highlighted) marks.append(highlighted);
      showScatterValues(hoveredEntry || currentEntry);
      draw();
    }

    function hideScatterTooltip() {
      tip.hidden = true;
      onHover(null);
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
        title.textContent = 'Boja · Regija';
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
        title.textContent = 'Boja · ' + legendMetricLabel(colorKey);
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
        title.textContent = 'Boja · ' + legendMetricLabel(colorKey);
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
        item.dataset.value = value;
        const sample = document.createElement('i');
        sample.setAttribute('aria-hidden', 'true');
        sample.style.setProperty('--diameter', 2 * radius(value) + 'px');
        item.append(sample, metrics[sizeKey].unit === '%' ? percent(value)
          : sizeKey === 'averageNetWage2025' ? wageEur(value) : number.format(value));
        sizeLegend.append(item);
      }
      const xKey = xControl.value, yKey = yControl.value;
      get('scatter-description').textContent = 'X osa: ' + metricLabel(xKey) + '. Y osa: ' + metricLabel(yKey) +
        '. Veličina: ' + metricLabel(sizeKey) + '. Boja: ' + (colorKey === 'region' ? 'regija' : metricLabel(colorKey)) +
        '.' +
        ' Izaberi krug za tačne vrijednosti opštine, Inostranstva ili Kaznenih zavoda.';
      tip.hidden = true;
      select(currentEntry, false);
      applyFilter();
    }

    function entryAt(event) {
      const direct = byId.get(event.target.dataset.unitId);
      if (direct && isChartVisible(direct.id) && hasPlotValue(direct)) return direct;
      const point = viewport.plotPoint(event);
      if (!point) return null;
      let nearest;
      let distance = 6;
      for (const [id, dot] of points) {
        if (!isChartVisible(id) || !hasPlotValue(byId.get(id))) continue;
        const gap = Math.hypot(dot.cx.baseVal.value - point.x, dot.cy.baseVal.value - point.y);
        if (gap < distance) {
          nearest = byId.get(id);
          distance = gap;
        }
      }
      return nearest;
    }

    svg.addEventListener('pointermove', event => {
      if (viewport.dragChart(event)) return;
      const entry = entryAt(event);
      if (!entry || event.pointerType === 'touch') {
        hideScatterTooltip();
        return;
      }
      tip.hidden = false;
      tip.textContent = entry.name;
      onHover(entry);
      const bounds = stage.getBoundingClientRect();
      const left = Math.max(6, Math.min(event.clientX - bounds.left + 12, bounds.width - tip.offsetWidth - 6));
      const above = event.clientY - bounds.top - tip.offsetHeight - 10;
      tip.style.left = left + 'px';
      tip.style.top = (above > 6 ? above : event.clientY - bounds.top + 16) + 'px';
    });
    svg.addEventListener('pointerleave', hideScatterTooltip);
    svg.addEventListener('click', event => {
      if (viewport.consumeClick()) return;
      const entry = entryAt(event);
      onChoose(entry);
      if (!entry) hideScatterTooltip();
    });
    for (const control of [xControl, yControl, sizeControl, colorControl]) {
      control.addEventListener('change', () => {
        if (control === xControl || control === yControl) viewport.resetView();
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
      let visibilityChanged = false;
      for (const [id, dot] of points) {
        const filtered = !isChartVisible(id) || !hasPlotValue(byId.get(id));
        if (dot.classList.contains('is-filtered') !== filtered) visibilityChanged = true;
        dot.classList.toggle('is-filtered', filtered);
      }
      if (visibilityChanged) viewport.resetView();
      draw();
      hideScatterTooltip();
    }
    return {select, hover, refresh: updateMetrics,
      refreshReadout: () => showScatterValues(currentEntry)};
  };
})();
