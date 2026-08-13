import { h } from '../../utils/dom.js';
import { getState } from '../../state/store.js';
import { formatCents, parseAmountToCents } from '../../logic/money.js';
import { equilibriumScore } from '../../logic/equilibrium.js';
import { recommendNextPayer } from '../../logic/recommendation.js';
import { filterByPeriod } from '../../logic/period.js';
import { describeBalance } from '../../logic/wording.js';
import { avatarNode } from '../components/avatar.js';
import { balancePillNode, balanceLabelNode } from '../components/balancePill.js';
import { openSheet } from '../components/sheet.js';
import { openAddPurchase } from './addPurchase.js';

export function renderHome() {
  const state = getState();
  const activePeople = state.people.filter((p) => p.active);
  const balances = state.balances;

  const monthPurchases = filterByPeriod(state.purchases, 'month');
  const monthTotalCents = monthPurchases.reduce((sum, p) => sum + p.amountCents, 0);
  const score = equilibriumScore(balances, activePeople.map((p) => p.id));

  if (activePeople.length === 0) {
    return h('div', { className: 'screen' }, [
      h('div', { className: 'topbar' }, [h('h1', { className: 'page-title' }, 'Equilibra')]),
      emptyState('👋', 'Sumá a tu equipo', 'Andá a "Grupo" para agregar compañeros y empezar a registrar gastos.'),
    ]);
  }

  const screen = h('div', { className: 'screen' }, [
    h('div', { className: 'topbar' }, [
      h('h1', { className: 'page-title' }, 'Equilibra'),
      h('a', { className: 'icon-btn', href: '#/settings', 'aria-label': 'Ajustes' }, '⚙️'),
    ]),

    h('div', { className: 'stat-grid' }, [
      statTile(formatCents(monthTotalCents), 'Gasto este mes'),
      statTile(String(monthPurchases.length), 'Compras este mes'),
      statTile(String(activePeople.length), 'Personas activas'),
      statTile(`${score}%`, 'Equilibrio del grupo'),
    ]),

    recommendationCard(state, activePeople),

    h('div', { className: 'section-title' }, 'Cómo está cada quien'),
    h('div', { className: 'card' }, [balancesList(activePeople, balances)]),

    h(
      'button',
      {
        className: 'btn btn-primary btn-block',
        style: { marginTop: '16px' },
        onClick: () => openAddPurchase(),
      },
      '+ Registrar gasto'
    ),
  ]);

  return screen;
}

function statTile(value, label) {
  return h('div', { className: 'stat-tile' }, [h('div', { className: 'value' }, value), h('div', { className: 'label' }, label)]);
}

function balancesList(people, balances) {
  const sorted = [...people].sort((a, b) => (balances[b.id]?.balanceCents ?? 0) - (balances[a.id]?.balanceCents ?? 0));
  const maxAbs = Math.max(1, ...sorted.map((p) => Math.abs(balances[p.id]?.balanceCents ?? 0)));

  return h(
    'div',
    { className: 'list' },
    sorted.map((person) => {
      const entry = balances[person.id] || { balanceCents: 0 };
      const pct = Math.min(100, (Math.abs(entry.balanceCents) / maxAbs) * 100);
      const mood = entry.balanceCents > 50 ? 'positive' : entry.balanceCents < -50 ? 'negative' : 'zero';
      return h('div', { className: 'balance-row' }, [
        avatarNode(person),
        h('div', { className: 'name-block' }, [
          h('div', { className: 'name' }, person.name),
          balanceLabelNode(entry.balanceCents),
          h('div', { className: 'balance-bar-track' }, [
            h('div', {
              className: 'balance-bar-fill',
              style: { width: `${pct}%`, background: `var(--${mood === 'zero' ? 'neutral' : mood})` },
            }),
          ]),
        ]),
        balancePillNode(entry.balanceCents),
      ]);
    })
  );
}

function recommendationCard(state, activePeople) {
  const rec = recommendNextPayer(state.people, state.purchases, state.settlements, {
    participantIds: activePeople.map((p) => p.id),
  });

  if (!rec) {
    return h('div', { className: 'rec-card' }, [h('p', { className: 'muted' }, 'Agregá al menos dos personas activas para ver una recomendación.')]);
  }

  const payer = state.people.find((p) => p.id === rec.payerId);
  const payerBalance = state.balances[payer.id]?.balanceCents ?? 0;
  const payerDesc = describeBalance(payerBalance);

  const detail =
    payerDesc.kind === 'pending'
      ? `Tiene ${formatCents(payerDesc.amountCents)} de aporte pendiente: pagando la próxima compra se pone al día.`
      : `Pagando ~${formatCents(rec.amountCents)} (promedio reciente de compras), el grupo queda más parejo.`;

  return h('div', { className: 'rec-card' }, [
    h('div', { className: 'rec-label' }, 'Recomendado para pagar después'),
    h('div', { className: 'rec-name' }, [avatarNode(payer), payer.name]),
    h('p', { className: 'rec-detail' }, detail),
    h(
      'button',
      { className: 'btn btn-secondary', style: { marginTop: '12px' }, onClick: () => openSimulator(state, activePeople) },
      'Calcular quién paga'
    ),
  ]);
}

function openSimulator(state, activePeople) {
  let amountValue = '';
  const resultBox = h('div', { style: { marginTop: '14px' } });

  const input = h('input', {
    type: 'number',
    inputmode: 'decimal',
    placeholder: '0.00',
    'aria-label': 'Monto estimado de la próxima compra',
    onInput: (e) => {
      amountValue = e.target.value;
      updateResult();
    },
  });

  function updateResult() {
    const cents = parseAmountToCents(amountValue);
    const rec = recommendNextPayer(state.people, state.purchases, state.settlements, {
      participantIds: activePeople.map((p) => p.id),
      amountCents: Number.isFinite(cents) && cents > 0 ? cents : undefined,
    });
    resultBox.replaceChildren();
    if (!rec) return;
    const payer = state.people.find((p) => p.id === rec.payerId);
    resultBox.append(
      h('div', { className: 'row gap-12', style: { marginTop: '4px' } }, [
        avatarNode(payer),
        h('div', {}, [
          h('div', { style: { fontWeight: 700 } }, `Conviene que pague ${payer.name}`),
          h(
            'div',
            { className: 'muted', style: { fontSize: '0.85rem' } },
            rec.improvementPct > 0
              ? `El grupo queda un ${rec.improvementPct}% más parejo.`
              : 'El grupo ya está bastante parejo con este monto.'
          ),
        ]),
      ])
    );
  }

  const content = h('div', {}, [
    h('div', { className: 'field' }, [
      h('label', {}, 'Monto aproximado de la próxima compra (Bs)'),
      h('div', { className: 'amount-input-wrap' }, [h('span', { className: 'currency-tag' }, 'Bs'), input]),
    ]),
    resultBox,
  ]);

  updateResult();
  openSheet('Calcular quién paga', content);
  setTimeout(() => input.focus(), 50);
}

export function emptyState(emoji, title, message) {
  return h('div', { className: 'empty-state' }, [
    h('div', { className: 'emoji', 'aria-hidden': 'true' }, emoji),
    h('h3', {}, title),
    h('p', {}, message),
  ]);
}
