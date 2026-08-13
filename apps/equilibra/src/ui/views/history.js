import { h } from '../../utils/dom.js';
import { getState, removePurchase, removeSettlement, getSettlementsForPurchase } from '../../state/store.js';
import { formatCents } from '../../logic/money.js';
import { formatDayLabel, formatTime, formatLong } from '../../utils/format.js';
import { filterByPeriod, PERIODS } from '../../logic/period.js';
import { computePurchaseRefunds, purchaseStatus } from '../../logic/refunds.js';
import { PURCHASE_STATUS_LABELS, PURCHASE_STATUS_HINTS } from '../../logic/wording.js';
import { avatarNode } from '../components/avatar.js';
import { icon } from '../components/icons.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { confirmDialog } from '../components/confirm.js';
import { showToast } from '../components/toast.js';
import { openAddPurchase } from './addPurchase.js';
import { openAddSettlement } from './addSettlement.js';
import { openRegisterRefund } from './refund.js';
import { emptyState } from './home.js';

const filters = { search: '', type: 'all', personId: 'all', categoryId: 'all', period: 'all' };

export function renderHistory() {
  const state = getState();
  const screen = h('div', { className: 'screen' });
  const listBox = h('div', {});

  screen.append(
    h('div', { className: 'topbar' }, [h('h1', { className: 'page-title' }, 'Historial')]),
    searchAndFilters(state, () => draw()),
    listBox
  );

  function draw() {
    listBox.replaceChildren(buildList(state));
  }
  draw();

  return screen;
}

function isRefund(settlement) {
  return Boolean(settlement.purchaseId);
}

function searchAndFilters(state, onChange) {
  const wrap = h('div', {});

  const search = h('div', { className: 'search-wrap' }, [
    h('span', { className: 'search-icon' }, [icon('search', { size: 'sm' })]),
    h('input', {
      type: 'search',
      placeholder: 'Buscar compra o persona…',
      'aria-label': 'Buscar en el historial',
      value: filters.search,
      onInput: (e) => { filters.search = e.target.value; onChange(); },
    }),
  ]);

  const typeChips = h(
    'div',
    { className: 'filter-bar' },
    [
      ['all', 'Todo'],
      ['purchase', 'Compras'],
      ['refund', 'Devoluciones'],
      ['transfer', 'Transferencias'],
    ].map(([id, label]) =>
      h(
        'button',
        { type: 'button', className: `chip${filters.type === id ? ' selected' : ''}`, onClick: () => { filters.type = id; onChange(); } },
        label
      )
    )
  );

  const personChips = h(
    'div',
    { className: 'filter-bar', style: { marginTop: '8px' } },
    [
      h('button', { type: 'button', className: `chip${filters.personId === 'all' ? ' selected' : ''}`, onClick: () => { filters.personId = 'all'; onChange(); } }, 'Todos'),
      ...state.people.map((person) =>
        h(
          'button',
          { type: 'button', className: `chip${filters.personId === person.id ? ' selected' : ''}`, onClick: () => { filters.personId = person.id; onChange(); } },
          person.name
        )
      ),
    ]
  );

  const periodChips = h(
    'div',
    { className: 'filter-bar', style: { marginTop: '8px' } },
    [
      h('button', { type: 'button', className: `chip${filters.period === 'all' ? ' selected' : ''}`, onClick: () => { filters.period = 'all'; onChange(); } }, 'Todo'),
      ...PERIODS.filter((p) => p.id !== 'all').map((p) =>
        h('button', { type: 'button', className: `chip${filters.period === p.id ? ' selected' : ''}`, onClick: () => { filters.period = p.id; onChange(); } }, p.label)
      ),
    ]
  );

  wrap.append(search, typeChips, personChips, periodChips);
  return wrap;
}

