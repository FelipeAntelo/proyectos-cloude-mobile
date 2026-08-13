import { h } from '../../utils/dom.js';
import { formatCents } from '../../logic/money.js';
import { describeBalance } from '../../logic/wording.js';

const CSS_MOOD = { favor: 'positive', pending: 'negative', even: 'zero' };

/** "Bs 36.67 a favor" / "Bs 18.33 pendientes" / "Al día", en una sola línea compacta y coloreada. */
export function balanceAmountNode(balanceCents) {
  const d = describeBalance(balanceCents);
  const mood = CSS_MOOD[d.kind];
  const text = d.kind === 'even' ? 'Al día' : `${formatCents(d.amountCents)} ${d.kind === 'favor' ? 'a favor' : 'pendientes'}`;
  return h('span', { className: `balance-amount balance-label-${mood}` }, text);
}

/** Etiqueta corta y sola: "Saldo a favor" / "Aporte pendiente" / "Al día". */
export function balanceLabelNode(balanceCents, { className = 'faint' } = {}) {
  const d = describeBalance(balanceCents);
  return h('span', { className: `${className} balance-label-${CSS_MOOD[d.kind]}` }, d.title);
}
