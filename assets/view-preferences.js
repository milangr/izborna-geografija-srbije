(() => {
  'use strict';
  window.initializeViewPreferences = ({preferenceKey, defaultMetrics, regions, selectedRegions, regionPicker, selectAllRegions, filterLinkMode, refreshRegions, renderTable}) => {
    const get = id => document.getElementById(id);
    let savedPreferences = null;
    try { savedPreferences = JSON.parse(localStorage.getItem(preferenceKey)); } catch {}
    if (savedPreferences && typeof savedPreferences === 'object') {
      for (const id of Object.keys(defaultMetrics)) {
        const control = get(id);
        const value = savedPreferences.metrics?.[id];
        if ([...control.options].some(option => option.value === value)) {
          control.value = value;
          control.dispatchEvent(new Event('change'));
        }
      }
      const savedRegions = Array.isArray(savedPreferences.regions)
        ? savedPreferences.regions.filter(code => Object.hasOwn(regions, code)) : [];
      if (savedRegions.length) {
        selectedRegions.clear();
        savedRegions.forEach(code => selectedRegions.add(code));
        for (const input of regionPicker.querySelectorAll('input')) input.checked = selectedRegions.has(input.value);
        refreshRegions();
      }
      filterLinkMode.value = savedPreferences.syncTable === true ? 'table'
        : savedPreferences.syncVisual === true ? 'visual' : 'none';
      renderTable();
    }
    const savePreferences = () => {
      try {
        localStorage.setItem(preferenceKey, JSON.stringify({
          metrics: Object.fromEntries(Object.keys(defaultMetrics).map(id => [id, get(id).value])),
          regions: [...selectedRegions], syncTable: filterLinkMode.value === 'table', syncVisual: filterLinkMode.value === 'visual',
        }));
      } catch {
        get('view-preferences-note').textContent = 'Preglednik ne dozvoljava čuvanje izbora za narednu posjetu.';
      }
    };
    for (const id of Object.keys(defaultMetrics)) get(id).addEventListener('change', savePreferences);
    regionPicker.addEventListener('change', savePreferences);
    regionPicker.addEventListener('click', event => { if (event.target.closest('.region-only')) savePreferences(); });
    selectAllRegions.addEventListener('click', savePreferences);
    filterLinkMode.addEventListener('change', savePreferences);
    get('reset-view-preferences').addEventListener('click', () => {
      try { localStorage.removeItem(preferenceKey); } catch {}
      location.reload();
    });


  };
})();
