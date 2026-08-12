import { h } from '../../utils/dom.js';
import { getState, removePurchase, removeSettlement } from '../../state/store.js';
import { formatCents } from '../../logic/money.js';
import { formatDayLabel, formatTime, formatLong } from '../../utils/format.js';
import { filterByPeriod, PERIODS } from '../../logic/period.js';
import { avatarNode } from '../components/avatar.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { confirmDialog } from '../components/confirm.js';
import { showToast } from '../components/toast.js';
import { openAddPurchase } from './addPurchase.js';
import { openAddSettlement } from './addSettlement.js';
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

function searchAndFilters(state, onChange) {
  const wrap = h('div', {});

  const search = h('div', { className: 'search-wrap' }, [
    h('span', { className: 'search-icon', 'aria-hidden': 'true' }, '🔎'),
    h('input', {
      type: 'search',
      placeholder: 'Buscar por concepto, nota o persona…',
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
      ['settlement', 'Compensaciones'],
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
  const settlements = state.settlements.map((s) => ({ kind: 'settlement', datetime: s.datetime, data: s }));
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
      haystack = [movement.data.note, personName(movement.data.fromPersonId), personName(movement.data.toPersonId)].join(' ').toLowerCase();
    }
    if (!haystack.includes(q)) return false;
  }

  return true;
}

function buildList(state) {
  const movements = buildMovements(state).filter((m) => matchesFilters(state, m));

  if (movements.length === 0) {
    return emptyState('🗂️', 'Sin resultados', 'No hay movimientos que coincidan con los filtros elegidos.');
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
        h('div', { className: 'list-icon', 'aria-hidden': 'true' }, '🧾'),
        h('div', { className: 'list-main' }, [
          h('div', { className: 'list-title' }, p.concept),
          h('div', { className: 'list-sub' }, `${payer ? payer.name : '—'} · ${formatTime(p.datetime)} · ${p.participantIds.length} personas`),
        ]),
        h('div', { className: 'list-amount' }, formatCents(p.amountCents)),
      ]
    );
  }

  const s = movement.data;
  const from = state.people.find((p) => p.id === s.fromPersonId);
  const to = state.people.find((p) => p.id === s.toPersonId);
  return h(
    'div',
    { className: 'list-item', role: 'button', tabindex: '0', onClick: () => openSettlementDetail(state, s) },
    [
      h('div', { className: 'list-icon', 'aria-hidden': 'true' }, '🔁'),
      h('div', { className: 'list-main' }, [
        h('div', { className: 'list-title' }, `${from ? from.name : '—'} → ${to ? to.name : '—'}`),
        h('div', { className: 'list-sub' }, `Compensación · ${formatTime(s.datetime)}`),
      ]),
      h('div', { className: 'list-amount' }, formatCents(s.amountCents)),
    ]
  );
}

function openPurchaseDetail(state, purchase) {
  const payer = state.people.find((p) => p.id === purchase.payerId);
  const category = state.categories.find((c) => c.id === purchase.categoryId);

  const shareRows = purchase.participantIds.map((id) => {
    const person = state.people.find((p) => p.id === id);
    return h('div', { className: 'row between', style: { padding: '6px 0' } }, [
      h('div', { className: 'row gap-8' }, [avatarNode(person, { size: 'sm' }), person ? person.name : '—']),
      h('span', {}, formatCents(purchase.shares[id] || 0)),
    ]);
  });

  const content = h('div', {}, [
    h('p', { className: 'muted' }, formatLong(purchase.datetime)),
    h('div', { className: 'card' }, [
      h('div', { className: 'row between' }, [h('strong', {}, 'Total'), h('strong', {}, formatCents(purchase.amountCents))]),
      h('p', { className: 'faint', style: { marginTop: '4px' } }, category ? category.name : 'Sin categoría'),
    ]),
    h('div', { className: 'section-title' }, 'Pagó'),
    h('div', { className: 'row gap-8' }, [avatarNode(payer), payer ? payer.name : '—']),
    h('div', { className: 'section-title' }, `División (${purchase.splitMode === 'weighted' ? 'personalizada' : 'igualitaria'})`),
    h('div', {}, shareRows),
    purchase.note ? h('div', {}, [h('div', { className: 'section-title' }, 'Nota'), h('p', {}, purchase.note)]) : null,
    h('div', { className: 'confirm-actions' }, [
      h('button', { className: 'btn btn-secondary', onClick: () => { closeSheet(); setTimeout(() => openAddPurchase({ purchase }), 180); } }, 'Editar'),
      h(
        'button',
        {
          className: 'btn btn-danger',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Eliminar compra',
              message: `¿Eliminar "${purchase.concept}" por ${formatCents(purchase.amountCents)}? Esta acción no se puede deshacer.`,
              confirmLabel: 'Eliminar',
            });
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

  const content = h('div', {}, [
    h('p', { className: 'muted' }, formatLong(settlement.datetime)),
    h('div', { className: 'card' }, [
      h('div', { className: 'row between gap-12' }, [
        h('div', { className: 'row gap-8' }, [avatarNode(from), from ? from.name : '—']),
        h('span', { 'aria-hidden': 'true' }, '→'),
        h('div', { className: 'row gap-8' }, [avatarNode(to), to ? to.name : '—']),
      ]),
      h('div', { className: 'row between', style: { marginTop: '10px' } }, [h('strong', {}, 'Monto'), h('strong', {}, formatCents(settlement.amountCents))]),
    ]),
    settlement.note ? h('div', {}, [h('div', { className: 'section-title' }, 'Nota'), h('p', {}, settlement.note)]) : null,
    h('div', { className: 'confirm-actions' }, [
      h('button', { className: 'btn btn-secondary', onClick: () => { closeSheet(); setTimeout(() => openAddSettlement({ settlement }), 180); } }, 'Editar'),
      h(
        'button',
        {
          className: 'btn btn-danger',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Eliminar compensación',
              message: `¿Eliminar esta compensación de ${formatCents(settlement.amountCents)}?`,
              confirmLabel: 'Eliminar',
            });
            if (ok) {
              await removeSettlement(settlement.id);
              showToast('Compensación eliminada');
            }
          },
        },
        'Eliminar'
      ),
    ]),
  ]);

  openSheet('Detalle de la compensación', content);
}
