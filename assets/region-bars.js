(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  const svgNode = (tag, attrs = {}) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const roundedReference = value => {
    if (!value) return 0;
    const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1);
    return Math.round(value / step) * step;
  };
  window.createRegionBars = ({entries, regions, shortRegions, selectedRegions, metrics, metricLabel, metricValue, number, totalValues, isVisible, onChoose, onHover}) => {
    const {describeDistribution} = window.electionCalculations;
    const select = document.getElementById('region-box-y');
    const sizeSelect = document.getElementById('region-box-size');
    const sizeLegend = document.getElementById('region-box-size-legend');
    const grid = document.getElementById('region-bars-grid');
    const scopeLabel = document.getElementById('region-bars-scope');
    const tooltip = document.createElement('div');
    tooltip.className = 'region-box-tooltip';
    tooltip.hidden = true;
    document.body.append(tooltip);
    const compact = new Intl.NumberFormat('sr-Latn-RS', {notation: 'compact', maximumFractionDigits: 1});
    const placeTooltip = (x, y) => {
      tooltip.style.left = Math.min(x + 12, innerWidth - tooltip.offsetWidth - 12) + 'px';
      tooltip.style.top = Math.max(8, Math.min(y - tooltip.offsetHeight - 10, innerHeight - tooltip.offsetHeight - 8)) + 'px';
    };
    const hideTooltip = () => { tooltip.hidden = true; };
    const colors = ['#7643ac', '#176ca7', '#087859', '#b54c13', '#8b5d72', '#68798a'];
    const displayedRegions = Object.entries(regions);
    const displayedCodes = new Set(displayedRegions.map(([code]) => code));
    const refreshRegionSelection = () => {
      const hasSubset = selectedRegions.size < displayedCodes.size;
      for (const column of grid.querySelectorAll('.region-bars-column')) {
        column.classList.toggle('is-region-selected', hasSubset && selectedRegions.has(column.dataset.region));
      }
    };
    let displayedEntries = entries.filter(entry => displayedCodes.has(entry.region) && isVisible(entry.id));
    let plottedEntries = displayedEntries.filter(entry => entry.region !== 'OTHER');
    let selectedEntry = null;
    let hoveredEntry = null;
    let pointById = new Map();
    let xGuides = new Map();
    let legendReferences = [];
    let updateSelectedY = () => {};
    const fitColumns = () => {
      for (const svg of grid.querySelectorAll('.region-box-plot, .region-box-x-axis')) {
        const width = svg.getBoundingClientRect().width;
        if (!width) continue;
        svg.setAttribute('preserveAspectRatio', 'none');
        const factor = 180 / width;
        for (const dot of svg.querySelectorAll('.region-box-point')) {
          const cx = Number(dot.getAttribute('cx'));
          dot.setAttribute('transform', `translate(${cx} 0) scale(${factor} 1) translate(${-cx} 0)`);
        }
        for (const text of svg.querySelectorAll('.region-box-x-tick')) {
          const x = Number(text.getAttribute('x'));
          text.style.fontSize = '9px';
          text.setAttribute('transform', `translate(${x} 0) scale(${factor} 1) translate(${-x} 0)`);
        }
        if (svg.classList.contains('region-box-plot') && svg.closest('[data-region="OTHER"]')) {
          svg.querySelector('.region-box-empty')?.setAttribute('transform', `translate(90 180) scale(${factor} 1) rotate(-90) translate(-90 -180)`);
        }
      }
    };
    const updateCurrent = () => {
      const entry = hoveredEntry || selectedEntry;
      sizeLegend.querySelector('.region-box-selected-example')?.remove();
      const currentDot = pointById.get(entry?.id);
      const currentSize = entry?.[sizeSelect.value];
      if (currentDot && Number.isFinite(currentSize) && legendReferences.length) {
        const sample = document.createElement('span');
        sample.className = 'region-box-size-example region-box-selected-example';
        sample.style.setProperty('--point-diameter', 2 * Number(currentDot.getAttribute('r')) + 'px');
        sample.style.setProperty('--point-color', getComputedStyle(currentDot).fill);
        let position = .5;
        if (legendReferences.length === 3) {
          const interval = currentSize <= legendReferences[1] ? 0 : 1;
          const span = legendReferences[interval + 1] - legendReferences[interval];
          const fraction = span ? Math.max(0, Math.min(1, (currentSize - legendReferences[interval]) / span)) : .5;
          position = 1 / 6 + (interval + fraction) / 3;
        }
        sample.style.left = position * 100 + '%';
        const label = document.createElement('span');
        label.textContent = metricValue(entry, sizeSelect.value);
        sample.title = `${entry.name} · ${metricLabel(sizeSelect.value)}: ${label.textContent}`;
        sample.append(label);
        sizeLegend.append(sample);
      }
      scopeLabel.textContent = entry ? `${entry.name} · ${entry.region === 'OTHER' ? 'zbirna jedinica' : 'opština'}`
        : !displayedEntries.length ? 'Nema podataka' : displayedEntries.length === entries.length ? 'Sve regije · ukupno' : 'Prikazane jedinice · ukupno';
      scopeLabel.title = scopeLabel.textContent;
      for (const [id, dot] of pointById) {
        dot.classList.toggle('is-selected', id === selectedEntry?.id);
        dot.classList.toggle('is-hovered', id === hoveredEntry?.id);
      }
      const axisEntry = selectedEntry;
      for (const [code, guide] of xGuides) {
        const visible = axisEntry?.region === code && pointById.has(axisEntry.id) && Number.isFinite(axisEntry[sizeSelect.value]);
        guide.marker.setAttribute('visibility', visible ? 'visible' : 'hidden');
        if (visible) {
          guide.marker.setAttribute('transform', `translate(${guide.x(axisEntry[sizeSelect.value])} 0)`);
          guide.label.textContent = guide.format(axisEntry[sizeSelect.value]);
          guide.title.textContent = `${axisEntry.name}: ${metricValue(axisEntry, sizeSelect.value)}`;
        }
      }
      updateSelectedY();
    };
    let axisGuide = null;
    const hideGuide = () => {
      axisGuide?.setAttribute('visibility', 'hidden');
    };
    const axis = document.createElement('div');
    axis.className = 'region-bars-axis';
    const axisHeader = document.createElement('div');
    axisHeader.className = 'region-bars-axis-header';
    const yCaptionTitle = document.createElement('strong');
    yCaptionTitle.textContent = 'Y osa';
    const yCaptionValue = document.createElement('span');
    axisHeader.append(yCaptionTitle, yCaptionValue);
    const axisBody = document.createElement('div');
    axisBody.className = 'region-bars-axis-body';
    const viewport = window.createRegionViewport({axisBody, grid, hideGuide, onChange: () => render()});
    const axisSvg = svgNode('svg', {viewBox: '0 0 45 350', role: 'img'});
    axisBody.append(axisSvg);
    const axisFooter = document.createElement('div');
    axisFooter.className = 'region-bars-axis-footer';
    const xCaptionTitle = document.createElement('strong');
    xCaptionTitle.textContent = 'X osa';
    const xCaptionValue = document.createElement('span');
    axisFooter.append(xCaptionTitle, xCaptionValue);
    axis.append(axisHeader, axisBody, axisFooter);
    const xTotalCaption = document.createElement('div');
    xTotalCaption.className = 'region-box-x-total';
    xTotalCaption.textContent = 'Ukupno · X';
    axis.append(xTotalCaption);
    grid.append(axis);
    const render = () => {
      const key = select.value;
      const sizeKey = sizeSelect.value;
      const categorical = Boolean(metrics[key].categorical);
      grid.hidden = categorical;
      document.getElementById('region-bars-category-note').hidden = !categorical;
      if (categorical) return;
      yCaptionValue.textContent = metricLabel(key);
      axisHeader.title = `Y osa: ${metricLabel(key)}`;
      xCaptionValue.textContent = metricLabel(sizeKey);
      axisFooter.title = `X osa: ${metricLabel(sizeKey)}`;
      const all = plottedEntries.map(entry => entry[key]).filter(Number.isFinite);
      const sizeValues = plottedEntries.map(entry => entry[sizeKey]).filter(Number.isFinite);
      const xMagnitudeMax = Math.max(0, ...sizeValues.map(Math.abs));
      const xDivisor = metrics[sizeKey].normalized ? 1 : xMagnitudeMax >= 1e9 ? 1e9 : xMagnitudeMax >= 1e6 ? 1e6 : xMagnitudeMax >= 1000 ? 1000 : 1;
      const xUnit = xDivisor === 1e9 ? 'mlrd.' : xDivisor === 1e6 ? 'mil.' : xDivisor === 1000 ? 'hilj.' : '';
      xCaptionTitle.textContent = xUnit ? `X osa (${xUnit})` : 'X osa';
      axisFooter.title = `X osa: ${metricLabel(sizeKey)}${xUnit ? ` · skala: ${xUnit}` : ''}`;
      const sizeMin = Math.min(...sizeValues);
      const sizeSpan = Math.max(...sizeValues) - sizeMin;
      const radius = entry => Number.isFinite(entry[sizeKey])
        ? 5.5 + 9.5 * Math.sqrt(sizeSpan ? Math.max(0, Math.min(1, (entry[sizeKey] - sizeMin) / sizeSpan)) : .5)
        : 5.5;
      sizeLegend.replaceChildren();
      sizeLegend.setAttribute('aria-label', `Veličina krugova: ${metricLabel(sizeKey)}`);
      sizeLegend.title = `${metricLabel(sizeKey)} · zajednička skala veličine krugova za sve regije`;
      const maxSize = sizeMin + sizeSpan;
      const base = maxSize > 0 ? 10 ** Math.floor(Math.log10(maxSize)) : 1;
      const high = maxSize > 0 ? [5, 2, 1].find(n => n * base <= maxSize) * base : 0;
      const references = sizeValues.length ? [...new Set(sizeKey === 'averageNetWage2025'
        ? [sizeMin, sizeMin + sizeSpan / 2, maxSize].map(roundedReference)
        : high >= 10000 ? [high / 100, high / 10, high] : [high / 10, high / 2, high])] : [];
      legendReferences = references;
      for (const value of references) {
        const example = document.createElement('span');
        example.className = 'region-box-size-example';
        example.style.setProperty('--point-diameter', 2 * radius({[sizeKey]: value}) + 'px');
        const label = document.createElement('span');
        label.textContent = metrics[sizeKey].unit === '%' ? number.format(value) + '%'
          : number.format(value) + (sizeKey === 'averageNetWage2025' ? ' €' : '');
        example.title = metricValue({[sizeKey]: value}, sizeKey);
        example.append(label);
        sizeLegend.append(example);
      }
      if (!references.length) sizeLegend.textContent = 'Nema podataka';
      pointById = new Map();
      xGuides = new Map();
      const min = all.length ? Math.min(...all) : 0;
      const max = all.length ? Math.max(...all) : 1;
      const roughStep = ((max - min) || Math.abs(max) || 1) / 4;
      const magnitude = 10 ** Math.floor(Math.log10(roughStep));
      const domainStep = [1, 2, 5, 10].find(factor => factor * magnitude >= roughStep) * magnitude;
      const domainMin = key === 'differencePer1000' ? Math.min(0, Math.floor(min / domainStep) * domainStep)
        : Math.floor(min / domainStep) * domainStep;
      const domainMax = key === 'differencePer1000' ? Math.max(0, domainMin + domainStep, Math.ceil(max / domainStep) * domainStep)
        : Math.max(domainMin + domainStep, Math.ceil(max / domainStep) * domainStep);
      const domainSpan = domainMax - domainMin;
      const visibleMin = domainMin + viewport.viewStart * domainSpan;
      const visibleMax = domainMin + viewport.viewEnd * domainSpan;
      const tickStep = 10 ** Math.floor(Math.log10((visibleMax - visibleMin) / 4));
      const ticks = [...new Set([
        Math.ceil(visibleMin / tickStep) * tickStep,
        Math.round((visibleMin + visibleMax) / 2 / tickStep) * tickStep,
        Math.floor(visibleMax / tickStep) * tickStep,
        ...(key === 'differencePer1000' && visibleMin <= 0 && visibleMax >= 0 ? [0] : []),
      ])].filter(value => value >= visibleMin - 1e-8 && value <= visibleMax + 1e-8).sort((a, b) => a - b);
      const y = value => 318 - (value - visibleMin) / (visibleMax - visibleMin) * 280;
      const format = value => number.format(value) + (metrics[key].unit === '%' ? '%' : '');
      const fragment = document.createDocumentFragment();
      axisSvg.setAttribute('aria-label', `Zajednička Y osa: ${metricLabel(key)}`);
      axisSvg.replaceChildren();
      const axisMagnitude = Math.max(Math.abs(visibleMin), Math.abs(visibleMax));
      const axisDivisor = metrics[key].normalized ? 1 : axisMagnitude >= 1e9 ? 1e9 : axisMagnitude >= 1e6 ? 1e6 : axisMagnitude >= 1000 ? 1000 : 1;
      const axisUnit = axisDivisor === 1e9 ? 'mlrd.' : axisDivisor === 1e6 ? 'mil.' : axisDivisor === 1000 ? 'hilj.' : metrics[key].unit === '%' ? '%' : '';
      yCaptionTitle.textContent = axisDivisor > 1 ? `Y osa (${axisUnit})` : 'Y osa';
      for (const tick of ticks) {
        const text = svgNode('text', {x: 40, y: y(tick) + 4,
          class: 'region-box-tick' + (key === 'differencePer1000' && tick === 0 ? ' is-zero-reference' : '')});
        text.textContent = number.format(tick / axisDivisor);
        axisSvg.append(text);
      }
      axisGuide = svgNode('g', {class: 'region-box-guide-label', visibility: 'hidden', 'aria-hidden': 'true'});
      axisGuide.append(svgNode('rect', {x: 0, y: -9, width: 44, height: 18, rx: 3}));
      const guideText = svgNode('text', {x: 40, y: 4});
      axisGuide.append(guideText);
      axisSvg.append(axisGuide);
      const selectedY = svgNode('g', {class: 'selected-axis-marker region-box-selected-y', visibility: 'hidden'});
      selectedY.append(svgNode('path', {d: 'M 44 0 L 37 -5 L 37 5 Z'}));
      selectedY.append(svgNode('rect', {x: 0, y: -9, width: 36, height: 18, rx: 2}));
      const selectedYLabel = svgNode('text', {x: 34, y: 4, 'text-anchor': 'end'});
      const selectedYTitle = svgNode('title');
      selectedY.append(selectedYLabel, selectedYTitle);
      axisSvg.append(selectedY);
      updateSelectedY = () => {
        const value = selectedEntry?.[key];
        const visible = selectedEntry && pointById.has(selectedEntry.id) && Number.isFinite(value) && value >= visibleMin && value <= visibleMax;
        selectedY.setAttribute('visibility', visible ? 'visible' : 'hidden');
        if (visible) {
          selectedY.setAttribute('transform', `translate(0 ${y(value)})`);
          selectedYLabel.textContent = number.format(value / axisDivisor);
          selectedYTitle.textContent = `${selectedEntry.name}: ${metricValue(selectedEntry, key)}`;
          selectedYLabel.removeAttribute('textLength');
          if (selectedYLabel.getComputedTextLength() > 33) {
            selectedYLabel.setAttribute('textLength', 33);
            selectedYLabel.setAttribute('lengthAdjust', 'spacingAndGlyphs');
          }
        }
      };
      const showGuide = (clientY, sourceSvg) => {
        const bounds = sourceSvg.getBoundingClientRect();
        const plotY = (clientY - bounds.top) / bounds.height * 350;
        if (plotY < 38 || plotY > 318) {
          hideGuide();
          return;
        }
        const value = visibleMax - (plotY - 38) / 280 * (visibleMax - visibleMin);
        guideText.textContent = number.format(value / axisDivisor);
        axisGuide.setAttribute('transform', `translate(0 ${plotY})`);
        axisGuide.setAttribute('visibility', 'visible');
      };
      viewport.updateSlider();
      displayedRegions.forEach(([code, label], regionIndex) => {
        const members = displayedEntries.filter(entry => entry.region === code);
        const valid = members.filter(entry => Number.isFinite(entry[key]));
        const sized = valid.map(entry => entry[sizeKey]).filter(Number.isFinite);
        const sizeLow = Math.min(...sized);
        const sizeHigh = Math.max(...sized);
        const xRough = sized.length ? ((sizeHigh - sizeLow) || Math.abs(sizeHigh) || 1) / 4 : 1;
        const xMagnitude = 10 ** Math.floor(Math.log10(xRough));
        const xStep = sized.length ? [1, 2, 5, 10].find(factor => factor * xMagnitude >= xRough) * xMagnitude : 1;
        const xLow = sized.length ? Math.floor(sizeLow / xStep) * xStep : 0;
        const xHigh = sized.length ? Math.max(xLow + xStep, Math.ceil(sizeHigh / xStep) * xStep) : 1;
        const x = value => 12 + 156 * (value - xLow) / (xHigh - xLow);
        const sorted = valid.map(entry => entry[key]).sort((a, b) => a - b);
        const column = document.createElement('section');
        column.className = 'region-bars-column';
        column.dataset.region = code;
        column.style.setProperty('--region-bar-color', colors[regionIndex]);
        const header = document.createElement('header');
        const title = document.createElement('h3');
        const regionButton = document.createElement('button');
        regionButton.type = 'button';
        regionButton.className = 'region-box-region-zoom';
        regionButton.textContent = shortRegions[code] || label;
        regionButton.title = `${label}: prilagodi Y osu opštinama ove regije`;
        regionButton.disabled = !valid.length || code === 'OTHER';
        if (code === 'OTHER') regionButton.title = 'Inostranstvo i kazneni zavodi · zbirne jedinice bez box plota';
        regionButton.addEventListener('click', () => {
          const low = sorted[0];
          const high = sorted.at(-1);
          const span = Math.min(domainSpan, Math.max(domainSpan * .05, (high - low) * 1.2));
          const start = Math.max(0, Math.min(domainSpan - span, (low + high - span) / 2 - domainMin));
          viewport.setWindow(start / domainSpan, (start + span) / domainSpan);
          grid.querySelector(`[data-region="${code}"] .region-box-region-zoom`)?.focus({preventScroll: true});
        });
        title.append(regionButton);
        header.append(title);
        const svg = svgNode('svg', {viewBox: '0 0 180 350', role: 'img', class: 'region-box-plot', 'aria-label': `${label}: raspodjela vrijednosti za ${metricLabel(key)}`});
        svg.classList.toggle('is-zoomed', viewport.viewEnd - viewport.viewStart < .99999);
        svg.addEventListener('click', event => {
          if (viewport.ignoreClick || event.target.closest('.region-box-point')) return;
          onChoose?.(null);
        });
        svg.addEventListener('pointermove', event => {
          if (event.pointerType !== 'touch' && !viewport.isDragging) showGuide(event.clientY, svg);
        });
        svg.addEventListener('pointerleave', hideGuide);
        viewport.bindPlot(svg);
        const clipId = `region-box-clip-${regionIndex}`;
        const defs = svgNode('defs');
        const clip = svgNode('clipPath', {id: clipId});
        clip.append(svgNode('rect', {x: 0, y: 18, width: 180, height: 320}));
        defs.append(clip);
        const marks = svgNode('g', {'clip-path': `url(#${clipId})`});
        svg.append(defs);
        for (const tick of ticks) {
          svg.append(svgNode('line', {x1: 0, x2: 180, y1: y(tick), y2: y(tick),
            class: 'region-box-gridline' + (key === 'differencePer1000' && tick === 0 ? ' is-zero-reference' : '')}));
        }
        if (valid.length && code !== 'OTHER') {
          const {q1, median, q3, whiskerLow, whiskerHigh, below, above, mean} = describeDistribution(sorted);
          const stats = document.createElement('div');
          stats.className = 'region-box-stats';
          const medianLabel = document.createElement('span');
          medianLabel.textContent = 'Medijana:';
          medianLabel.title = 'Medijana';
          const medianValue = document.createElement('span');
          medianValue.textContent = format(median);
          const meanLabel = document.createElement('span');
          meanLabel.textContent = 'Prosjek:';
          meanLabel.title = 'Prosjek';
          const meanValue = document.createElement('span');
          meanValue.textContent = format(mean);
          stats.append(medianLabel, medianValue, meanLabel, meanValue);
          const totalLabel = document.createElement('span');
          totalLabel.textContent = 'Ukupno:';
          const totalValue = document.createElement('span');
          totalValue.className = 'region-box-total';
          totalValue.textContent = totalValues(members)[key] ?? '—';
          totalValue.title = 'Obračun kao u zbirnom redu tabele';
          stats.append(totalLabel, totalValue);
          const values = [medianValue, meanValue, totalValue];
          const parts = values.map(value => value.textContent.match(/^([+−-]?[\d.\s]+)(,\d+)?(.*)$/));
          stats.style.setProperty('--fraction-width', Math.max(...parts.map(part => part?.[2]?.length || 0)) + 'ch');
          stats.style.setProperty('--suffix-width', Math.max(...parts.map(part => part?.[3]?.length || 0)) + 'ch');
          values.forEach((value, index) => {
            const original = value.textContent;
            value.classList.add('region-box-stat-value');
            value.setAttribute('aria-label', original);
            value.replaceChildren();
            for (const text of parts[index] ? [parts[index][1], parts[index][2] || '', parts[index][3]] : [original, '', '']) {
              const part = document.createElement('span');
              part.textContent = text;
              part.setAttribute('aria-hidden', 'true');
              value.append(part);
            }
          });
          header.append(stats);
          const whisker = svgNode('g', {class: 'region-box-whisker'});
          whisker.append(
            svgNode('line', {x1: 90, x2: 90, y1: y(whiskerLow), y2: y(whiskerHigh)}),
            svgNode('line', {x1: 80, x2: 100, y1: y(whiskerLow), y2: y(whiskerLow)}),
            svgNode('line', {x1: 80, x2: 100, y1: y(whiskerHigh), y2: y(whiskerHigh)})
          );
          const summary = svgNode('title');
          summary.textContent = [
            `Minimum: ${format(sorted[0])}`,
            `Donji brk: ${format(whiskerLow)}`,
            `Q1: ${format(q1)}`,
            `Medijana: ${format(median)}`,
            `Prosjek: ${format(mean)}`,
            `Q3: ${format(q3)}`,
            `Gornji brk: ${format(whiskerHigh)}`,
            `Maksimum: ${format(sorted.at(-1))}`,
            `Izvan brkova: ${below} ispod, ${above} iznad`,
          ].join('\n');
          whisker.append(summary);
          marks.append(
            whisker,
            svgNode('rect', {x: 55, y: y(q3), width: 70, height: Math.max(1, y(q1) - y(q3)), class: 'region-box-iqr'}),
            svgNode('line', {x1: 55, x2: 125, y1: y(median), y2: y(median), class: 'region-box-median'}),
            svgNode('path', {d: `M 90 ${y(mean) - 7} l 7 7 -7 7 -7 -7 Z`, class: 'region-box-mean'})
          );
          const placed = [];
          const candidates = [90];
          for (let offset = 4; offset <= 72; offset += 4) candidates.push(90 - offset, 90 + offset);
          valid.sort((a, b) => a[key] - b[key] || a.name.localeCompare(b.name, 'sr-Latn-RS')).forEach(entry => {
            const pointY = y(entry[key]);
            const pointRadius = radius(entry);
            if (pointY < 18 - pointRadius || pointY > 338 + pointRadius) return;
            let bestX = Number.isFinite(entry[sizeKey])
              ? Math.max(pointRadius + 2, Math.min(178 - pointRadius, x(entry[sizeKey]))) : 90;
            if (!Number.isFinite(entry[sizeKey])) {
              let bestOverlap = Infinity;
              for (const candidate of candidates) {
                let overlap = 0;
                for (const other of placed) {
                  const distance = Math.hypot(candidate - other.x, pointY - other.y);
                  overlap += Math.max(0, pointRadius + other.radius + 1 - distance) ** 2;
                }
                if (overlap < bestOverlap) {
                  bestOverlap = overlap;
                  bestX = candidate;
                }
                if (overlap === 0) break;
              }
            }
            placed.push({x: bestX, y: pointY, radius: pointRadius});
            const dot = svgNode('circle', {cx: bestX, cy: pointY, r: pointRadius,
              class: 'region-box-point' + (entry[key] < whiskerLow || entry[key] > whiskerHigh ? ' is-outlier' : ''), tabindex: 0});
            pointById.set(entry.id, dot);
            const detail = `${entry.name}\n${metricLabel(key)}: ${metricValue(entry, key)}\nX / veličina · ${metricLabel(sizeKey)}: ${metricValue(entry, sizeKey)}`;
            dot.setAttribute('aria-label', detail.replaceAll('\n', '. '));
            const show = (x, y) => {
              tooltip.textContent = detail;
              tooltip.hidden = false;
              placeTooltip(x, y);
            };
            dot.addEventListener('pointerenter', event => {
              if (!viewport.isDragging) {
                show(event.clientX, event.clientY);
                hoveredEntry = entry;
                updateCurrent();
                onHover?.(entry);
              }
            });
            dot.addEventListener('pointermove', event => {
              if (!viewport.isDragging) placeTooltip(event.clientX, event.clientY);
            });
            dot.addEventListener('pointerleave', () => {
              hideTooltip();
              hoveredEntry = null;
              updateCurrent();
              onHover?.(null);
            });
            dot.addEventListener('focus', () => {
              const rect = dot.getBoundingClientRect();
              show(rect.left + rect.width / 2, rect.top);
              hoveredEntry = entry;
              updateCurrent();
              onHover?.(entry);
            });
            dot.addEventListener('blur', () => {
              hideTooltip();
              hoveredEntry = null;
              updateCurrent();
              onHover?.(null);
            });
            dot.addEventListener('click', () => { if (!viewport.ignoreClick) onChoose?.(entry); });
            dot.addEventListener('keydown', event => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onChoose?.(entry);
            });
            marks.append(dot);
          });
          svg.append(marks);
          column.append(header, svg);
        } else {
          const missing = svgNode('text', {x: 90, y: 180, 'text-anchor': 'middle', class: 'region-box-empty'});
          missing.textContent = code === 'OTHER' ? '' : 'Nema podataka';
          if (code === 'OTHER') {
            missing.textContent = 'Inostranstvo i kazneni zavodi';
            missing.setAttribute('transform', 'rotate(-90 90 180)');
          }
          if (code === 'OTHER') {
            const stats = document.createElement('div');
            stats.className = 'region-box-stats';
            const label = document.createElement('span');
            label.textContent = 'Ukupno:';
            const value = document.createElement('span');
            value.className = 'region-box-total';
            value.style.textAlign = 'right';
            value.textContent = totalValues(members)[key] ?? '—';
            stats.append(label, value);
            header.append(stats);
            svg.querySelectorAll('.region-box-gridline').forEach(line => line.remove());
          }
          svg.append(missing);
          column.append(header, svg);
        }
        const xAxis = svgNode('svg', {viewBox: '0 0 180 44', role: 'img', class: 'region-box-x-axis',
          'aria-label': sized.length ? `${label}: X osa za ${metricLabel(sizeKey)}, od ${number.format(xLow)} do ${number.format(xHigh)}`
            : `${label}: nema podataka za X osu ${metricLabel(sizeKey)}`});
        if (sized.length && code !== 'OTHER') {
          xAxis.append(svgNode('line', {x1: 12, x2: 168, y1: 10, y2: 10, class: 'region-box-x-line'}));
          for (const [value, position, anchor] of [[xLow, 12, 'start'], [(xLow + xHigh) / 2, 90, 'middle'], [xHigh, 168, 'end']]) {
            xAxis.append(svgNode('line', {x1: position, x2: position, y1: 6, y2: 14, class: 'region-box-x-line'}));
            const tick = svgNode('text', {x: position, y: 29, 'text-anchor': anchor, class: 'region-box-x-tick'});
            tick.textContent = number.format(value / xDivisor);
            xAxis.append(tick);
          }
        } else {
          const missing = svgNode('text', {x: 90, y: 26, 'text-anchor': 'middle', class: 'region-box-x-tick'});
          missing.textContent = code === 'OTHER' ? '' : 'Nema X podataka';
          xAxis.append(missing);
        }
        column.append(xAxis);
        const xMarker = svgNode('g', {visibility: 'hidden', class: 'selected-axis-marker region-box-x-marker'});
        xMarker.append(svgNode('path', {d: 'M -4 1 L 0 10 L 4 1 Z'}));
        xMarker.append(svgNode('rect', {x: -28, y: 15, width: 56, height: 17, rx: 2}));
        const xMarkerLabel = svgNode('text', {x: 0, y: 27, 'text-anchor': 'middle'});
        const xMarkerTitle = svgNode('title');
        xMarker.append(xMarkerLabel, xMarkerTitle);
        xAxis.append(xMarker);
        if (code !== 'OTHER') xGuides.set(code, {marker: xMarker, x, label: xMarkerLabel,
          title: xMarkerTitle, format: value => number.format(value / xDivisor)});
        const xTotal = document.createElement('div');
        xTotal.className = 'region-box-x-total';
        xTotal.textContent = totalValues(members)[sizeKey] ?? '—';
        xTotal.title = `${label} · ${metricLabel(sizeKey)} · ukupno prema zbirnom redu tabele`;
        column.append(xTotal);
        fragment.append(column);
      });
      grid.querySelectorAll('.region-bars-column').forEach(column => column.remove());
      grid.append(fragment);
      refreshRegionSelection();
      fitColumns();
      for (const [selector, metric] of [['.region-box-total', key], ['.region-bars-column .region-box-x-total', sizeKey]]) {
        const cells = [...grid.querySelectorAll(selector)];
        const values = cells.map(cell => {
          const text = cell.textContent.replace(/\./g, '').replace(',', '.').replace(/[^\d.+−-]/g, '').replace('−', '-');
          return text && text !== '-' ? Number(text) : NaN;
        });
        const available = values.filter(Number.isFinite);
        const low = Math.min(0, ...available);
        const high = metrics[metric].unit === '%' ? Math.max(100, ...available) : Math.max(0, ...available);
        const span = high - low || 1;
        const zero = 100 * -low / span;
        cells.forEach((cell, index) => {
          if (!Number.isFinite(values[index])) return;
          const end = 100 * (values[index] - low) / span;
          cell.classList.add('region-box-total-bar');
          cell.style.setProperty('--bar-start', Math.min(zero, end) + '%');
          cell.style.setProperty('--bar-end', Math.max(zero, end) + '%');
        });
      }
      hideTooltip();
      hideGuide();
      updateCurrent();
    };
    select.addEventListener('change', () => {
      viewport.reset();
      render();
    });
    sizeSelect.addEventListener('change', render);
    render();
    new ResizeObserver(fitColumns).observe(grid);
    return {
      refreshRegionSelection,
      applyFilter() {
        const nextEntries = entries.filter(entry => displayedCodes.has(entry.region) && isVisible(entry.id));
        if (nextEntries.length === displayedEntries.length && nextEntries.every((entry, index) => entry.id === displayedEntries[index].id)) return;
        displayedEntries = nextEntries;
        plottedEntries = displayedEntries.filter(entry => entry.region !== 'OTHER');
        hoveredEntry = null;
        if (selectedEntry && !isVisible(selectedEntry.id)) selectedEntry = null;
        viewport.reset();
        render();
      },
      select(entry) { selectedEntry = entry && displayedCodes.has(entry.region) ? entry : null; updateCurrent(); },
      hover(entry) { hoveredEntry = entry && displayedCodes.has(entry.region) ? entry : null; updateCurrent(); },
    };
  };
})();
