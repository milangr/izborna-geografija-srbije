export async function runScenarios({evaluate, cdp, reload}) {
  const check = async (name, expression) => {
    if (!await evaluate(expression)) throw new Error(name);
    console.log("PASS " + name);
  };
  await evaluate(`window.qa={get:id=>document.getElementById(id),change(id,value){let c=this.get(id);c.value=value;c.dispatchEvent(new Event('change',{bubbles:true}));},rows:()=>document.querySelectorAll('#municipality-table tbody tr').length,points:()=>document.querySelectorAll('.scatter-mark:not(.is-filtered)').length};`);
  await check('initial chart settings match the chosen defaults', `(() => {
    const expected = {'map-color':'differencePer1000','map-texture':'votersAttended',
      'scatter-x':'developmentGroup2014','scatter-y':'differencePer1000',
      'scatter-size':'higherEducationShare','scatter-color':'region',
      'region-box-y':'differencePer1000','region-box-size':'averageNetWage2025'};
    return Object.entries(expected).every(([id,value]) => qa.get(id).value === value);
  })()`);
  await check('map difference classes use zero and fifty', `(() => {
    const model = window.createElectionDataModel(window);
    const entries = [...model.byId.values()].filter(entry => Number.isFinite(entry.differencePer1000)
      && document.getElementById(entry.id));
    const legend = document.querySelector('.map-numeric-legend').textContent;
    return entries.some(entry => entry.differencePer1000 > -50 && entry.differencePer1000 < 0)
      && entries.every(entry => document.getElementById(entry.id).classList.contains(
        'v' + (entry.differencePer1000 < 0 ? 0 : entry.differencePer1000 >= 50 ? 2 : 1)))
      && ['< 0', '0–50', '≥ 50'].every(label => legend.includes(label));
  })()`);
  // Use measures available for all units in the general interaction checks below.
  await evaluate(`qa.change('scatter-x','turnout'); qa.change('scatter-size','registeredVoters'); qa.change('region-box-size','registeredVoters')`);
  await check('185 rows and points',`qa.rows()===185 && qa.points()===185`);
  await check('summary is hidden when there is no room', `getComputedStyle(qa.get('selection-summary')).display === 'none'`);
  await cdp('Emulation.setDeviceMetricsOverride', {width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false});
  await check('summary fits beside the charts and matches table totals', `(() => {
    const panel = qa.get('selection-summary');
    const rect = panel.getBoundingClientRect();
    const chart = document.querySelector('.scatter-panel').getBoundingClientRect();
    const total = qa.get('municipality-table').tFoot.rows[0];
    const headings = [...qa.get('municipality-table').tHead.rows[0].cells];
    const index = headings.findIndex(cell => cell.textContent.includes('Glasovi Lista3'));
    return getComputedStyle(panel).display !== 'none' && rect.left >= chart.right
      && rect.right <= document.documentElement.clientWidth && rect.bottom <= innerHeight
      && panel.querySelector('[data-metric="listVotes"] td').textContent === total.cells[index].textContent;
  })()`);
  await check('summary follows clicked municipality and keeps it during hover', `(() => {
    const dots = [...document.querySelectorAll('.scatter-mark:not(.is-filtered)')].slice(0, 2);
    const model = window.createElectionDataModel(window);
    const entry = model.byId.get(dots[0].dataset.unitId);
    dots[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
    const panel = qa.get('selection-summary');
    const expected = new Intl.NumberFormat('sr-Latn-RS', {maximumFractionDigits: 0}).format(entry.listVotes);
    dots[1].dispatchEvent(new PointerEvent('pointermove', {bubbles: true, pointerType: 'mouse'}));
    const correct = panel.querySelector('.selection-summary-scope').textContent === entry.name
      && panel.querySelector('[data-metric="listVotes"] td').textContent === expected;
    const svg = document.querySelector('.scatter-plot');
    svg.dispatchEvent(new PointerEvent('pointerleave'));
    svg.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    return correct && panel.querySelector('.selection-summary-scope').textContent.includes('185');
  })()`);
  await check('summary follows region selection and visible columns', `(() => {
    document.querySelector('.region-only').click();
    const panel = qa.get('selection-summary');
    const regional = panel.querySelector('.selection-summary-scope').textContent.includes('17');
    qa.get('select-all-regions').click();
    const popup = qa.get('column-visibility');
    popup.showPopover();
    const input = popup.querySelector('input[value="listVotes"]');
    input.checked = false; input.dispatchEvent(new Event('input', {bubbles: true}));
    popup.querySelector('.choice-filter-actions button').click();
    const hidden = !panel.querySelector('[data-metric="listVotes"]');
    popup.showPopover(); input.checked = true; input.dispatchEvent(new Event('input', {bubbles: true}));
    popup.querySelector('.choice-filter-actions button').click();
    return regional && hidden && !!panel.querySelector('[data-metric="listVotes"]');
  })()`);
  await cdp('Emulation.setDeviceMetricsOverride', {width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false});
  await check('regional wage X axis uses whole euros without thousands scaling', `(() => {
    qa.change('region-box-size', 'averageNetWage2025');
    const ticks = [...document.querySelectorAll('.region-box-x-axis .region-box-x-tick')]
      .map(tick => tick.textContent).filter(text => text && text !== 'Nema X podataka');
    const caption = document.querySelector('.region-bars-axis-footer').textContent;
    return caption.includes('EUR') && !caption.includes('hilj.') && ticks.length > 0
      && ticks.every(text => /^[0-9.]+$/.test(text))
      && ticks.some(text => Number(text.replaceAll('.', '')) >= 1000);
  })()`);
  await evaluate(`qa.change('region-box-size', 'registeredVoters')`);
  await check('XY axes follow hover and restore the clicked municipality', `(() => {
    const svg = document.querySelector('.scatter-plot');
    const dots = [...svg.querySelectorAll('.scatter-mark:not(.is-filtered)')].slice(0, 2);
    const model = window.createElectionDataModel(window);
    const names = dots.map(dot => model.byId.get(dot.dataset.unitId).name);
    const matches = name => ['x', 'y'].every(axis =>
      svg.querySelector('[data-axis="' + axis + '"] title')?.textContent.startsWith(name + ':'));
    const hover = dot => dot.dispatchEvent(new PointerEvent('pointermove', {bubbles: true, pointerType: 'mouse'}));
    hover(dots[0]);
    if (!matches(names[0])) return false;
    svg.dispatchEvent(new PointerEvent('pointerleave'));
    if (svg.querySelector('[data-axis]')) return false;
    hover(dots[0]); dots[0].dispatchEvent(new MouseEvent('click', {bubbles: true}));
    hover(dots[1]);
    if (!matches(names[1])) return false;
    svg.dispatchEvent(new PointerEvent('pointerleave'));
    const retained = matches(names[0]);
    svg.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    return retained;
  })()`);
  await check('regional axes follow hover and restore the clicked municipality', `(() => {
    const dots = [...document.querySelectorAll('.region-box-point')].slice(0, 2);
    const matches = dot => {
      const name = dot.getAttribute('aria-label').split('\\n')[0].split('. ')[0];
      return ['.region-box-x-marker[visibility="visible"]', '.region-box-selected-y[visibility="visible"]']
        .every(selector => document.querySelector(selector + ' title')?.textContent.startsWith(name + ':'));
    };
    const hover = dot => dot.dispatchEvent(new PointerEvent('pointerenter', {pointerType: 'mouse'}));
    const leave = dot => dot.dispatchEvent(new PointerEvent('pointerleave', {pointerType: 'mouse'}));
    hover(dots[0]);
    if (!matches(dots[0])) return false;
    leave(dots[0]);
    if (document.querySelector('.region-box-selected-y[visibility="visible"]')) return false;
    hover(dots[0]); dots[0].dispatchEvent(new MouseEvent('click', {bubbles: true})); leave(dots[0]);
    hover(dots[1]);
    if (!matches(dots[1])) return false;
    leave(dots[1]);
    const retained = matches(dots[0]);
    dots[0].closest('svg').dispatchEvent(new MouseEvent('click', {bubbles: true}));
    return retained;
  })()`);
  await check('wheel moves exactly one option', `(()=>{let c=qa.get('map-color');c.selectedIndex=2;let changes=0;const count=()=>changes++;c.addEventListener('change',count);c.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}));c.removeEventListener('change',count);return c.selectedIndex===3&&changes===1})()`);
  await check('Ctrl wheel leaves metric unchanged', `(()=>{let c=qa.get('map-color');const before=c.selectedIndex;const e=new WheelEvent('wheel',{deltaY:100,ctrlKey:true,bubbles:true,cancelable:true});c.dispatchEvent(e);return c.selectedIndex===before&&!e.defaultPrevented})()`);
  await check('wheel at boundary allows page scrolling', `(()=>{let c=qa.get('map-color');c.selectedIndex=c.options.length-1;const e=new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true});c.dispatchEvent(e);return c.selectedIndex===c.options.length-1&&!e.defaultPrevented})()`);
  await evaluate(`qa.change('map-color','differencePer1000')`);
  await check('readout box tooltip',`(()=>{let b=document.querySelector('.metric-mini-box');b.dispatchEvent(new Event('focus'));return !qa.get('metric-box-tooltip').hidden && qa.get('metric-box-tooltip').querySelectorAll('tbody tr').length===4})()`);
  await check('panel help opens and closes',`(()=>{let b=document.querySelector('.method-help-button');b.click();let p=document.getElementById(b.getAttribute('popovertarget'));let open=p.matches(':popover-open');p.querySelector('.panel-help-close').click();return open&&!p.matches(':popover-open')})()`);
  await check('independent regional selection',`(()=>{document.querySelector('.region-only').click();return qa.rows()===185&&qa.points()===17})()`);
  await check('visual to table link',`(()=>{qa.change('filter-link-mode','visual');return qa.rows()===17})()`);
  await check('map selects table and XY',`(()=>{let d=document.querySelector('.scatter-mark:not(.is-filtered)');qa.get(d.dataset.unitId).dispatchEvent(new MouseEvent('click',{bubbles:true}));return qa.rows()===1&&document.querySelector('.scatter-panel .readout-scope').textContent.includes(document.querySelector('#municipality-table tbody .row-name').textContent)})()`).catch(async e=>{console.log('Selection state:',await evaluate(`JSON.stringify({rows:qa.rows(),scope:document.querySelector('.scatter-panel .readout-scope').textContent})`));throw e;});
  await evaluate(`qa.change('filter-link-mode','none');qa.get('select-all-regions').click();qa.get('clear-table-filters').click();`);
  await check('table to visuals link',`(()=>{qa.change('filter-link-mode','table');document.querySelector('#municipality-table tbody input[type=checkbox]').click();return qa.points()===1})()`);
  await evaluate(`qa.get('clear-table-filters').click();qa.change('filter-link-mode','none');`);
  await check('XY range zoom',`(()=>{let c=qa.get('scatter-x-min');c.value=20;c.dispatchEvent(new Event('input',{bubbles:true}));return +c.value===20})()`);
  await check('XY selection preserves zoom', `(() => {
    const clip = document.querySelector('#scatter-plot-clip rect');
    const left = +clip.getAttribute('x'), right = left + +clip.getAttribute('width');
    const dot = [...document.querySelectorAll('.scatter-mark:not(.is-filtered)')]
      .find(dot => +dot.getAttribute('cx') > left && +dot.getAttribute('cx') < right);
    if (!dot) return false;
    dot.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    if (+qa.get('scatter-x-min').value !== 20) return false;
    qa.change('filter-link-mode', 'visual');
    dot.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    const preserved = +qa.get('scatter-x-min').value === 20;
    qa.change('filter-link-mode', 'none');
    return preserved;
  })()`);
  await check('XY follows a map selection without changing zoom', `(() => {
    const clip = document.querySelector('#scatter-plot-clip rect');
    const left = +clip.getAttribute('x'), right = left + +clip.getAttribute('width');
    const dot = [...document.querySelectorAll('.scatter-mark:not(.is-filtered)')]
      .find(dot => qa.get(dot.dataset.unitId) && +dot.getAttribute('cx') < left);
    if (!dot) return false;
    const before = +qa.get('scatter-x-max').value - +qa.get('scatter-x-min').value;
    qa.get(dot.dataset.unitId).dispatchEvent(new MouseEvent('click', {bubbles: true}));
    const after = +qa.get('scatter-x-max').value - +qa.get('scatter-x-min').value;
    const x = +dot.getAttribute('cx');
    return before === after && x >= left && x <= right;
  })()`);
  await check('XY metric resets zoom',`(()=>{qa.change('scatter-x','population');return +qa.get('scatter-x-min').value===0&&+qa.get('scatter-x-max').value===100})()`);
  await check('regional keyboard zoom and reset',`(()=>{let h=document.querySelector('[data-bound=end]');h.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));let zoom=h.getAttribute('aria-valuenow')==='99';document.querySelector('.region-box-reset-zoom').click();return zoom&&h.getAttribute('aria-valuenow')==='100'})()`);
  await check('legend filter',`(()=>{let cell=document.querySelector('.map-numeric-legend td[data-filter-kind=cell]');cell.click();return qa.points()<185})()`);
  await evaluate(`qa.change('map-color','averageNetWage2025');qa.change('region-box-y','turnout');qa.change('scatter-size','population');document.querySelector('.region-only').click();qa.change('filter-link-mode','visual');`);
  await reload();
  await check('preferences restore',`document.getElementById('map-color').value==='averageNetWage2025' && document.getElementById('region-box-y').value==='turnout' && document.getElementById('scatter-size').value==='population' && document.getElementById('filter-link-mode').value==='visual' && document.querySelectorAll('#municipality-table tbody tr').length===17`);
  await evaluate(`localStorage.clear()`); await reload();
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await check('mobile help within viewport',`(()=>{let b=document.querySelector('.method-help-button');b.click();let p=document.getElementById(b.getAttribute('popovertarget'));return new Promise(r=>requestAnimationFrame(()=>{let rect=p.getBoundingClientRect();r(rect.left>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight)}))})()`);
  await evaluate(`document.querySelectorAll(':popover-open').forEach(p => p.hidePopover())`);
  await check('all column tooltips fit the mobile viewport', `(() => {
    const viewport = document.documentElement;
    for (const trigger of document.querySelectorAll('[aria-describedby^="column-help-"]')) {
      trigger.scrollIntoView({block: 'center', inline: 'nearest'});
      trigger.dispatchEvent(new Event('focus'));
      const popup = document.getElementById(trigger.getAttribute('aria-describedby'));
      const rect = popup.getBoundingClientRect();
      if (!popup.matches(':popover-open') || rect.left < 8 || rect.right > viewport.clientWidth - 8
        || rect.top < 8 || rect.bottom > viewport.clientHeight - 8) throw new Error(JSON.stringify({id: popup.id, rect: rect.toJSON(), width: viewport.clientWidth, height: viewport.clientHeight}));
    }
    return true;
  })()`);
  await cdp('Emulation.setDeviceMetricsOverride', {width: 320, height: 480, deviceScaleFactor: 1, mobile: false});
  await check('open column tooltip follows viewport resize', `new Promise(resolve => requestAnimationFrame(() => {
    const rect = document.querySelector('.column-help-popover:popover-open').getBoundingClientRect();
    resolve(rect.left >= 8 && rect.right <= document.documentElement.clientWidth - 8
      && rect.top >= 8 && rect.bottom <= document.documentElement.clientHeight - 8);
  }))`);
  await check('column tooltip stays visible when table is scrolled', `new Promise(resolve => {
    window.scrollBy(0, 250);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const rect = document.querySelector('.column-help-popover:popover-open').getBoundingClientRect();
      resolve(rect.left >= 8 && rect.right <= document.documentElement.clientWidth - 8
        && rect.top >= 8 && rect.bottom <= document.documentElement.clientHeight - 8);
    }));
  })`);
}
