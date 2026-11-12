(() => {
  'use strict';
  // A null choice means no restriction; an empty Set means no matching rows.
  function filterRows(entries, {choices, ranges}) {
    return entries.filter(entry => Object.entries(choices).every(([key, selected]) =>
      selected === null || selected.has(String(entry[key]))) &&
      ranges.every(([key, min, max]) => (min === -Infinity && max === Infinity) ||
        (entry[key] != null && entry[key] >= min && entry[key] <= max)));
  }

  function visibleTableRows(entries, {linked, selectedRegions, matchesMatrixFilter, selectedId}) {
    return linked ? entries.filter(entry => selectedRegions.has(entry.region) &&
      matchesMatrixFilter(entry) && (!selectedId || entry.id === selectedId)) : entries;
  }

  function compareRows({sortKey, ascending, byName, regions}) {
    return (a, b) => {
      const nameOrder = byName.compare(a.name, b.name);
      if (!['name', 'region', 'district'].includes(sortKey)) {
        if (a[sortKey] == null) return b[sortKey] == null ? nameOrder : 1;
        if (b[sortKey] == null) return -1;
      }
      const primary = sortKey === 'name' ? nameOrder
        : sortKey === 'region' ? byName.compare(regions[a.region], regions[b.region])
        : sortKey === 'district' ? byName.compare(a.district || '', b.district || '')
        : a[sortKey] - b[sortKey];
      return (ascending ? primary : -primary) || nameOrder;
    };
  }

  window.electionFilters = {filterRows, visibleTableRows, compareRows};
})();
