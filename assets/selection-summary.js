(() => {
  'use strict';
  window.createSelectionSummary = ({panel, columns, wholeNumber, totalValues, getState}) => {
    const body = panel.querySelector('tbody');
    const scope = panel.querySelector('.selection-summary-scope');
    function refresh() {
      const {entry, entries, visibleColumns, scopeLabel} = getState();
      scope.textContent = entry ? entry.name : entries.length ? `${scopeLabel} · zbir (${entries.length})` : 'Nema podataka';
      const totals = entry ? null : totalValues(entries);
      const rows = document.createDocumentFragment();
      for (const {key, label, format = wholeNumber.format} of columns) {
        if (key === 'name' || !visibleColumns.has(key)) continue;
        const row = document.createElement('tr');
        row.dataset.metric = key;
        const heading = document.createElement('th');
        heading.scope = 'row';
        heading.textContent = label;
        if (key === 'voteDifference' && label.includes(' (')) {
          const split = label.indexOf(' (');
          heading.replaceChildren(label.slice(0, split), document.createElement('br'), label.slice(split + 1));
        }
        const cell = document.createElement('td');
        cell.textContent = entry ? entry[key] == null ? '—' : format(entry[key])
          : entries.length ? totals[key] ?? '—' : '—';
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
