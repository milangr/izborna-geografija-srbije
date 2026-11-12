export async function runScenarios({evaluate, cdp, reload}) {
  const check = async (name, expression) => {
    if (!await evaluate(expression)) throw new Error(name);
    console.log("PASS " + name);
  };
  await evaluate(`window.qa={get:id=>document.getElementById(id),change(id,value){let c=this.get(id);c.value=value;c.dispatchEvent(new Event('change',{bubbles:true}));},rows:()=>document.querySelectorAll('#municipality-table tbody tr').length,points:()=>document.querySelectorAll('.scatter-mark:not(.is-filtered)').length};`);
  await check('185 rows and points',`qa.rows()===185 && qa.points()===185`);
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
