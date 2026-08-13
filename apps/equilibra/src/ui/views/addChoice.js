import { h } from '../../utils/dom.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { openAddPurchase } from './addPurchase.js';
import { openAddSettlement } from './addSettlement.js';

export function openAddChoice() {
  const content = h('div', { className: 'stack-12' }, [
    h(
      'button',
      {
        className: 'btn btn-primary btn-block',
        onClick: () => { closeSheet(); setTimeout(openAddPurchase, 180); },
      },
      '🧾 Registrar compra'
    ),
    h(
      'button',
      {
        className: 'btn btn-secondary btn-block',
        onClick: () => { closeSheet(); setTimeout(openAddSettlement, 180); },
      },
      '⇄ Transferencia entre personas'
    ),
  ]);

  openSheet('¿Qué querés registrar?', content);
}
