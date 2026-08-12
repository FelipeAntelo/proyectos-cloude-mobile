// Escenario de validación tomado literalmente del enunciado (sección 34):
// A, B, C. Compra 1: Bs 120 paga A, consumen los 3 por igual.
// Compra 2: Bs 60 paga B, consumen los 3 por igual.
// Resultado esperado: A +60, B 0, C -60. C es el candidato natural a pagar después.

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEqual } from '../src/logic/split.js';
import { computeBalances } from '../src/logic/balances.js';
import { recommendNextPayer } from '../src/logic/recommendation.js';
import { equilibriumScore } from '../src/logic/equilibrium.js';

const people = [
  { id: 'A', active: true },
  { id: 'B', active: true },
  { id: 'C', active: true },
];

function buildPurchases() {
  return [
    { payerId: 'A', amountCents: 12000, shares: splitEqual(12000, ['A', 'B', 'C']) },
    { payerId: 'B', amountCents: 6000, shares: splitEqual(6000, ['A', 'B', 'C']) },
  ];
}

test('escenario del enunciado: balances finales A +60, B 0, C -60', () => {
  const balances = computeBalances(people, buildPurchases(), []);
  assert.equal(balances.A.paidCents, 12000);
  assert.equal(balances.A.consumedCents, 6000);
  assert.equal(balances.A.balanceCents, 6000);

  assert.equal(balances.B.paidCents, 6000);
  assert.equal(balances.B.consumedCents, 6000);
  assert.equal(balances.B.balanceCents, 0);

  assert.equal(balances.C.paidCents, 0);
  assert.equal(balances.C.consumedCents, 6000);
  assert.equal(balances.C.balanceCents, -6000);
});

test('escenario del enunciado: C es el candidato recomendado para pagar la próxima compra', () => {
  const recommendation = recommendNextPayer(people, buildPurchases(), [], {
    participantIds: ['A', 'B', 'C'],
    amountCents: 6000,
  });
  assert.equal(recommendation.payerId, 'C');
});

test('escenario del enunciado: el equilibrio del grupo es menor a 100% al haber desbalance', () => {
  const balances = computeBalances(people, buildPurchases(), []);
  const score = equilibriumScore(balances, ['A', 'B', 'C']);
  assert.ok(score < 100);
  assert.ok(score >= 0);
});