function buildMovements(state) {
  const purchases = state.purchases.map((p) => ({ kind: 'purchase', datetime: p.datetime, data: p }));
  const settlements = state.settlements.map((s) => ({ kind: isRefund(s) ? 'refund' : 'transfer', datetime: s.datetime, data: s }));
  return [...purchases, ...settlements].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
}

function matchesFilters(state, movement) {
  if (filters.type !== 'all' && movement.kind !== filters.type) return false;
  if (!filterByPeriod([movement], filters.period, null, 'datetime').length) return false;

  if (filters.personId !== 'all') {
    if (movement.kind === 'purchase') {
      const involved = movement.data.payerId === filters.personId || movement.data.participantIds.includes(filters.personId);
      if (!involved) return false;
    } else {
      const involved = movement.data.fromPersonId === filters.personId || movement.data.toPersonId === filters.personId;
      if (!involved) return false;
    }
  }

  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const personName = (id) => state.people.find((p) => p.id === id)?.name.toLowerCase() || '';
    let haystack = '';
    if (movement.kind === 'purchase') {
      haystack = [movement.data.concept, movement.data.note, personName(movement.data.payerId), ...movement.data.participantIds.map(personName)].join(' ').toLowerCase();
    } else {
      const linkedPurchase = movement.data.purchaseId ? state.purchases.find((p) => p.id === movement.data.purchaseId) : null;
      haystack = [movement.data.note, personName(movement.data.fromPersonId), personName(movement.data.toPersonId), linkedPurchase?.concept].join(' ').toLowerCase();
    }
    if (!haystack.includes(q)) return false;
  }

  return true;
}

