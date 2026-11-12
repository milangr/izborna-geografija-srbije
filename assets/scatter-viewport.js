(() => {
  'use strict';
  window.createScatterViewport = ({svg, zoom, touchPair, wheelScale, getPlot, draw, hideTooltip}) => {
    let chartScaleX = 1;
    let chartScaleY = 1;
    let chartLeft = 0;
    let chartTop = 0;
    let chartDrag = null;
    let chartPinch = null;
    let ignoreChartClickUntil = 0;
    function resetView() {
      chartScaleX = 1;
      chartScaleY = 1;
      chartLeft = 0;
      chartTop = 0;
      syncZoomControls();
      chartDrag = null;
      chartPinch = null;
      svg.classList.remove('is-dragging');
      hideTooltip();
    }


    function plotPoint(event) {
      if (!getPlot()) return null;
      const bounds = svg.getBoundingClientRect();
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      return x >= getPlot().left && x <= getPlot().right && y >= getPlot().top && y <= getPlot().bottom ? {x, y} : null;
    }

    function moveChart(left, top) {
      chartLeft = Math.max(0, Math.min(1 - 1 / chartScaleX, left));
      chartTop = Math.max(0, Math.min(1 - 1 / chartScaleY, top));
      syncZoomControls();
      hideTooltip();
      draw();
    }

    svg.addEventListener('touchstart', event => {
      if (event.touches.length !== 2 || !getPlot()) return;
      const pair = touchPair(event.touches);
      if (!pair.distance) return;
      const bounds = svg.getBoundingClientRect();
      const fractionX = Math.max(0, Math.min(1, (pair.x - bounds.left - getPlot().left) / (getPlot().right - getPlot().left)));
      const fractionY = Math.max(0, Math.min(1, (pair.y - bounds.top - getPlot().top) / (getPlot().bottom - getPlot().top)));
      chartPinch = {distance: pair.distance, scaleX: chartScaleX, scaleY: chartScaleY,
        anchorX: chartLeft + fractionX / chartScaleX, anchorY: chartTop + fractionY / chartScaleY};
      chartDrag = null;
      ignoreChartClickUntil = Date.now() + 500;
    }, {passive: true});
    svg.addEventListener('touchmove', event => {
      if (!chartPinch || event.touches.length !== 2) return;
      event.preventDefault();
      const pair = touchPair(event.touches);
      const bounds = svg.getBoundingClientRect();
      const fractionX = Math.max(0, Math.min(1, (pair.x - bounds.left - getPlot().left) / (getPlot().right - getPlot().left)));
      const fractionY = Math.max(0, Math.min(1, (pair.y - bounds.top - getPlot().top) / (getPlot().bottom - getPlot().top)));
      chartScaleX = Math.max(1, Math.min(20, chartPinch.scaleX * pair.distance / chartPinch.distance));
      chartScaleY = Math.max(1, Math.min(20, chartPinch.scaleY * pair.distance / chartPinch.distance));
      moveChart(chartPinch.anchorX - fractionX / chartScaleX,
        chartPinch.anchorY - fractionY / chartScaleY);
      ignoreChartClickUntil = Date.now() + 500;
    }, {passive: false});
    for (const type of ['touchend', 'touchcancel'])
      svg.addEventListener(type, event => { if (event.touches.length < 2) chartPinch = null; });

    function syncZoomControls() {
      for (const [bounds, min, max] of [
        [zoom.x, chartLeft * 100, (chartLeft + 1 / chartScaleX) * 100],
        [zoom.y, (1 - chartTop - 1 / chartScaleY) * 100, (1 - chartTop) * 100],
      ]) {
        bounds.min.value = Math.round(min * 2) / 2;
        bounds.max.value = Math.round(max * 2) / 2;
        bounds.min.parentElement.style.setProperty('--range-start', min + '%');
        bounds.min.parentElement.style.setProperty('--range-end', max + '%');
      }
    }

    for (const [dimension, bounds] of Object.entries(zoom)) {
      for (const handle of [bounds.min, bounds.max]) {
        handle.addEventListener('input', () => {
          let min = Number(bounds.min.value);
          let max = Number(bounds.max.value);
          if (max - min < 5) {
            if (handle === bounds.min) min = max - 5;
            else max = min + 5;
            handle.value = handle === bounds.min ? min : max;
          }
          const scale = 100 / (max - min);
          if (dimension === 'x') {
            chartScaleX = scale;
            chartLeft = min / 100;
          } else {
            chartScaleY = scale;
            chartTop = (100 - max) / 100;
          }
          syncZoomControls();
          hideTooltip();
          draw();
        });
      }
    }

    svg.addEventListener('wheel', event => {
      if (event.ctrlKey) return;
      const point = plotPoint(event);
      const nextX = wheelScale(event, chartScaleX, 20);
      const nextY = wheelScale(event, chartScaleY, 20);
      if (!point || (nextX === chartScaleX && nextY === chartScaleY)) return;
      event.preventDefault();
      const differenceX = 1 / chartScaleX - 1 / nextX;
      const differenceY = 1 / chartScaleY - 1 / nextY;
      chartScaleX = nextX;
      chartScaleY = nextY;
      moveChart(chartLeft + (point.x - getPlot().left) / (getPlot().right - getPlot().left) * differenceX,
        chartTop + (point.y - getPlot().top) / (getPlot().bottom - getPlot().top) * differenceY);
    }, {passive: false});

    svg.addEventListener('pointerdown', event => {
      chartDrag = null;
      if ((chartScaleX === 1 && chartScaleY === 1) || event.button !== 0 || !plotPoint(event)) return;
      chartDrag = {id: event.pointerId, x: event.clientX, y: event.clientY,
        left: chartLeft, top: chartTop, moved: false};
    });

    function dragChart(event) {
      if (chartPinch) return false;
      if (!chartDrag || event.pointerId !== chartDrag.id || !(event.buttons & 1) || (chartScaleX === 1 && chartScaleY === 1)) return false;
      const dx = event.clientX - chartDrag.x;
      const dy = event.clientY - chartDrag.y;
      if (!chartDrag.moved && Math.hypot(dx, dy) < 5) return false;
      if (!chartDrag.moved) {
        chartDrag.moved = true;
        svg.setPointerCapture(event.pointerId);
        svg.classList.add('is-dragging');
      }
      moveChart(chartDrag.left - dx / ((getPlot().right - getPlot().left) * chartScaleX),
        chartDrag.top - dy / ((getPlot().bottom - getPlot().top) * chartScaleY));
      return true;
    }

    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      svg.addEventListener(type, () => svg.classList.remove('is-dragging'));
    }
    function consumeClick() {
      if (Date.now() < ignoreChartClickUntil) return true;
      if (!chartDrag?.moved) return false;
      chartDrag = null;
      return true;
    }
    return {resetView, plotPoint, dragChart, consumeClick,
      get chartScaleX() { return chartScaleX; }, get chartScaleY() { return chartScaleY; },
      get chartLeft() { return chartLeft; }, get chartTop() { return chartTop; }};
  };
})();
