import { h } from '../../utils/dom.js';
import { getState, addPerson, editPerson, setPersonActive } from '../../state/store.js';
import { formatCents, formatSignedCents } from '../../logic/money.js';
import { describeBalance } from '../../logic/wording.js';
import { avatarNode } from '../components/avatar.js';
import { balancePillNode, balanceLabelNode } from '../components/balancePill.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { confirmDialog } from '../components/confirm.js';
import { showToast } from '../components/toast.js';
import { equilibriumTrendChart } from '../components/charts.js';
import { computeBalances } from '../../logic/balances.js';
import { openCategoryProductManager } from './categoryProducts.js';

export function renderGroup() {
  const state = getState();

  const active = state.people.filter((p) => p.active);
  const inactive = state.people.filter((p) => !p.active);

  const screen = h('div', { className: 'screen' }, [
    h('div', { className: 'topbar' }, [
      h('h1', { className: 'page-title' }, 'Grupo'),
      h('a', { className: 'icon-btn', href: '#/settings', 'aria-label': 'Ajustes' }, '⚙️'),
    ]),

    h('button', { className: 'btn btn-secondary btn-block', onClick: () => openAddPersonSheet() }, '+ Agregar persona'),

    h('div', { className: 'section-title' }, 'Activos'),
    h('div', { className: 'card' }, [personList(state, active)]),

    inactive.length > 0
      ? h('div', {}, [h('div', { className: 'section-title' }, 'Inactivos'), h('div', { className: 'card' }, [personList(state, inactive)])])
      : null,

    h('div', { className: 'section-title' }, 'Catálogo'),
    h('div', { className: 'card' }, [
      h('div', { className: 'list-item', role: 'button', tabindex: '0', onClick: () => openCategoryProductManager() }, [
        h('div', { className: 'list-icon', 'aria-hidden': 'true' }, '🏷️'),
        h('div', { className: 'list-main' }, [h('div', { className: 'list-title' }, 'Categorías y productos'), h('div', { className: 'list-sub' }, 'Gestionar catálogo frecuente')]),
        h('span', { 'aria-hidden': 'true' }, '›'),
      ]),
    ]),
  ]);

  return screen;
}

function personList(state, people) {
  if (people.length === 0) return h('p', { className: 'faint' }, 'No hay personas en esta lista.');
  return h(
    'div',
    { className: 'list' },
    people.map((person) =>
      h('div', { className: 'list-item', role: 'button', tabindex: '0', onClick: () => openPersonDetail(state, person) }, [
        avatarNode(person),
        h('div', { className: 'list-main' }, [
          h('div', { className: 'list-title' }, person.name),
          balanceLabelNode(state.balances[person.id]?.balanceCents ?? 0, { className: 'list-sub' }),
        ]),
        balancePillNode(state.balances[person.id]?.balanceCents ?? 0),
      ])
    )
  );
}

function openAddPersonSheet() {
  const nameInput = h('input', { type: 'text', placeholder: 'Nombre', 'aria-label': 'Nombre de la persona', autofocus: true });
  const content = h('div', {}, [
    h('div', { className: 'field' }, [h('label', {}, 'Nombre'), nameInput]),
    h(
      'button',
      {
        className: 'btn btn-primary btn-block',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) return;
          await addPerson(name);
          showToast('Persona agregada');
          closeSheet();
        },
      },
      'Agregar'
    ),
  ]);
  openSheet('Agregar persona', content);
  setTimeout(() => nameInput.focus(), 50);
}

