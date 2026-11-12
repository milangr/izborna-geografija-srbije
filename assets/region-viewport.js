(() => {
  'use strict';
  window.createRegionViewport = ({axisBody, grid, hideGuide, onChange}) => {
    let viewStart = 0;
    let viewEnd = 1;
    const resetZoom = document.createElement('button');
    resetZoom.type = 'button';
    resetZoom.className = 'region-box-reset-zoom';
    resetZoom.textContent = '↺';
    resetZoom.title = 'Reset zuma: prikaži puni raspon Y ose';
    resetZoom.setAttribute('aria-label', resetZoom.title);
    resetZoom.addEventListener('click', () => setWindow(0, 1));
    axisBody.append(resetZoom);
    const slider = document.createElement('div');
    slider.className = 'region-bars-y-slider';
    slider.setAttribute('role', 'group');
    slider.setAttribute('aria-label', 'Vidljivi raspon Y ose');
    const selection = document.createElement('div');
    selection.className = 'region-bars-y-selection';
    selection.tabIndex = 0;
    selection.setAttribute('role', 'button');
    selection.setAttribute('aria-label', 'Pomjeri vidljivi raspon Y ose');
    selection.title = 'Povuci za pomjeranje; dvostruki klik vraća puni raspon';
    const upperHandle = document.createElement('div');
    upperHandle.className = 'region-bars-y-handle';
    upperHandle.dataset.bound = 'end';
    const lowerHandle = document.createElement('div');
    lowerHandle.className = 'region-bars-y-handle';
    lowerHandle.dataset.bound = 'start';
    for (const [handle, label] of [[upperHandle, 'Gornja granica Y ose'], [lowerHandle, 'Donja granica Y ose']]) {
      handle.tabIndex = 0;
      handle.setAttribute('role', 'slider');
      handle.setAttribute('aria-label', label);
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-valuemin', '0');
      handle.setAttribute('aria-valuemax', '100');
    }
    slider.append(selection, upperHandle, lowerHandle);
    axisBody.append(slider);
    const updateSlider = () => {
      selection.style.top = (100 * (1 - viewEnd)) + '%';
      selection.style.bottom = (100 * viewStart) + '%';
      upperHandle.style.top = (100 * (1 - viewEnd)) + '%';
      lowerHandle.style.top = (100 * (1 - viewStart)) + '%';
      upperHandle.setAttribute('aria-valuenow', String(Math.round(viewEnd * 100)));
      lowerHandle.setAttribute('aria-valuenow', String(Math.round(viewStart * 100)));
    };
    const setWindow = (start, end) => {
      viewStart = Math.max(0, Math.min(start, end - .05));
      viewEnd = Math.min(1, Math.max(end, viewStart + .05));
      onChange();
    };
    let drag = null;
    let plotDrag = null;
    let ignoreClickUntil = 0;
    window.addEventListener('pointermove', event => {
      if (!plotDrag || event.pointerId !== plotDrag.id || !(event.buttons & 1)) return;
      const delta = event.clientY - plotDrag.y;
      if (!plotDrag.moved && Math.abs(delta) < 4) return;
      plotDrag.moved = true;
      grid.classList.add('is-panning');
      hideGuide();
      const span = plotDrag.end - plotDrag.start;
      const start = Math.max(0, Math.min(1 - span, plotDrag.start + delta / plotDrag.height * span));
      setWindow(start, start + span);
    });
    for (const type of ['pointerup', 'pointercancel']) {
      window.addEventListener(type, event => {
        if (plotDrag?.id !== event.pointerId) return;
        if (plotDrag.moved) ignoreClickUntil = Date.now() + 300;
        plotDrag = null;
        grid.classList.remove('is-panning');
      });
    }
    slider.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.region-bars-y-handle');
      drag = {id: event.pointerId, mode: handle?.dataset.bound || (event.target === selection ? 'pan' : 'jump'),
        y: event.clientY, start: viewStart, end: viewEnd, height: slider.getBoundingClientRect().height};
      if (drag.mode === 'jump') {
        const fraction = 1 - (event.clientY - slider.getBoundingClientRect().top) / drag.height;
        drag.mode = Math.abs(fraction - viewStart) < Math.abs(fraction - viewEnd) ? 'start' : 'end';
      }
      slider.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    slider.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const delta = (drag.y - event.clientY) / drag.height;
      if (drag.mode === 'start') setWindow(Math.max(0, Math.min(drag.end - .05, drag.start + delta)), drag.end);
      else if (drag.mode === 'end') setWindow(drag.start, Math.max(drag.start + .05, Math.min(1, drag.end + delta)));
      else {
        const span = drag.end - drag.start;
        const start = Math.max(0, Math.min(1 - span, drag.start + delta));
        setWindow(start, start + span);
      }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      slider.addEventListener(type, () => { drag = null; });
    slider.addEventListener('dblclick', () => setWindow(0, 1));
    for (const handle of [upperHandle, lowerHandle]) {
      handle.addEventListener('keydown', event => {
        const step = event.key === 'PageUp' || event.key === 'PageDown' ? .1 : .01;
        const delta = ['ArrowUp', 'PageUp'].includes(event.key) ? step
          : ['ArrowDown', 'PageDown'].includes(event.key) ? -step : null;
        if (delta === null && !['Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (handle === lowerHandle) setWindow(event.key === 'Home' ? 0 : event.key === 'End' ? viewEnd - .05 : viewStart + delta, viewEnd);
        else setWindow(viewStart, event.key === 'End' ? 1 : event.key === 'Home' ? viewStart + .05 : viewEnd + delta);
      });
    }
    selection.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const span = viewEnd - viewStart;
      const start = Math.max(0, Math.min(1 - span, viewStart + (event.key === 'ArrowUp' ? .05 : -.05)));
      setWindow(start, start + span);
    });
    function bindPlot(svg) {
        svg.addEventListener('pointerdown', event => {
          if (event.button !== 0 || event.pointerType === 'touch' || viewEnd - viewStart >= .99999) return;
          plotDrag = {id: event.pointerId, y: event.clientY, start: viewStart, end: viewEnd, height: 280, moved: false};
          event.preventDefault();
        });
        svg.addEventListener('wheel', event => {
          if (event.ctrlKey) return;
          const span = viewEnd - viewStart;
          const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
          const nextSpan = Math.max(.05, Math.min(1, span * Math.exp(delta * .002)));
          if (Math.abs(nextSpan - span) < 1e-6) return;
          event.preventDefault();
          const bounds = svg.getBoundingClientRect();
          const fraction = Math.max(0, Math.min(1, (event.clientY - bounds.top - 38) / 280));
          const anchor = viewEnd - fraction * span;
          const start = Math.max(0, Math.min(1 - nextSpan, anchor - (1 - fraction) * nextSpan));
          setWindow(start, start + nextSpan);
        }, {passive: false});
    }
    return {setWindow, updateSlider, bindPlot,
      get viewStart() { return viewStart; }, get viewEnd() { return viewEnd; },
      get isDragging() { return Boolean(plotDrag?.moved); },
      get ignoreClick() { return Date.now() < ignoreClickUntil; },
      reset() { viewStart = 0; viewEnd = 1; plotDrag = null; grid.classList.remove('is-panning'); },
    };
  };
})();
