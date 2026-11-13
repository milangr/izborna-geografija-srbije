(() => {
  'use strict';
  window.createSelectionSummary = ({panel, columns, columnHelp, sourceLinks, wholeNumber,
    totalValues, aggregateEntries, getState}) => {
    const body = panel.querySelector('tbody');
    const scope = panel.querySelector('.selection-summary-scope');
    const ageKeys = new Set(['age0_14Share', 'youthShare', 'age30_44Share',
      'age45_64Share', 'age65PlusShare']);
    const popup = document.createElement('div');
    popup.id = 'selection-summary-help';
    popup.className = 'column-help-popover';
    popup.setAttribute('popover', 'manual');
    popup.setAttribute('role', 'tooltip');
    panel.append(popup);
    let activeLabel = null;
    let hideTimer;
    const hide = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (popup.matches(':popover-open')) popup.hidePopover();
        activeLabel = null;
      }, 500);
    };
    const position = () => {
      if (!activeLabel || !popup.matches(':popover-open')) return;
      const rect = activeLabel.getBoundingClientRect();
      const viewport = document.documentElement;
      popup.style.maxWidth = Math.max(0, viewport.clientWidth - 16) + 'px';
      popup.style.maxHeight = Math.max(36, Math.min(rect.top - 16, viewport.clientHeight * .7, 580)) + 'px';
      const {width, height} = popup.getBoundingClientRect();
      popup.style.left = Math.max(8, Math.min(rect.left, viewport.clientWidth - width - 8)) + 'px';
      popup.style.top = Math.max(8, rect.top - height - 5) + 'px';
    };
    const show = label => {
      const help = columnHelp[label.dataset.metric];
      if (!help) return;
      clearTimeout(hideTimer);
      activeLabel = label;
      const [description, sources] = help;
      popup.replaceChildren();
      for (const line of description.split('\n')) {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        popup.append(paragraph);
      }
      const sourceLine = document.createElement('div');
      sourceLine.className = 'column-help-sources';
      sourceLine.append('Izvor: ');
      for (const [index, source] of sources.entries()) {
        if (index) sourceLine.append(' · ');
        const [label, href] = sourceLinks[source];
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = label;
        sourceLine.append(link);
      }
      if (!sources.length) sourceLine.append('nije naveden');
      popup.append(sourceLine);
      if (!popup.matches(':popover-open')) popup.showPopover();
      position();
    };
    body.addEventListener('mouseover', event => {
      const label = event.target.closest('.selection-summary-label');
      if (label && label !== activeLabel) show(label);
    });
    body.addEventListener('mouseout', event => {
      if (event.target.closest('.selection-summary-label')
        && !event.relatedTarget?.closest?.('.selection-summary-label')) hide();
    });
    body.addEventListener('focusin', event => {
      const label = event.target.closest('.selection-summary-label');
      if (label) show(label);
    });
    body.addEventListener('focusout', hide);
    popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    popup.addEventListener('mouseleave', hide);
    popup.addEventListener('focusin', () => clearTimeout(hideTimer));
    popup.addEventListener('focusout', hide);
    window.addEventListener('resize', position);
    panel.querySelector('.selection-summary-scroll').addEventListener('scroll', position, {passive: true});
    function refresh() {
      if (popup.matches(':popover-open')) popup.hidePopover();
      activeLabel = null;
      const {entry, entries, visibleColumns, scopeLabel} = getState();
      scope.textContent = entry ? entry.name : entries.length ? `${scopeLabel} · zbir (${entries.length})` : 'Nema podataka';
      const totals = entry ? null : totalValues(entries);
      const ageValues = entry || (entries.length ? aggregateEntries(entries) : {});
      const largestAgeShare = Math.max(0, ...[...ageKeys].map(key => ageValues[key] || 0));
      const rows = document.createDocumentFragment();
      for (const {key, label, format = wholeNumber.format} of columns) {
        if (key === 'name' || !visibleColumns.has(key)) continue;
        const row = document.createElement('tr');
        row.dataset.metric = key;
        const heading = document.createElement('th');
        heading.scope = 'row';
        heading.dataset.metric = key;
        const labelText = document.createElement('span');
        labelText.className = 'selection-summary-label';
        labelText.dataset.metric = key;
        labelText.tabIndex = 0;
        labelText.setAttribute('aria-describedby', popup.id);
        labelText.textContent = label;
        if (key === 'voteDifference' && label.includes(' (')) {
          const split = label.indexOf(' (');
          labelText.replaceChildren(label.slice(0, split), document.createElement('br'), label.slice(split + 1));
        }
        heading.append(labelText);
        const cell = document.createElement('td');
        cell.textContent = entry ? entry[key] == null ? '-' : format(entry[key])
          : entries.length ? totals[key] ?? '-' : '-';
        if (ageKeys.has(key) && Number.isFinite(ageValues[key]) && largestAgeShare > 0) {
          const value = cell.textContent;
          const display = document.createElement('div');
          display.className = 'selection-summary-age-display';
          const track = document.createElement('span');
          track.className = 'selection-summary-age-track';
          track.setAttribute('aria-hidden', 'true');
          const bar = document.createElement('span');
          bar.className = 'selection-summary-age-bar';
          bar.style.width = 100 * ageValues[key] / largestAgeShare + '%';
          track.append(bar);
          const valueText = document.createElement('span');
          valueText.className = 'selection-summary-age-value';
          valueText.textContent = value;
          display.append(track, valueText);
          cell.replaceChildren(display);
        }
        row.append(heading, cell);
        rows.append(row);
      }
      if (!rows.childNodes.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 2;
        cell.textContent = 'U glavnoj tabeli uključite kolone koje želite prikazati.';
        row.append(cell);
        rows.append(row);
      }
      body.replaceChildren(rows);
    }
    return {refresh};
  };
})();
