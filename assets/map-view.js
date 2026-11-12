(() => {
  'use strict';
  window.createMapView = ({map, stage, byId, selectedRegions, isVisible, getSelected, onChoose, onHover,
    wheelScale, touchPair}) => {
    const get = id => document.getElementById(id);
    const hoverOutline = map.querySelector('.hover-outline');
    const tooltip = stage.querySelector('.map-tooltip');
    const beogradShapeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    beogradShapeGroup.classList.add('beograd-shapes');
    for (const shape of window.beogradShapes) {
      const unit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      unit.id = shape.id;
      unit.setAttribute('d', shape.path);
      unit.classList.add('unit');
      unit.dataset.unit = '';
      beogradShapeGroup.append(unit);
      const texture = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      texture.id = shape.id + '-texture';
      texture.classList.add('texture');
      texture.setAttribute('d', shape.path);
      beogradShapeGroup.append(texture);
    }
    const kosovoShapeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    kosovoShapeGroup.classList.add('kosovo-shapes');
    for (const shape of window.kosovoShapes) {
      const unit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      unit.setAttribute('d', shape.path);
      unit.classList.add('unit', 'missing');
      if (shape.id) {
        unit.id = shape.id;
        unit.dataset.unit = '';
      } else {
        unit.classList.add('unreported');
      }
      kosovoShapeGroup.append(unit);
      if (shape.id) {
        const texture = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        texture.id = shape.id + '-texture';
        texture.classList.add('texture');
        texture.setAttribute('d', shape.path);
        kosovoShapeGroup.append(texture);
      }
    }
    const outlineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    outlineGroup.classList.add('region-outlines');
    const kosovoBase = map.querySelector('.unit.missing');
    for (const [code, path] of Object.entries({...window.regionOutlines, RS23: kosovoBase.getAttribute('d')})) {
      const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      outline.classList.add('region-outline');
      outline.dataset.region = code;
      outline.setAttribute('d', path);
      outlineGroup.append(outline);
    }
    map.insertBefore(outlineGroup, hoverOutline);
    map.insertBefore(kosovoShapeGroup, outlineGroup);
    map.insertBefore(beogradShapeGroup, outlineGroup);
    get('rs-municipality-23-texture').remove();
    get('rs-municipality-23').remove();
    for (const unit of map.querySelectorAll('.beograd-shapes [data-unit], .kosovo-shapes [data-unit]')) {
      const bounds = unit.getBBox();
      unit.dataset.x = bounds.x + bounds.width / 2;
      unit.dataset.y = bounds.y + bounds.height / 2;
    }
    const patterns = map.querySelectorAll('pattern[data-map-pattern]');
    const [,, width, height] = map.getAttribute('viewBox').split(' ').map(Number);
    const maxMapZoom = 12;
    let scale = 1, left = 0, top = 0;
    let drag = null, mapPinch = null, ignoreMapClickUntil = 0;
    function hideTooltip() { tooltip.hidden = true; onHover(null); }
    function updateView(nextScale, x, y) {
      scale = Math.max(1, Math.min(maxMapZoom, nextScale));
      left = Math.max(0, Math.min(width - width / scale, x - width / (2 * scale)));
      top = Math.max(0, Math.min(height - height / scale, y - height / (2 * scale)));
      map.setAttribute('viewBox', [left, top, width / scale, height / scale].join(' '));
      map.classList.toggle('is-zoomed', scale > 1);
      get('map-zoom-in').disabled = scale >= maxMapZoom;
      get('map-zoom-out').disabled = scale <= 1;
      for (const pattern of patterns) pattern.setAttribute('patternTransform', 'scale(' + 1 / scale + ')');
      hideTooltip();
    }

    function zoom(factor) {
      const selected = getSelected();
      const x = selected ? Number(selected.dataset.x) : left + width / (2 * scale);
      const y = selected ? Number(selected.dataset.y) : top + height / (2 * scale);
      updateView(scale * factor, x, y);
    }

    for (const [id, factor] of [['map-zoom-in', 1.6], ['map-zoom-out', 1 / 1.6]])
      get(id).addEventListener('click', () => zoom(factor));

    map.addEventListener('touchstart', event => {
      if (event.touches.length !== 2) return;
      const pair = touchPair(event.touches);
      const transform = map.getScreenCTM();
      if (!transform || !pair.distance) return;
      mapPinch = {...pair, scale, anchor: new DOMPoint(pair.x, pair.y).matrixTransform(transform.inverse())};
      drag = null;
      ignoreMapClickUntil = Date.now() + 500;
    }, {passive: true});
    map.addEventListener('touchmove', event => {
      if (!mapPinch || event.touches.length !== 2) return;
      event.preventDefault();
      const pair = touchPair(event.touches);
      const next = Math.max(1, Math.min(maxMapZoom, mapPinch.scale * pair.distance / mapPinch.distance));
      const bounds = map.getBoundingClientRect();
      const pixelsPerUnit = map.getScreenCTM().a * next / scale;
      updateView(next, mapPinch.anchor.x + (bounds.left + bounds.width / 2 - pair.x) / pixelsPerUnit,
        mapPinch.anchor.y + (bounds.top + bounds.height / 2 - pair.y) / pixelsPerUnit);
      ignoreMapClickUntil = Date.now() + 500;
    }, {passive: false});
    for (const type of ['touchend', 'touchcancel'])
      map.addEventListener(type, event => { if (event.touches.length < 2) mapPinch = null; });

    map.addEventListener('wheel', event => {
      if (event.ctrlKey) return;
      const next = wheelScale(event, scale, maxMapZoom);
      if (next === scale) return;
      const transform = map.getScreenCTM();
      if (!transform) return;
      event.preventDefault();
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
      updateView(next, point.x + (width / 2 - (point.x - left) * scale) / next,
        point.y + (height / 2 - (point.y - top) * scale) / next);
    }, {passive: false});


    map.addEventListener('click', event => {
      if (drag?.moved || Date.now() < ignoreMapClickUntil) return;
      const unit = event.target.closest('[data-unit]');
      onChoose(unit);
      if (!unit) hideTooltip();
    });

    function showTooltip(event) {
      const unit = event.target.closest('[data-unit]');
      const entry = byId.get(unit?.id);
      if (!entry || !isVisible(entry.id) || event.pointerType === 'touch' || drag?.moved) {
        hideTooltip();
        return;
      }
      tooltip.textContent = entry.name;
      onHover(entry);
      tooltip.hidden = false;
      const bounds = stage.getBoundingClientRect();
      const x = Math.max(6, Math.min(event.clientX - bounds.left + 12, bounds.width - tooltip.offsetWidth - 6));
      const above = event.clientY - bounds.top - tooltip.offsetHeight - 10;
      const y = above > 6 ? above : event.clientY - bounds.top + 16;
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    }

    map.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left, top, moved: false};
    });
    map.addEventListener('pointermove', event => {
      if (mapPinch) return;
      if (!drag || event.pointerId !== drag.id || !event.buttons || scale === 1) {
        if (!event.buttons) drag = null;
        showTooltip(event);
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        map.setPointerCapture(event.pointerId);
        map.classList.add('is-dragging');
      }
      const unitsPerPixel = 1 / map.getScreenCTM().a;
      updateView(scale, drag.left + width / (2 * scale) - dx * unitsPerPixel,
        drag.top + height / (2 * scale) - dy * unitsPerPixel);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      map.addEventListener(type, () => map.classList.remove('is-dragging'));
    }
    map.addEventListener('pointerleave', hideTooltip);

    function fitSelectedRegions() {
      const bounds = [...outlineGroup.children]
        .filter(outline => selectedRegions.has(outline.dataset.region))
        .map(outline => outline.getBBox())
        .filter(box => box.width > 0 && box.height > 0);
      if (!bounds.length) {
        updateView(1, width / 2, height / 2);
        return;
      }
      const minX = Math.min(...bounds.map(box => box.x));
      const minY = Math.min(...bounds.map(box => box.y));
      const maxX = Math.max(...bounds.map(box => box.x + box.width));
      const maxY = Math.max(...bounds.map(box => box.y + box.height));
      const padding = 1.16;
      const fittedScale = Math.min(width / ((maxX - minX) * padding),
        height / ((maxY - minY) * padding), maxMapZoom);
      updateView(fittedScale, (minX + maxX) / 2, (minY + maxY) / 2);
    }
    return {outlineGroup, patterns, hideTooltip, zoom, fitSelectedRegions,
      get scale() { return scale; }};
  };
})();
