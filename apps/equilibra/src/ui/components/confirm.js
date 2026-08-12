import { h } from '../../utils/dom.js';
import { openSheet, closeSheet } from './sheet.js';

/** @returns {Promise<boolean>} */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = true }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      closeSheet();
    };

    const content = h('div', {}, [
      h('p', { className: 'muted' }, message),
      h('div', { className: 'confirm-actions' }, [
        h('button', { className: 'btn btn-secondary', onClick: () => finish(false) }, 'Cancelar'),
        h('button', { className: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => finish(true) }, confirmLabel),
      ]),
    ]);

    openSheet(title, content, { onClose: () => finish(false) });
  });
}
