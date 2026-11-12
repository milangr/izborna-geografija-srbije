(() => {
  'use strict';
  window.renderMunicipalityTable = ({visible, currentId, elements, model, formatting, actions}) => {
    const {table, tableBody, tableFoot, columnVisibility} = elements;
    const {columns, selectedRows, syncFilters, regionFilter, districtFilter, tableRegions, developmentLabels,
      maxDifferencePer1000, maxVoteDifference, maxWage} = model;
    const {wholeNumber, isDifference, totalValues} = formatting;
    const {isSelectableRow, updateTableStatus, choose, chooseSpecial, renderTable} = actions;
    const get = id => document.getElementById(id);
    const rows = document.createDocumentFragment();
    for (const [index, entry] of visible.entries()) {
      const row = document.createElement('tr');
      row.dataset.unitId = entry.id;
      row.classList.toggle('is-special', Boolean(entry.special));
      row.classList.toggle('is-mapped-special', entry.region === 'OTHER');
      row.classList.toggle('is-current', currentId === entry.id);
      if (!entry.special) row.addEventListener('click', event => {
        if (event.target.closest('input')) return;
        if (syncFilters.checked && selectedRows.size && !selectedRows.has(entry.id)) {
          selectedRows.add(entry.id);
          checkbox.checked = true;
          updateTableStatus();
        }
        choose(get(entry.id));
      });
      else if (entry.region === 'OTHER') row.addEventListener('click', event => {
        if (event.target.closest('input')) return;
        if (syncFilters.checked && selectedRows.size && !selectedRows.has(entry.id)) {
          selectedRows.add(entry.id);
          checkbox.checked = true;
          updateTableStatus();
        }
        chooseSpecial(entry);
      });
      const selectCell = row.insertCell();
      selectCell.className = 'row-select';
      const numberCell = row.insertCell();
      numberCell.className = 'row-number';
      numberCell.textContent = String(index + 1);
      const checkbox = document.createElement('input');
      if (isSelectableRow(entry)) {
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
            filterValue.setAttribute('aria-pressed', String(filterControl.selected.size === 1 && filterControl.selected.has(value)));
            filterValue.addEventListener('click', event => {
              event.stopPropagation();
              filterControl.selectOnly(value);
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
        if (isDifference(key) && Number.isFinite(entry[key])) {
          cell.className = 'difference-cell';
          const bar = document.createElement('span');
          bar.className = 'difference-bar' + (entry[key] < 0 ? ' is-negative' : entry[key] === 0 ? ' is-zero' : '');
          const maximum = key === 'differencePer1000' ? maxDifferencePer1000 : maxVoteDifference;
          bar.style.setProperty('--bar-width', 50 * Math.abs(entry[key]) / maximum + '%');
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
          cell.title = 'Izvorno: ' + wholeNumber.format(entry.averageNetWage2025Rsd) + ' RSD; preračunato po 117,2026 RSD za 1 EUR.';
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
    for (const row of table.rows) {
      if (row.cells.length === 1) {
        row.cells[0].colSpan = columnVisibility.selected.size + 2;
        continue;
      }
      columns.forEach((column, index) => {
        row.cells[index + 2].hidden = !columnVisibility.selected.has(column.key);
      });
    }
    function renderTotal(visible) {
      const totals = totalValues(visible);
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

  };
})();
