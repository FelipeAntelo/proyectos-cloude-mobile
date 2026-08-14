import { h } from '../../utils/dom.js';
import { getState } from '../../state/store.js';
import { formatCents, parseAmountToCents } from '../../logic/money.js';
import { equilibriumScore } from '../../logic/equilibrium.js';
import { recommendNextPayer } from '../../logic/recommendation.js';
import { filterByPeriod } from '../../logic/period.js';
import { describeBalance } from '../../logic/wording.js';
import { avatarNode } from '../components/avatar.js';
import { balanceAmountNode } from '../components/balancePill.js';
import { icon } from '../components/icons.js';
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
      emptyState('group', 'Sumá a tu equipo', 'Andá a "Grupo" para agregar compañeros y empezar a registrar gastos.'),
    ]);
  }

  if (state.purchases.length === 0 && state.settlements.length === 0) {
    return h('div', { className: 'screen' }, [
      h('div', { className: 'topbar' }, [
        h('h1', { className: 'page-title' }, 'Equilibra'),
        h('a', { className: 'icon-btn', href: '#/settings', 'aria-label': 'Ajustes' }, [icon('settings', { size: 'md' })]),
      ]),
      emptyState(
        'receipt',
        'Todavía no hay movimientos',
        'Registrá la primera compra para empezar a equilibrar los aportes del grupo.',
        h('button', { className: 'btn btn-primary', onClick: () => openAddPurchase() }, 'Registrar compra')
      ),
    ]);
  }

  const screen = h('div', { className: 'screen' }, [
    h('div', { className: 'topbar' }, [
      h('h1', { className: 'page-title' }, 'Equilibra'),
      h('a', { className: 'icon-btn', href: '#/settings', 'aria-label': 'Ajustes' }, [icon('settings', { size: 'md' })]),
    ]),

    h('div', { className: 'home-lead' }, [formatCents(monthTotalCents), h('span', { className: 'lead-suffix' }, 'compartidos este mes')]),
    h('div', { className: 'home-substat' }, `${activePeople.length} ${activePeople.length === 1 ? 'persona' : 'personas'} · ${score}% equilibrado`),
    syncStatusLine(state),

    h('div', { className: 'divider-top' }, [recommendationBlock(state, activePeople)]),

    h('div', { className: 'section-title' }, 'Cómo está cada quien'),
    balancesList(activePeople, balances),
  ]);

  return screen;
}

/** Discreto y silencioso cuando todo está al día: solo aparece si hay algo que decir. */
function syncStatusLine(state) {
  if (!state.group) return null;
  const sync = state.sync || {};
  if (sync.state === 'offline') return h('div', { className: 'faint', style: { marginTop: '2px' } }, 'Sin conexión');
  if (sync.pendingCount > 0) {
    return h('div', { className: 'faint', style: { marginTop: '2px' } }, `${sync.pendingCount} cambio${sync.pendingCount === 1 ? '' : 's'} pendiente${sync.pendingCount === 1 ? '' : 's'} de sincronizar`);
  }
  return null;
}

function balancesList(people, balances) {
  const sorted = [...people].sort((a, b) => (balances[b.id]?.balanceCents ?? 0) - (balances[a.id]?.balanceCents ?? 0));

  return h(
    'div',
    { className: 'list' },
    sorted.map((person) => {
      const entry = balances[person.id] || { balanceCents: 0 };
      return h('div', { className: 'balance-row' }, [
        avatarNode(person),
        h('div', { className: 'name-block' }, [h('div', { className: 'name' }, person.name)]),
        balanceAmountNode(entry.balanceCents),
      ]);
    })
  );
}

function recommendationBlock(state, activePeople) {
  const rec = recommendNextPayer(state.people, state.purchases, state.settlements, {
    participantIds: activePeople.map((p) => p.id),
  });

  if (!rec) {
    return h('p', { className: 'muted' }, 'Agregá al menos dos personas activas para ver una recomendación.');
  }

  const payer = state.people.find((p) => p.id === rec.payerId);
  const payerBalance = state.balances[payer.id]?.balanceCents ?? 0;
  const payerDesc = describeBalance(payerBalance);

  const detail =
    payerDesc.kind === 'pending'
      ? `Tiene ${formatCents(payerDesc.amountCents)} pendientes: pagando la próxima compra se pone al día.`
      : `Pagando ~${formatCents(rec.amountCents)} (promedio reciente), el grupo queda más parejo.`;

  return h('div', { className: 'rec-block' }, [
    h('div', { className: 'rec-label' }, 'Le tocaría pagar a'),
    h('div', { className: 'rec-name' }, [avatarNode(payer), payer.name]),
    h('p', { className: 'rec-detail' }, detail),
    h('button', { className: 'btn btn-secondary', onClick: () => openSimulator(state, activePeople) }, 'Calcular con otro monto'),
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
  openSheet('Calcular con otro monto', content);
  setTimeout(() => input.focus(), 50);
}

export function emptyState(iconName, title, message, action) {
  return h('div', { className: 'empty-state' }, [
    h('div', { className: 'empty-icon' }, [icon(iconName, { size: 'lg' })]),
    h('h3', {}, title),
    h('p', {}, message),
    action || null,
  ]);
}
