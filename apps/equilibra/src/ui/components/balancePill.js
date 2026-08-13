import { h } from '../../utils/dom.js';
import { formatCents } from '../../logic/money.js';
import { describeBalance } from '../../logic/wording.js';

const CSS_MOOD = { favor: 'positive', pending: 'negative', even: 'zero' };
const ICON = { favor: '▲', pending: '▼', even: '●' };

/** Pill compacta con el MONTO (sin +/-): "▲ Bs 36.67" / "▼ Bs 18.33" / "● Al día". */
export function balancePillNode(balanceCents) {
  const d = describeBalance(balanceCents);
  const mood = CSS_MOOD[d.kind];
  return h('span', { className: `balance-pill ${mood}` }, [
    h('span', { className: 'arrow', 'aria-hidden': 'true' }, ICON[d.kind]),
    d.kind === 'even' ? 'Al día' : formatCents(d.amountCents),
  ]);
}

/** Etiqueta corta en lenguaje llano: "Saldo a favor" / "Aporte pendiente" / "Al día". */
export function balanceLabelNode(balanceCents, { className = 'name-sub' } = {}) {
  const d = describeBalance(balanceCents);
  return h('span', { className: `${className} balance-label-${CSS_MOOD[d.kind]}` }, d.title);
}