function openPersonDetail(state, person) {
  const balance = state.balances[person.id] || { paidCents: 0, consumedCents: 0, balanceCents: 0, purchaseCount: 0 };
  const nameInput = h('input', { type: 'text', value: person.name, 'aria-label': 'Nombre' });

  const movements = [
    ...state.purchases.filter((p) => p.payerId === person.id || p.participantIds.includes(person.id)),
    ...state.settlements.filter((s) => s.fromPersonId === person.id || s.toPersonId === person.id),
  ]
    .sort((a, b) => new Date(b.datetime) - new Date(a.datetime))
    .slice(0, 10);

  const trend = buildPersonTrend(state, person.id);

  const content = h('div', {}, [
    h('div', { className: 'row gap-12' }, [avatarNode(person, { size: 'lg' })]),
    h('div', { className: 'field', style: { marginTop: '14px' } }, [h('label', {}, 'Nombre'), nameInput]),

    h('div', { className: 'stat-grid' }, [
      statTile(formatCents(balance.paidCents), 'Total pagado'),
      statTile(formatCents(balance.consumedCents), 'Le correspondía aportar'),
      statTile(formatSignedCents(balance.settlementNetCents), 'Transferencias / devoluciones netas'),
      statTile(String(balance.purchaseCount), 'Compras'),
    ]),

    balanceSummaryCard(balance.balanceCents),

    h('div', { className: 'section-title' }, 'Evolución de su saldo'),
    equilibriumTrendChart(trend),

    h('div', { className: 'section-title' }, 'Últimos movimientos'),
    movements.length === 0
      ? h('p', { className: 'faint' }, 'Sin movimientos todavía.')
      : h('div', { className: 'list' }, movements.map((m) => movementMiniRow(state, m))),

    h('div', { className: 'confirm-actions' }, [
      h('button', { className: 'btn btn-secondary', onClick: async () => {
        const name = nameInput.value.trim();
        if (name && name !== person.name) await editPerson(person.id, { name });
        showToast('Cambios guardados');
        closeSheet();
      } }, 'Guardar'),
      person.active
        ? h('button', { className: 'btn btn-danger', onClick: async () => {
            const ok = await confirmDialog({
              title: 'Marcar como inactiva',
              message: `${person.name} no aparecerá para nuevas compras, pero se conserva todo su historial.`,
              confirmLabel: 'Marcar inactiva',
            });
            if (ok) { await setPersonActive(person.id, false); showToast('Persona marcada como inactiva'); }
          } }, 'Marcar inactiva')
        : h('button', { className: 'btn btn-primary', onClick: async () => { await setPersonActive(person.id, true); showToast('Persona reactivada'); closeSheet(); } }, 'Reactivar'),
    ]),
  ]);

  openSheet('Persona', content);
}

function statTile(value, label) {
  return h('div', { className: 'stat-tile' }, [h('div', { className: 'value' }, value), h('div', { className: 'label' }, label)]);
}

function balanceSummaryCard(balanceCents) {
  const d = describeBalance(balanceCents);
  const mood = d.kind === 'favor' ? 'positive' : d.kind === 'pending' ? 'negative' : 'zero';
  return h('div', { className: 'card', style: { marginTop: '10px', textAlign: 'center' } }, [
    h('div', { className: 'faint' }, 'Saldo actual'),
    h('div', { className: `balance-label-${mood}`, style: { fontSize: '1.5rem', fontWeight: 800, marginTop: '2px' } }, d.title),
    d.kind !== 'even' ? h('div', { className: 'muted' }, formatCents(d.amountCents)) : null,
  ]);
}

function movementMiniRow(state, movement) {
  const isPurchase = 'amountCents' in movement && 'shares' in movement;
  if (isPurchase) {
    const payer = state.people.find((p) => p.id === movement.payerId);
    return h('div', { className: 'list-item' }, [
      h('div', { className: 'list-icon', 'aria-hidden': 'true' }, '🧾'),
      h('div', { className: 'list-main' }, [h('div', { className: 'list-title' }, movement.concept), h('div', { className: 'list-sub' }, payer ? `Pagó ${payer.name}` : '')]),
      h('div', { className: 'list-amount' }, formatCents(movement.amountCents)),
    ]);
  }
  const from = state.people.find((p) => p.id === movement.fromPersonId);
  const to = state.people.find((p) => p.id === movement.toPersonId);
  return h('div', { className: 'list-item' }, [
    h('div', { className: 'list-icon', 'aria-hidden': 'true' }, '🔁'),
    h('div', { className: 'list-main' }, [h('div', { className: 'list-title' }, `${from?.name || '—'} → ${to?.name || '—'}`)]),
    h('div', { className: 'list-amount' }, formatCents(movement.amountCents)),
  ]);
}

function buildPersonTrend(state, personId) {
  const movements = [...state.purchases, ...state.settlements].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  if (movements.length < 2) return [];

  const rawPoints = movements.map((movement) => {
    const cutoff = new Date(movement.datetime);
    const purchasesUpTo = state.purchases.filter((p) => new Date(p.datetime) <= cutoff);
    const settlementsUpTo = state.settlements.filter((s) => new Date(s.datetime) <= cutoff);
    const balances = computeBalances(state.people, purchasesUpTo, settlementsUpTo);
    return { label: movement.datetime, value: balances[personId]?.balanceCents ?? 0 };
  });

  // Normalizamos el balance individual a una escala 0-100 relativa al mayor desbalance visto,
  // para reutilizar el mismo componente de gráfico de línea que el equilibrio del grupo.
  const maxAbs = Math.max(1, ...rawPoints.map((p) => Math.abs(p.value)));
  return rawPoints.map((point) => ({ label: point.label, value: 50 + (point.value / maxAbs) * 50 }));
}