function buildList(state) {
  const movements = buildMovements(state).filter((m) => matchesFilters(state, m));

  if (movements.length === 0) {
    return emptyState('search', 'Sin resultados', 'No hay movimientos que coincidan con los filtros elegidos.');
  }

  const groups = [];
  let currentLabel = null;
  let currentGroup = null;
  for (const movement of movements) {
    const label = formatDayLabel(movement.datetime);
    if (label !== currentLabel) {
      currentLabel = label;
      currentGroup = { label, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(movement);
  }

  return h(
    'div',
    {},
    groups.map((group) =>
      h('div', { className: 'day-group' }, [
        h('div', { className: 'day-heading' }, group.label),
        h('div', { className: 'list' }, group.items.map((m) => movementRow(state, m))),
      ])
    )
  );
}

function movementRow(state, movement) {
  if (movement.kind === 'purchase') {
    const p = movement.data;
    const payer = state.people.find((pp) => pp.id === p.payerId);
    return h(
      'div',
      { className: 'list-item', role: 'button', tabindex: '0', onClick: () => openPurchaseDetail(state, p) },
      [
        h('div', { className: 'list-icon' }, [icon('receipt', { size: 'sm' })]),
        h('div', { className: 'list-main' }, [
          h('div', { className: 'list-title' }, p.concept),
          h('div', { className: 'list-sub' }, `${payer ? payer.name : '—'} pagó · ${p.participantIds.length} personas`),
        ]),
        h('div', { className: 'list-amount' }, formatCents(p.amountCents)),
      ]
    );
  }

  const s = movement.data;
  const from = state.people.find((p) => p.id === s.fromPersonId);
  const to = state.people.find((p) => p.id === s.toPersonId);
  const refund = isRefund(s);
  const linkedPurchase = refund ? state.purchases.find((p) => p.id === s.purchaseId) : null;

  return h(
    'div',
    { className: 'list-item', role: 'button', tabindex: '0', onClick: () => openSettlementDetail(state, s) },
    [
      h('div', { className: 'list-icon' }, [icon(refund ? 'refund' : 'transfer', { size: 'sm' })]),
      h('div', { className: 'list-main' }, [
        h('div', { className: 'list-title' }, `${from ? from.name : '—'} → ${to ? to.name : '—'}`),
        h(
          'div',
          { className: 'list-sub' },
          refund ? `Devolución · ${linkedPurchase ? linkedPurchase.concept : 'compra eliminada'}` : 'Transferencia'
        ),
      ]),
      h('div', { className: 'list-amount' }, formatCents(s.amountCents)),
    ]
  );
}

function purchaseStatusBadge(status) {
  const cssMood = status === 'settled' ? 'positive' : status === 'partial' ? 'zero' : 'negative';
  return h('span', { className: `balance-pill ${cssMood}` }, PURCHASE_STATUS_LABELS[status]);
}

function openPurchaseDetail(state, purchase) {
  const payer = state.people.find((p) => p.id === purchase.payerId);
  const category = state.categories.find((c) => c.id === purchase.categoryId);
  const refundProgress = computePurchaseRefunds(purchase, state.settlements);
  const status = purchaseStatus(refundProgress);

  const payerShare = purchase.shares[purchase.payerId] || 0;
  const payerSurplus = purchase.amountCents - payerShare;

  const participantRows = purchase.participantIds
    .filter((id) => id !== purchase.payerId)
    .map((id) => {
      const person = state.people.find((p) => p.id === id);
      const progress = refundProgress[id] || { owedCents: purchase.shares[id] || 0, refundedCents: 0, remainingCents: purchase.shares[id] || 0, settled: false };

      return h('div', {}, [
        h('div', { className: 'row gap-8' }, [avatarNode(person, { size: 'sm' }), h('strong', {}, person ? person.name : '—')]),
        h('div', { className: 'kv-group', style: { marginTop: '6px' } }, [
          h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Le correspondía'), h('span', { className: 'kv-value' }, formatCents(progress.owedCents))]),
          h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Ya devolvió'), h('span', { className: 'kv-value' }, formatCents(progress.refundedCents))]),
          h('div', { className: 'kv-row' }, [
            h('span', { className: 'kv-label' }, 'Falta devolver'),
            h('span', { className: `kv-value ${progress.settled ? 'balance-label-positive' : 'balance-label-negative'}` }, progress.settled ? 'Saldada' : formatCents(progress.remainingCents)),
          ]),
        ]),
        !progress.settled
          ? h(
              'button',
              {
                className: 'btn btn-secondary btn-block',
                style: { marginTop: '10px' },
                onClick: () => { closeSheet(); setTimeout(() => openRegisterRefund({ purchase, participant: person }), 180); },
              },
              'Registrar devolución'
            )
          : null,
      ]);
    });

  const content = h('div', {}, [
    h('p', { className: 'muted' }, formatLong(purchase.datetime)),

    h('div', { className: 'row between', style: { marginTop: '10px', alignItems: 'baseline' } }, [
      h('div', { className: 'home-lead', style: { marginTop: 0 } }, formatCents(purchase.amountCents)),
      purchaseStatusBadge(status),
    ]),
    h('p', { className: 'faint' }, `${category ? category.name : 'Sin categoría'} · ${PURCHASE_STATUS_HINTS[status]}`),

    h('div', { className: 'section-title' }, 'Pagó'),
    h('div', { className: 'card' }, [
      h('div', { className: 'row gap-8' }, [avatarNode(payer), h('strong', {}, payer ? payer.name : '—')]),
      h('div', { className: 'kv-group', style: { marginTop: '8px' } }, [
        h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Le correspondía'), h('span', { className: 'kv-value' }, formatCents(payerShare))]),
        h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Pagó en total'), h('span', { className: 'kv-value' }, formatCents(purchase.amountCents))]),
        h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Adelantó por el grupo'), h('span', { className: 'kv-value balance-label-positive' }, formatCents(payerSurplus))]),
      ]),
    ]),

    h('div', { className: 'section-title' }, `Participaron ${purchase.participantIds.length} personas · división ${purchase.splitMode === 'weighted' ? 'personalizada' : 'igualitaria'}`),
    h('div', { className: 'divided' }, participantRows),

    purchase.note ? h('div', {}, [h('div', { className: 'section-title' }, 'Nota'), h('p', {}, purchase.note)]) : null,

    h('div', { className: 'confirm-actions' }, [
      h('button', { className: 'btn btn-secondary', onClick: () => { closeSheet(); setTimeout(() => openAddPurchase({ purchase }), 180); } }, 'Editar'),
      h(
        'button',
        {
          className: 'btn btn-danger',
          onClick: async () => {
            const linkedSettlements = await getSettlementsForPurchase(purchase.id);
            const message =
              linkedSettlements.length > 0
                ? `¿Eliminar "${purchase.concept}" por ${formatCents(purchase.amountCents)}? Tiene ${linkedSettlements.length} devolución(es) registrada(s) por un total de ${formatCents(linkedSettlements.reduce((s, x) => s + x.amountCents, 0))}: también se eliminarán. Esta acción no se puede deshacer.`
                : `¿Eliminar "${purchase.concept}" por ${formatCents(purchase.amountCents)}? Esta acción no se puede deshacer.`;
            const ok = await confirmDialog({ title: 'Eliminar compra', message, confirmLabel: 'Eliminar' });
            if (ok) {
              await removePurchase(purchase.id);
              showToast('Compra eliminada');
            }
          },
        },
        'Eliminar'
      ),
    ]),
  ]);

  openSheet('Detalle de la compra', content);
}

function openSettlementDetail(state, settlement) {
  const from = state.people.find((p) => p.id === settlement.fromPersonId);
  const to = state.people.find((p) => p.id === settlement.toPersonId);
  const refund = isRefund(settlement);
  const linkedPurchase = refund ? state.purchases.find((p) => p.id === settlement.purchaseId) : null;

  const content = h('div', {}, [
    h('p', { className: 'muted' }, formatLong(settlement.datetime)),
    h('div', { className: 'card' }, [
      h('div', { className: 'row between gap-12' }, [
        h('div', { className: 'row gap-8' }, [avatarNode(from), from ? from.name : '—']),
        icon('transfer', { size: 'sm', className: 'faint' }),
        h('div', { className: 'row gap-8' }, [avatarNode(to), to ? to.name : '—']),
      ]),
      h('div', { className: 'kv-group', style: { marginTop: '10px' } }, [
        h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Monto'), h('span', { className: 'kv-value' }, formatCents(settlement.amountCents))]),
        refund ? h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Relacionado con'), h('span', { className: 'kv-value' }, linkedPurchase ? linkedPurchase.concept : 'Compra eliminada')]) : null,
      ]),
    ]),
    settlement.note ? h('div', {}, [h('div', { className: 'section-title' }, 'Nota'), h('p', {}, settlement.note)]) : null,
    h('div', { className: 'confirm-actions' }, [
      h(
        'button',
        {
          className: 'btn btn-secondary',
          onClick: () => {
            closeSheet();
            setTimeout(() => {
              if (refund && linkedPurchase && from) {
                openRegisterRefund({ purchase: linkedPurchase, participant: from, settlement });
              } else {
                openAddSettlement({ settlement });
              }
            }, 180);
          },
        },
        'Editar'
      ),
      h(
        'button',
        {
          className: 'btn btn-danger',
          onClick: async () => {
            const ok = await confirmDialog({
              title: refund ? 'Eliminar devolución' : 'Eliminar transferencia',
              message: `¿Eliminar ${refund ? 'esta devolución' : 'esta transferencia'} de ${formatCents(settlement.amountCents)}? Los saldos se recalcularán al instante.`,
              confirmLabel: 'Eliminar',
            });
            if (ok) {
              await removeSettlement(settlement.id);
              showToast(refund ? 'Devolución eliminada' : 'Transferencia eliminada');
            }
          },
        },
        'Eliminar'
      ),
    ]),
  ]);

  openSheet(refund ? 'Detalle de la devolución' : 'Detalle de la transferencia', content);
}
