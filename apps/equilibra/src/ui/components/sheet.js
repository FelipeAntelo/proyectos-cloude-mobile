import { h, mount, clear } from '../../utils/dom.js';
import { icon } from './icons.js';

const root = () => document.getElementById('sheet-root');

let closeCurrent = null;

export function openSheet(titleText, contentNode, { onClose, ariaLabel } = {}) {
  closeSheet();

  const overlay = h(
    'div',
    { className: 'sheet-overlay', onClick: (e) => { if (e.target === overlay) closeSheet(); } },
    [
      h('div', { className: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': ariaLabel || titleText || 'Panel' }, [
        h('div', { className: 'sheet-grabber' }),
        titleText
          ? h('div', { className: 'sheet-header' }, [
              h('h2', {}, titleText),
              h('button', { className: 'icon-btn', 'aria-label': 'Cerrar', onClick: () => closeSheet() }, [icon('close', { size: 'sm' })]),
            ])
          : null,
        contentNode,
      ]),
    ]
  );

  mount(root(), overlay);
  document.body.style.overflow = 'hidden';

  closeCurrent = () => {
    clear(root());
    document.body.style.overflow = '';
    if (onClose) onClose();
    closeCurrent = null;
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') closeSheet();
  };
  document.addEventListener('keydown', escHandler, { once: true });
}

export function closeSheet() {
  if (closeCurrent) closeCurrent();
}
