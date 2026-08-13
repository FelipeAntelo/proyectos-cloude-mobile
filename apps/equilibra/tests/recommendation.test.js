import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendNextPayer, simulatePurchase, averagePurchaseAmountCents } from '../src/logic/recommendation.js';
import { computeBalances } from '../src/logic/balances.js';
import { splitEqual } from '../src/logic/split.js';

const people = [
  { id: 'a', active: true },
  { id: 'b', active: true },
  { id: 'c', active: true },
];

test('averagePurchaseAmountCents: usa el fallback si no hay historial', () => {
  assert.equal(averagePurchaseAmountCents([]), 5000);
});

test('averagePurchaseAmountCents: promedio simple', () => {
  assert.equal(averagePurchaseAmountCents([{ amountCents: 1000 }, { amountCents: 3000 }]), 2000);
});

test('simulatePurchase: no muta el mapa de balances original', () => {
  const balances = computeBalances(people, [], []);
  const simulated = simulatePurchase(balances, { payerId: 'a', amountCents: 3000, participantIds: ['a', 'b', 'c'] });
  assert.equal(balances.a.balanceCents, 0);
  assert.equal(simulated.a.balanceCents, 2000); // pagó 3000, consumió 1000
});

test('recommendNextPayer: sin historial recomienda a cualquiera de forma determinista (todos iguales)', () => {
  const rec = recommendNextPayer(people, [], [], { participantIds: ['a', 'b', 'c'] });
  assert.ok(['a', 'b', 'c'].includes(rec.payerId));
  assert.equal(rec.currentRms, 0);
});

test('recommendNextPayer: con desbalance previo, recomienda a quien tiene el balance más negativo cuando el monto es chico', () => {
  const purchases = [
    { payerId: 'a', amountCents: 12000, shares: splitEqual(12000, ['a', 'b', 'c']) },
  ];
  const rec = recommendNextPayer(people, purchases, [], { participantIds: ['a', 'b', 'c'], amountCents: 1 });
  assert.equal(rec.payerId, 'b'); // b y c empatan en -4000, desempate por orden de entrada
});

test('recommendNextPayer: respeta eligiblePayerIds aunque no sea el más negativo', () => {
  const purchases = [
    { payerId: 'a', amountCents: 12000, shares: splitEqual(12000, ['a', 'b', 'c']) },
  ];
  const rec = recommendNextPayer(people, purchases, [], {
    participantIds: ['a', 'b', 'c'],
    eligiblePayerIds: ['a'],
    amountCents: 100,
  });
  assert.equal(rec.payerId, 'a');
});

test('recommendNextPayer: sin participantes activos devuelve null', () => {
  const inactivePeople = [{ id: 'a', active: false }];
  const rec = recommendNextPayer(inactivePeople, [], []);
  assert.equal(rec, null);
});

test('recommendNextPayer: improvementPct es 0 cuando el grupo ya está perfecto', () => {
  const rec = recommendNextPayer(people, [], [], { participantIds: ['a', 'b', 'c'], amountCents: 300 });
  assert.equal(rec.currentRms, 0);
  assert.equal(rec.improvementPct, 0);
});
