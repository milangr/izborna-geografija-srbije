(() => {
  'use strict';
  window.createTableHeader = ({table, columns, tableData, regions, developmentLabels,
    byName, columnHelp, sourceLinks, selectedRows, isSelectableRow, getVisibleRows, renderTable}) => {
    let sortKey = 'name';
    let ascending = true;
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
    let positionActiveColumnHelp = () => {};
    window.addEventListener('resize', () => positionActiveColumnHelp());
    window.addEventListener('scroll', () => positionActiveColumnHelp(), {capture: true, passive: true});
    const addColumnHelp = (trigger, key) => {
      const hoverTarget = trigger.querySelector('.column-title-text') || trigger;
      const [description, sources] = columnHelp[key];
      const popup = document.createElement('div');
      popup.id = 'column-help-' + key;
      popup.className = 'column-help-popover';
      popup.setAttribute('popover', 'manual');
      popup.setAttribute('role', 'tooltip');
      for (const text of description.split('\n')) {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        popup.append(paragraph);
      }
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
      const position = () => {
        if (!popup.matches(':popover-open')) return;
        const rect = hoverTarget.getBoundingClientRect();
        const viewport = document.documentElement;
        // clientWidth excludes the scrollbar, unlike CSS 100vw.
        popup.style.maxWidth = Math.max(0, viewport.clientWidth - 16) + 'px';
        const {width, height} = popup.getBoundingClientRect();
        popup.style.left = Math.max(8, Math.min(rect.left, viewport.clientWidth - width - 8)) + 'px';
        const top = rect.bottom + 5 + height <= viewport.clientHeight - 8
          ? rect.bottom + 5 : rect.top - height - 5;
        popup.style.top = Math.max(8, Math.min(top, viewport.clientHeight - height - 8)) + 'px';
      };
      const show = () => {
        if (columnDrag) return;
        clearTimeout(helpHideTimer);
        if (activeColumnHelp && activeColumnHelp !== popup) activeColumnHelp.hidePopover();
        if (!popup.matches(':popover-open')) popup.showPopover();
        activeColumnHelp = popup;
        positionActiveColumnHelp = position;
        position();
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
    columnHelp.number = ['Izbor vidljivih kolona: kliknite na podebljanu ikonicu ispod „Br.” da uključite ili isključite kolone tabele.\nKolona „Opština / grad” uvijek ostaje vidljiva.\n„Br.” označava redni broj reda.', []];
    addColumnHelp(numberHeading, 'number');
    const headers = new Map();
    const rangeFilters = new Map();
    const createChoiceFilter = (id, label, options, locked = []) =>
      window.createChoiceFilter({id, label, options, locked, onApply: renderTable});
    const filterButtons = new Map();
    selectAll.addEventListener('change', () => {
      for (const entry of getVisibleRows().filter(isSelectableRow)) {
        if (selectAll.checked) selectedRows.add(entry.id);
        else selectedRows.delete(entry.id);
      }
      renderTable();
    });
    const districtRegions = new Map();
    for (const entry of tableData) {
      if (entry.district) districtRegions.set(entry.district, entry.region);
    }
    const nameFilter = createChoiceFilter('table-name', 'Opština ili grad',
      tableData.map(entry => [entry.id, entry.name]).sort((a, b) => byName.compare(a[1], b[1])));
    const regionFilter = createChoiceFilter('table-region', 'Regija', Object.entries(regions));
    const districtOptions = [...districtRegions].sort((a, b) =>
      byName.compare(regions[a[1]], regions[b[1]]) || byName.compare(a[0], b[0]))
      .map(([district, region]) => [district, district + ' · ' + regions[region]]);
    const districtFilter = createChoiceFilter('table-district', 'Okrug', districtOptions);
    const developmentFilter = createChoiceFilter('table-development', 'Stepen razvijenosti',
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
      const headingLines = column.key === 'voteDifference'
        ? ['Razlika', 'glasova', '(Lista3 − SNS)'] : null;
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
      let choiceFilter = null;
      if (column.key === 'name') choiceFilter = nameFilter;
      else if (column.key === 'region') choiceFilter = regionFilter;
      else if (column.key === 'district') choiceFilter = districtFilter;
      else if (column.key === 'developmentGroup2014') choiceFilter = developmentFilter;
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
        const applied = inputs.map(() => ({
          value: '',
          get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); },
        }));
        rangeFilters.set(column.key, applied);
        popup.addEventListener('beforetoggle', event => {
          if (event.newState === 'open') inputs.forEach((input, index) => { input.value = applied[index].value; });
        });
        const applyRange = () => {
          if (!inputs.every(input => input.reportValidity())) return;
          inputs.forEach((input, index) => { applied[index].value = input.value; });
          popup.hidePopover();
          renderTable();
        };
        const actions = document.createElement('div');
        actions.className = 'choice-filter-actions';
        const applyButton = document.createElement('button');
        applyButton.type = 'button';
        applyButton.textContent = 'OK';
        applyButton.addEventListener('click', applyRange);
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Poništi';
        cancelButton.addEventListener('click', () => popup.hidePopover());
        actions.append(applyButton, cancelButton);
        popup.append(actions);
        popup.addEventListener('keydown', event => {
          if (event.key === 'Enter' && event.target.matches('input')) {
            event.preventDefault();
            applyRange();
          }
        });
      }
      if (choiceFilter) popup.append(choiceFilter.element);
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
        choiceFilter?.beginEdit();
        const rect = filter.getBoundingClientRect();
        const popupWidth = popup.querySelector('.choice-filter')
          ? Math.min(330, document.documentElement.clientWidth - 16) : 243;
        popup.style.left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - popupWidth - 8)) + 'px';
        popup.style.top = rect.bottom + 5 + 'px';
      });
      popup.addEventListener('toggle', event => {
        if (event.newState === 'open') popup.style.top = Math.max(8,
          Math.min(filter.getBoundingClientRect().bottom + 5, window.innerHeight - popup.offsetHeight - 8)) + 'px';
        else choiceFilter?.cancelEdit();
      });
    }

    const columnVisibility = createChoiceFilter('visible-columns', 'Vidljive kolone',
      columns.map(column => [column.key, column.label]), ['name']);
    const columnPopup = document.createElement('div');
    columnPopup.id = 'column-visibility';
    columnPopup.className = 'range-popover';
    columnPopup.setAttribute('popover', 'auto');
    const columnTitle = document.createElement('p');
    columnTitle.textContent = 'Vidljive kolone';
    columnPopup.append(columnTitle, columnVisibility.element);
    table.closest('.table-panel').append(columnPopup);
    const columnGroup = document.createElement('div');
    columnGroup.className = 'column-heading';
    const numberLabel = document.createElement('span');
    numberLabel.textContent = 'Br.';
    const columnButton = document.createElement('button');
    columnButton.type = 'button';
    columnButton.className = 'column-filter-button';
    columnButton.setAttribute('aria-label', 'Izaberi vidljive kolone');
    columnButton.setAttribute('popovertarget', columnPopup.id);
    columnButton.innerHTML = filterButtons.get('name').innerHTML;
    columnGroup.append(numberLabel, columnButton);
    numberHeading.replaceChildren(columnGroup);
    const positionColumnPopup = () => {
      const rect = columnButton.getBoundingClientRect();
      columnPopup.style.left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - 338)) + 'px';
      columnPopup.style.top = Math.max(8, Math.min(rect.bottom + 5, innerHeight - columnPopup.offsetHeight - 8)) + 'px';
    };
    columnPopup.addEventListener('beforetoggle', event => {
      if (event.newState === 'open') { columnVisibility.beginEdit(); positionColumnPopup(); }
    });
    columnPopup.addEventListener('toggle', event => {
      if (event.newState === 'open') positionColumnPopup();
      else columnVisibility.cancelEdit();
    });
    const updateFrozenColumns = () => {
      table.style.setProperty('--selection-column-width', selectionHeading.getBoundingClientRect().width + 'px');
      table.style.setProperty('--number-column-width', numberHeading.getBoundingClientRect().width + 'px');
    };
    const frozenColumnObserver = new ResizeObserver(updateFrozenColumns);
    frozenColumnObserver.observe(selectionHeading);
    frozenColumnObserver.observe(numberHeading);

    return {headers, rangeFilters, filterButtons, selectAll, nameFilter, regionFilter,
      districtFilter, developmentFilter, columnVisibility, columnButton,
      get sortKey() { return sortKey; }, get ascending() { return ascending; }};
  };
})();
