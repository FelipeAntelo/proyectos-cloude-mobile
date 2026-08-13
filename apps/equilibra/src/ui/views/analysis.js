import { h } from '../../utils/dom.js';
import { getState } from '../../state/store.js';
import { computeBalances } from '../../logic/balances.js';
import { equilibriumScore } from '../../logic/equilibrium.js';
import { formatCents } from '../../logic/money.js';
import { filterByPeriod, PERIODS } from '../../logic/period.js';
import { avatarNode } from '../components/avatar.js';
import { balanceAmountNode } from '../components/balancePill.js';
import { comparisonChart, categoryChart } from '../components/charts.js';
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
    { className: 'filter-bar', style: { marginBottom: '10px' } },
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
    return emptyState('analysis', 'Todavía no hay datos en este período', 'Registrá compras o transferencias para ver el análisis.');
  }

  const periodBalances = computeBalances(state.people, purchases, settlements);
  const score = equilibriumScore(periodBalances, activePeople.map((p) => p.id));
  const totalSpend = purchases.reduce((sum, p) => sum + p.amountCents, 0);

  return h('div', {}, [
    h('p', { className: 'muted', style: { marginBottom: '4px' } }, `${formatCents(totalSpend)} gastados · ${score}% equilibrado`),

    h('div', { className: 'section-title' }, 'Aportado vs. correspondía'),
    h('div', { className: 'card' }, [comparisonChart(activePeople.map((p) => ({ label: p.name, paidCents: periodBalances[p.id]?.paidCents ?? 0, owedCents: periodBalances[p.id]?.consumedCents ?? 0 })))]),
    personList(activePeople, periodBalances),

    h('div', { className: 'section-title' }, 'Gastos por categoría'),
    h('div', { className: 'card' }, [categoryChart(categoryBreakdown(state, purchases))]),
  ]);
}

function personList(people, balances) {
  return h(
    'div',
    { className: 'list', style: { marginTop: '4px' } },
    people.map((person) => {
      const b = balances[person.id] || { balanceCents: 0 };
      return h('div', { className: 'balance-row' }, [
        avatarNode(person),
        h('div', { className: 'name-block' }, [h('div', { className: 'name' }, person.name)]),
        balanceAmountNode(b.balanceCents),
      ]);
    })
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
