import { h, mount, clear } from '../../utils/dom.js';

let timeoutId = null;

export function showToast(message) {
  const rootEl = document.getElementById('toast-root');
  clear(rootEl);
  if (timeoutId) clearTimeout(timeoutId);

  mount(rootEl, h('div', { className: 'toast', role: 'status' }, message));

  timeoutId = setTimeout(() => clear(rootEl), 2400);
}
