import { h } from '../../utils/dom.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { icon } from '../components/icons.js';
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
      [icon('receipt', { size: 'sm' }), 'Registrar compra']
    ),
    h(
      'button',
      {
        className: 'btn btn-secondary btn-block',
        onClick: () => { closeSheet(); setTimeout(openAddSettlement, 180); },
      },
      [icon('transfer', { size: 'sm' }), 'Transferencia entre personas']
    ),
  ]);

  openSheet('¿Qué querés registrar?', content);
}
