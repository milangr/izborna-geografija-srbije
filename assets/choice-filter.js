(() => {
  'use strict';
  const searchKey = text => text.toLocaleLowerCase('sr-Latn-RS').normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'dj');
  window.createChoiceFilter = ({id, label, options, locked = [], onApply}) => {
    const selected = new Set(options.map(([value]) => String(value)));
    let draft = new Set(selected);
    const element = document.createElement('div');
    element.id = id;
    element.className = 'choice-filter';
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', label);
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'choice-filter-search';
    searchInput.placeholder = 'Pretraži vrijednosti';
    searchInput.setAttribute('aria-label', 'Pretraži ' + label.toLowerCase());
    const status = document.createElement('div');
    status.className = 'choice-filter-status';
    const count = document.createElement('span');
    const selectAllLabel = document.createElement('label');
    const selectAllInput = document.createElement('input');
    selectAllInput.type = 'checkbox';
    selectAllLabel.append(selectAllInput, document.createTextNode('Odaberi sve'));
    status.append(selectAllLabel, count);
    const list = document.createElement('div');
    list.className = 'choice-filter-list';
    const inputs = new Map();
    const optionLabels = new Map();
    for (const [value, text] of options) {
      const option = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      input.disabled = locked.includes(String(value));
      option.append(input, document.createTextNode(text));
      list.append(option);
      inputs.set(String(value), input);
      optionLabels.set(String(value), {element: option, search: searchKey(text)});
      input.addEventListener('input', event => {
        event.stopPropagation();
        if (input.checked) draft.add(input.value);
        else draft.delete(input.value);
        update();
      });
    }
    const update = () => {
      for (const [value, input] of inputs) input.checked = draft.has(value);
      const visible = [...optionLabels].filter(([, option]) => !option.element.hidden).map(([value]) => value);
      const visibleSelected = visible.filter(value => draft.has(value)).length;
      count.textContent = draft.size === inputs.size ? 'Sve vrijednosti'
        : draft.size ? 'Izabrano: ' + draft.size + ' od ' + inputs.size : 'Nijedna vrijednost';
      selectAllInput.checked = visible.length > 0 && visibleSelected === visible.length;
      selectAllInput.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
      selectAllInput.disabled = visible.length === 0;
    };
    const filterOptions = () => {
      const query = searchKey(searchInput.value.trim());
      for (const option of optionLabels.values()) option.element.hidden = !option.search.includes(query);
      selectAllLabel.lastChild.textContent = query ? 'Odaberi sve prikazane' : 'Odaberi sve';
      update();
    };
    const clear = () => {
      selected.clear();
      for (const value of inputs.keys()) selected.add(value);
      draft = new Set(selected);
      update();
    };
    const isActive = () => selected.size !== inputs.size;
    const selectOnly = value => {
      value = String(value);
      if (selected.size === 1 && selected.has(value)) clear();
      else { selected.clear(); selected.add(value); draft = new Set(selected); }
      update();
    };
    const beginEdit = () => { draft = new Set(selected); searchInput.value = ''; filterOptions(); };
    const cancelEdit = () => { draft = new Set(selected); searchInput.value = ''; filterOptions(); };
    const applyEdit = () => {
      for (const value of locked) draft.add(value);
      selected.clear();
      for (const value of draft) selected.add(value);
      element.closest('[popover]').hidePopover();
      onApply();
    };
    searchInput.addEventListener('input', event => { event.stopPropagation(); filterOptions(); });
    searchInput.addEventListener('keydown', event => { if (event.key === 'Enter') applyEdit(); });
    selectAllInput.addEventListener('input', event => {
      event.stopPropagation();
      for (const [value, option] of optionLabels) {
        if (locked.includes(value)) continue;
        if (option.element.hidden) continue;
        if (selectAllInput.checked) draft.add(value);
        else draft.delete(value);
      }
      update();
    });
    const actions = document.createElement('div');
    actions.className = 'choice-filter-actions';
    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.textContent = 'OK';
    applyButton.addEventListener('click', applyEdit);
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Odustani';
    cancelButton.addEventListener('click', () => element.closest('[popover]').hidePopover());
    actions.append(applyButton, cancelButton);
    element.append(searchInput, status, list, actions);
    update();
    return {element, selected, clear, selectOnly, isActive, beginEdit, cancelEdit};
  };
})();
