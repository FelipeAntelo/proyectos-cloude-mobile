import { h } from '../../utils/dom.js';
import { getState, addPerson, editPerson, setPersonActive } from '../../state/store.js';
import { formatCents, formatSignedCents } from '../../logic/money.js';
import { describeBalance } from '../../logic/wording.js';
import { avatarNode } from '../components/avatar.js';
import { balanceAmountNode } from '../components/balancePill.js';
import { icon } from '../components/icons.js';
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
      h('a', { className: 'icon-btn', href: '#/settings', 'aria-label': 'Ajustes' }, [icon('settings', { size: 'md' })]),
    ]),

    h('button', { className: 'btn btn-secondary btn-block', style: { marginTop: '14px' }, onClick: () => openAddPersonSheet() }, [icon('plus', { size: 'sm' }), 'Agregar persona']),

    h('div', { className: 'section-title' }, 'Activos'),
    personList(state, active),

    inactive.length > 0
      ? h('div', {}, [h('div', { className: 'section-title' }, 'Inactivos'), personList(state, inactive)])
      : null,

    h('div', { className: 'section-title' }, 'Catálogo'),
    h(
      'div',
      { className: 'list-item', role: 'button', tabindex: '0', onClick: () => openCategoryProductManager() },
      [
        h('div', { className: 'list-icon' }, [icon('tag', { size: 'sm' })]),
        h('div', { className: 'list-main' }, [h('div', { className: 'list-title' }, 'Categorías y productos'), h('div', { className: 'list-sub' }, 'Gestionar catálogo frecuente')]),
        icon('chevron', { size: 'sm', className: 'list-chevron' }),
      ]
    ),
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
        h('div', { className: 'list-main' }, [h('div', { className: 'list-title' }, person.name)]),
        balanceAmountNode(state.balances[person.id]?.balanceCents ?? 0),
        icon('chevron', { size: 'sm', className: 'list-chevron' }),
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
  const balance = state.balances[person.id] || { paidCents: 0, consumedCents: 0, balanceCents: 0, settlementNetCents: 0, purchaseCount: 0 };
  const nameInput = h('input', { type: 'text', value: person.name, 'aria-label': 'Nombre' });

  const movements = [
    ...state.purchases.filter((p) => p.payerId === person.id || p.participantIds.includes(person.id)),
    ...state.settlements.filter((s) => s.fromPersonId === person.id || s.toPersonId === person.id),
  ]
    .sort((a, b) => new Date(b.datetime) - new Date(a.datetime))
    .slice(0, 10);

  const trend = buildPersonTrend(state, person.id);
  const d = describeBalance(balance.balanceCents);
  const mood = d.kind === 'favor' ? 'positive' : d.kind === 'pending' ? 'negative' : 'zero';

  const content = h('div', {}, [
    h('div', { className: 'row gap-12' }, [avatarNode(person, { size: 'lg' })]),
    h('div', { className: 'field', style: { marginTop: '14px' } }, [h('label', {}, 'Nombre'), nameInput]),

    h('div', { className: `home-lead balance-label-${mood}`, style: { marginTop: '4px' } }, d.kind === 'even' ? 'Al día' : formatCents(d.amountCents)),
    h('div', { className: 'home-substat' }, d.kind === 'even' ? 'Aportó justo lo que le correspondía.' : d.title),

    h('div', { className: 'kv-group', style: { marginTop: '18px' } }, [
      h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Total pagado'), h('span', { className: 'kv-value' }, formatCents(balance.paidCents))]),
      h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Le correspondía aportar'), h('span', { className: 'kv-value' }, formatCents(balance.consumedCents))]),
      h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Transferencias / devoluciones netas'), h('span', { className: 'kv-value' }, formatSignedCents(balance.settlementNetCents))]),
      h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Compras'), h('span', { className: 'kv-value' }, String(balance.purchaseCount))]),
    ]),

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

function movementMiniRow(state, movement) {
  const isPurchase = 'amountCents' in movement && 'shares' in movement;
  if (isPurchase) {
    const payer = state.people.find((p) => p.id === movement.payerId);
    return h('div', { className: 'list-item' }, [
      h('div', { className: 'list-icon' }, [icon('receipt', { size: 'sm' })]),
      h('div', { className: 'list-main' }, [h('div', { className: 'list-title' }, movement.concept), h('div', { className: 'list-sub' }, payer ? `Pagó ${payer.name}` : '')]),
      h('div', { className: 'list-amount' }, formatCents(movement.amountCents)),
    ]);
  }
  const from = state.people.find((p) => p.id === movement.fromPersonId);
  const to = state.people.find((p) => p.id === movement.toPersonId);
  return h('div', { className: 'list-item' }, [
    h('div', { className: 'list-icon' }, [icon(movement.purchaseId ? 'refund' : 'transfer', { size: 'sm' })]),
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
