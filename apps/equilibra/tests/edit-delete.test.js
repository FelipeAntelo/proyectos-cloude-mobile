// El store (src/state/store.js) delega toda la persistencia a IndexedDB, que no
// existe en Node. Estos tests validan el comportamiento que el store depende de
// que sea correcto: que recalcular balances a partir de una lista de compras
// editada o con un elemento eliminado da el resultado esperado, sin arrastrar
// nada del estado anterior (no hay balances "cacheados": siempre se recalculan
// desde cero a partir de la lista actual).

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances } from '../src/logic/balances.js';
import { buildPurchasePayload } from '../src/logic/purchaseBuilder.js';

const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const peopleIds = people.map((p) => p.id);

test('editar una compra recalcula los balances de todos los involucrados', () => {
  const original = buildPurchasePayload({
    amountInput: '120',
    concept: 'Almuerzo',
    payerId: 'a',
    participantIds: ['a', 'b', 'c'],
    splitMode: 'equal',
    peopleIds,
  });
  let purchases = [{ id: 'p1', ...original }];

  let balances = computeBalances(people, purchases, []);
  assert.equal(balances.a.balanceCents, 8000);

  // se edita: ahora paga b, y solo consumen a y b
  const edited = buildPurchasePayload({
    amountInput: '120',
    concept: 'Almuerzo (corregido)',
    payerId: 'b',
    participantIds: ['a', 'b'],
    splitMode: 'equal',
    peopleIds,
  });
  purchases = purchases.map((p) => (p.id === 'p1' ? { id: 'p1', ...edited } : p));

  balances = computeBalances(people, purchases, []);
  assert.equal(balances.a.balanceCents, -6000);
  assert.equal(balances.b.balanceCents, 6000);
  assert.equal(balances.c.balanceCents, 0); // c ya no participaba, queda en cero
});

test('eliminar una compra revierte su efecto por completo', () => {
  const p1 = buildPurchasePayload({
    amountInput: '120',
    concept: 'Compra 1',
    payerId: 'a',
    participantIds: ['a', 'b', 'c'],
    splitMode: 'equal',
    peopleIds,
  });
  const p2 = buildPurchasePayload({
    amountInput: '60',
    concept: 'Compra 2',
    payerId: 'b',
    participantIds: ['a', 'b', 'c'],
    splitMode: 'equal',
    peopleIds,
  });
  let purchases = [{ id: 'p1', ...p1 }, { id: 'p2', ...p2 }];

  let balances = computeBalances(people, purchases, []);
  assert.equal(balances.c.balanceCents, -6000);

  purchases = purchases.filter((p) => p.id !== 'p2');
  balances = computeBalances(people, purchases, []);
  assert.equal(balances.a.balanceCents, 8000);
  assert.equal(balances.b.balanceCents, -4000);
  assert.equal(balances.c.balanceCents, -4000);

  purchases = purchases.filter((p) => p.id !== 'p1');
  balances = computeBalances(people, purchases, []);
  for (const p of people) assert.equal(balances[p.id].balanceCents, 0);
});
