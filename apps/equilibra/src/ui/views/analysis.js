import { h } from '../../utils/dom.js';
import { getState } from '../../state/store.js';
import { computeBalances } from '../../logic/balances.js';
import { equilibriumScore } from '../../logic/equilibrium.js';
import { formatCents } from '../../logic/money.js';
import { describeBalance } from '../../logic/wording.js';
import { filterByPeriod, PERIODS } from '../../logic/period.js';
import { avatarNode } from '../components/avatar.js';
import { balancePillNode } from '../components/balancePill.js';
import { comparisonChart, categoryChart, equilibriumTrendChart } from '../components/charts.js';
import { emptyState } from './home.js';

let selectedPeriod = 'month';

export function renderAnalysis() {
  const state = getState();
  const screen = h('div', { className: 'screen' });
  const body = h('div', {});

  screen.append(h('div', { className: 'topbar' }, [h('h1', { className: 'page-title' }, 'Análisis')]), periodChips(() => draw()), body);

  function draw() {
    body.replaceChildren(buildBody(state));
  }
  draw();

  return screen;
}

function periodChips(onChange) {
  return h(
    'div',
    { className: 'filter-bar', style: { marginBottom: '8px' } },
    PERIODS.map((p) =>
      h(
        'button',
        { type: 'button', className: `chip${selectedPeriod === p.id ? ' selected' : ''}`, onClick: () => { selectedPeriod = p.id; onChange(); } },
        p.label
      )
    )
  );
}

function buildBody(state) {
  const activePeople = state.people.filter((p) => p.active);
  const purchases = filterByPeriod(state.purchases, selectedPeriod);
  const settlements = filterByPeriod(state.settlements, selectedPeriod);

  if (purchases.length === 0 && settlements.length === 0) {
    return emptyState('📊', 'Todavía no hay datos en este período', 'Registrá compras o transferencias para ver el análisis.');
  }

  const periodBalances = computeBalances(state.people, purchases, settlements);
  const score = equilibriumScore(periodBalances, activePeople.map((p) => p.id));
  const totalSpend = purchases.reduce((sum, p) => sum + p.amountCents, 0);

  return h('div', {}, [
    equilibriumCard(score),

    h('div', { className: 'section-title' }, 'Por persona'),
    h('div', { className: 'card' }, [comparisonChart(activePeople.map((p) => ({ label: p.name, paidCents: periodBalances[p.id]?.paidCents ?? 0, owedCents: periodBalances[p.id]?.consumedCents ?? 0 })))]),
    personTable(state, activePeople, periodBalances, purchases, totalSpend),

    h('div', { className: 'section-title' }, 'Por categoría'),
    h('div', { className: 'card' }, [categoryChart(categoryBreakdown(state, purchases))]),

    h('div', { className: 'section-title' }, 'Evolución del equilibrio'),
    h('div', { className: 'card' }, [equilibriumTrendChart(equilibriumTrend(state, purchases, settlements))]),
  ]);
}

function equilibriumCard(score) {
  return h('div', { className: 'card' }, [
    h('div', { className: 'equilibrium-ring-wrap' }, [
      h('div', { className: 'equilibrium-ring-value' }, `${score}%`),
      h('div', {}, [
        h('div', { style: { fontWeight: 700 } }, 'Equilibrio del grupo'),
        h('p', { className: 'faint' }, '100% = todos aportaron exactamente lo que consumieron.'),
      ]),
    ]),
  ]);
}

function personTable(state, people, balances, purchases, totalSpend) {
  return h(
    'div',
    { className: 'card', style: { marginTop: '10px' } },
    [
      h(
        'div',
        { className: 'list' },
        people.map((person) => {
          const b = balances[person.id] || { paidCents: 0, consumedCents: 0, balanceCents: 0, purchaseCount: 0 };
          const pct = totalSpend > 0 ? Math.round((b.consumedCents / totalSpend) * 100) : 0;
          const balanceTitle = describeBalance(b.balanceCents).title;
          return h('div', { className: 'list-item' }, [
            avatarNode(person),
            h('div', { className: 'list-main' }, [
              h('div', { className: 'list-title' }, person.name),
              h('div', { className: 'list-sub' }, `Pagó ${formatCents(b.paidCents)} · Le correspondía ${formatCents(b.consumedCents)} · ${b.purchaseCount} compras · ${pct}% del consumo`),
              h('div', { className: `list-sub balance-label-${b.balanceCents > 50 ? 'positive' : b.balanceCents < -50 ? 'negative' : 'zero'}` }, balanceTitle),
            ]),
            balancePillNode(b.balanceCents),
          ]);
        })
      ),
    ]
  );
}

function categoryBreakdown(state, purchases) {
  const totals = new Map();
  for (const purchase of purchases) {
    const key = purchase.categoryId;
    const label = key ? state.categories.find((c) => c.id === key)?.name || 'Otras' : 'Sin categoría';
    totals.set(label, (totals.get(label) || 0) + purchase.amountCents);
  }
  return [...totals.entries()].map(([label, amountCents]) => ({ label, amountCents }));
}

function equilibriumTrend(state, purchasesInPeriod, settlementsInPeriod) {
  const movements = [...purchasesInPeriod.map((p) => ({ datetime: p.datetime })), ...settlementsInPeriod.map((s) => ({ datetime: s.datetime }))].sort(
    (a, b) => new Date(a.datetime) - new Date(b.datetime)
  );

  const activeIds = state.people.filter((p) => p.active).map((p) => p.id);

  return movements.map((movement) => {
    const cutoff = new Date(movement.datetime);
    const purchasesUpTo = state.purchases.filter((p) => new Date(p.datetime) <= cutoff);
    const settlementsUpTo = state.settlements.filter((s) => new Date(s.datetime) <= cutoff);
    const balances = computeBalances(state.people, purchasesUpTo, settlementsUpTo);
    return { label: movement.datetime, value: equilibriumScore(balances, activeIds) };
  });
}
