(() => {
  'use strict';
  window.initializeHelpPopovers = () => {
    const get = id => document.getElementById(id);
    for (const header of document.querySelectorAll('.panel-header')) {
      const help = header.querySelector('.method-help');
      if (help) {
        header.classList.add('has-panel-help');
        header.append(help);
      }
    }
    const helpPairs = [];
    for (const help of document.querySelectorAll('.method-help')) {
      const button = help.querySelector('.method-help-button');
      const popup = help.querySelector('.method-tooltip');
      if (!button || !popup) continue;
      popup.className = 'panel-help-popover';
      popup.setAttribute('popover', 'auto');
      popup.setAttribute('role', 'dialog');
      popup.setAttribute('aria-label', button.getAttribute('aria-label'));
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'panel-help-close';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Zatvori objašnjenje');
      close.addEventListener('click', () => popup.hidePopover());
      popup.prepend(close);
      document.body.append(popup);
      button.setAttribute('popovertarget', popup.id);
      helpPairs.push([button, popup]);
    }
    helpPairs.push([document.querySelector('.scatter-zoom-help-button'), get('scatter-zoom-help')]);
    const positionHelp = (button, popup) => {
      if (!popup.matches(':popover-open')) return;
      const bounds = button.getBoundingClientRect();
      const left = Math.max(8, Math.min(innerWidth - popup.offsetWidth - 8, bounds.right - popup.offsetWidth));
      const top = bounds.bottom + 8 + popup.offsetHeight <= innerHeight - 8
        ? bounds.bottom + 8 : Math.max(8, bounds.top - popup.offsetHeight - 8);
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
    };
    for (const [button, popup] of helpPairs) {
      popup.addEventListener('toggle', () => {
        button.setAttribute('aria-expanded', String(popup.matches(':popover-open')));
        positionHelp(button, popup);
      });
      button.setAttribute('aria-expanded', 'false');
    }
    window.addEventListener('resize', () => helpPairs.forEach(([button, popup]) => positionHelp(button, popup)));
    window.addEventListener('scroll', () => helpPairs.forEach(([button, popup]) => positionHelp(button, popup)), {passive: true});
  };
})();
