import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances, totalPaidCents, totalConsumedCents } from '../src/logic/balances.js';
import { splitEqual } from '../src/logic/split.js';

const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('computeBalances: sin movimientos, todos en cero', () => {
  const balances = computeBalances(people, [], []);
  for (const p of people) {
    assert.equal(balances[p.id].balanceCents, 0);
  }
});

test('computeBalances: una compra pagada por uno y consumida por todos', () => {
  const purchases = [
    { payerId: 'a', amountCents: 12000, shares: splitEqual(12000, ['a', 'b', 'c']) },
  ];
  const balances = computeBalances(people, purchases, []);
  assert.equal(balances.a.balanceCents, 8000); // pagó 120, consumió 40
  assert.equal(balances.b.balanceCents, -4000);
  assert.equal(balances.c.balanceCents, -4000);
});

test('computeBalances: compensación mueve el balance de ambas partes', () => {
  const settlements = [{ fromPersonId: 'b', toPersonId: 'a', amountCents: 3000 }];
  const balances = computeBalances(people, [], settlements);
  assert.equal(balances.b.balanceCents, 3000); // entregó plata: sube su balance
  assert.equal(balances.a.balanceCents, -3000); // recibió plata: baja su balance
  assert.equal(balances.c.balanceCents, 0);
});

test('computeBalances: compra + compensación combinadas', () => {
  const purchases = [
    { payerId: 'a', amountCents: 12000, shares: splitEqual(12000, ['a', 'b', 'c']) },
  ];
  const settlements = [{ fromPersonId: 'c', toPersonId: 'a', amountCents: 4000 }];
  const balances = computeBalances(people, purchases, settlements);
  assert.equal(balances.a.balanceCents, 8000 - 4000);
  assert.equal(balances.c.balanceCents, -4000 + 4000);
  assert.equal(balances.c.balanceCents, 0);
});

test('totalPaidCents y totalConsumedCents', () => {
  const purchases = [
    { payerId: 'a', amountCents: 12000, shares: splitEqual(12000, ['a', 'b', 'c']) },
    { payerId: 'b', amountCents: 6000, shares: splitEqual(6000, ['a', 'b', 'c']) },
  ];
  assert.equal(totalPaidCents(purchases), 18000);
  const balances = computeBalances(people, purchases, []);
  assert.equal(totalConsumedCents(balances), 18000);
});

test('computeBalances: ignora ids de compras/shares que no están en `people` sin romper', () => {
  const purchases = [
    { payerId: 'ghost', amountCents: 1000, shares: { ghost: 1000 } },
  ];
  const balances = computeBalances(people, purchases, []);
  assert.equal(balances.a.balanceCents, 0);
  assert.equal(balances.ghost, undefined);
});
