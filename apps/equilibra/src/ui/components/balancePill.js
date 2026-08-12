import { h } from '../../utils/dom.js';
import { formatSignedCents } from '../../logic/money.js';

export function balancePillNode(balanceCents, { threshold = 50 } = {}) {
  let mood = 'zero';
  if (balanceCents > threshold) mood = 'positive';
  else if (balanceCents < -threshold) mood = 'negative';

  const arrow = mood === 'positive' ? '▲' : mood === 'negative' ? '▼' : '●';
  return h('span', { className: `balance-pill ${mood}` }, [
    h('span', { className: 'arrow', 'aria-hidden': 'true' }, arrow),
    formatSignedCents(balanceCents),
  ]);
}
