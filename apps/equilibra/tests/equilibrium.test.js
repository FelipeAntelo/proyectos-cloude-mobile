import test from 'node:test';
import assert from 'node:assert/strict';
import { rms, sumAbs, equilibriumScore } from '../src/logic/equilibrium.js';
import { computeBalances } from '../src/logic/balances.js';
import { splitEqual } from '../src/logic/split.js';

test('rms y sumAbs de una lista vacía son 0', () => {
  assert.equal(rms([]), 0);
  assert.equal(sumAbs([]), 0);
});

test('rms penaliza más un desbalance concentrado que varios chicos', () => {
  const concentrated = rms([300, 0, 0]);
  const spread = rms([100, 100, 100]);
  assert.ok(concentrated > spread);
  // la suma de abs es igual en ambos casos, por eso se prefiere RMS
  assert.equal(sumAbs([300, 0, 0]), sumAbs([100, 100, 100]));
});

test('equilibriumScore: sin actividad, 100% (nada que repartir)', () => {
  const people = [{ id: 'a' }, { id: 'b' }];
  const balances = computeBalances(people, [], []);
  assert.equal(equilibriumScore(balances), 100);
});

test('equilibriumScore: grupo perfectamente parejo da 100%', () => {
  const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const purchases = [
    { payerId: 'a', amountCents: 3000, shares: splitEqual(3000, ['a', 'b', 'c']) },
    { payerId: 'b', amountCents: 3000, shares: splitEqual(3000, ['a', 'b', 'c']) },
    { payerId: 'c', amountCents: 3000, shares: splitEqual(3000, ['a', 'b', 'c']) },
  ];
  const balances = computeBalances(people, purchases, []);
  assert.equal(equilibriumScore(balances), 100);
});

test('equilibriumScore: baja a medida que el desbalance crece relativo al gasto', () => {
  const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const purchases = [
    { payerId: 'a', amountCents: 12000, shares: splitEqual(12000, ['a', 'b', 'c']) },
  ];
  const balances = computeBalances(people, purchases, []);
  const score = equilibriumScore(balances);
  assert.ok(score < 100 && score >= 0);
});

test('equilibriumScore: se comporta igual con montos grandes y chicos (invariante de escala)', () => {
  const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const small = computeBalances(
    people,
    [{ payerId: 'a', amountCents: 120, shares: splitEqual(120, ['a', 'b', 'c']) }],
    []
  );
  const large = computeBalances(
    people,
    [{ payerId: 'a', amountCents: 1200000, shares: splitEqual(1200000, ['a', 'b', 'c']) }],
    []
  );
  assert.equal(equilibriumScore(small), equilibriumScore(large));
});

test('equilibriumScore: una sola compra pagada por una persona no hunde el indicador a 0%', () => {
  // Es el caso más común al empezar a usar la app: una compra, un pagador,
  // división igualitaria. No debería leerse como "grupo totalmente desequilibrado".
  const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const balances = computeBalances(
    people,
    [{ payerId: 'a', amountCents: 12000, shares: splitEqual(12000, ['a', 'b', 'c']) }],
    []
  );
  const score = equilibriumScore(balances);
  assert.ok(score > 0, `se esperaba un score > 0, se obtuvo ${score}`);
});

test('equilibriumScore: nunca es negativo ni mayor a 100', () => {
  const people = [{ id: 'a' }, { id: 'b' }];
  const balances = computeBalances(
    people,
    [{ payerId: 'a', amountCents: 100, shares: { a: 1, b: 99 } }],
    []
  );
  const score = equilibriumScore(balances);
  assert.ok(score >= 0 && score <= 100);
});
