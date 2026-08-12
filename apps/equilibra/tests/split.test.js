import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEqual, splitWeighted, sumShares } from '../src/logic/split.js';

test('splitEqual: división exacta sin resto', () => {
  const shares = splitEqual(12000, ['a', 'b', 'c']);
  assert.deepEqual(shares, { a: 4000, b: 4000, c: 4000 });
  assert.equal(sumShares(shares), 12000);
});

test('splitEqual: reparte el resto de centavos y la suma cierra exacta', () => {
  // 100 / 3 = 33.33... -> 3333 + 3333 + 3334 (o similar), suma siempre 10000
  const shares = splitEqual(10000, ['a', 'b', 'c']);
  assert.equal(sumShares(shares), 10000);
  const values = Object.values(shares);
  assert.ok(values.every((v) => v === 3333 || v === 3334));
  // el resto (1 centavo) va al primer participante en el orden dado
  assert.equal(shares.a, 3334);
  assert.equal(shares.b, 3333);
  assert.equal(shares.c, 3333);
});

test('splitEqual: un solo participante recibe todo', () => {
  const shares = splitEqual(9999, ['a']);
  assert.deepEqual(shares, { a: 9999 });
});

test('splitEqual: montos y participantes inválidos lanzan error', () => {
  assert.throws(() => splitEqual(0, ['a']));
  assert.throws(() => splitEqual(-100, ['a']));
  assert.throws(() => splitEqual(1.5, ['a']));
  assert.throws(() => splitEqual(100, []));
});

test('splitWeighted: ejemplo del enunciado (1/2/1 sobre Bs 120)', () => {
  const shares = splitWeighted(12000, { a: 1, b: 2, c: 1 });
  assert.deepEqual(shares, { a: 3000, b: 6000, c: 3000 });
  assert.equal(sumShares(shares), 12000);
});

test('splitWeighted: suma siempre exacta con pesos que generan resto', () => {
  const shares = splitWeighted(10000, { a: 1, b: 1, c: 1 });
  assert.equal(sumShares(shares), 10000);
});

test('splitWeighted: el mayor resto decide quién recibe el centavo extra', () => {
  // 1000 centavos repartidos 1/3, 1/3, 1/3 -> 333.33 cada uno, sobra 1 centavo
  const shares = splitWeighted(1000, { a: 1, b: 1, c: 1 });
  const total = sumShares(shares);
  assert.equal(total, 1000);
  // exactamente una persona tiene 334 y las otras dos 333
  const values = Object.values(shares).sort((x, y) => x - y);
  assert.deepEqual(values, [333, 333, 334]);
});

test('splitWeighted: pesos inválidos lanzan error', () => {
  assert.throws(() => splitWeighted(1000, {}));
  assert.throws(() => splitWeighted(1000, { a: 0 }));
  assert.throws(() => splitWeighted(1000, { a: -1 }));
  assert.throws(() => splitWeighted(0, { a: 1 }));
});

test('splitWeighted: peso muy grande frente a otros no rompe la suma', () => {
  const shares = splitWeighted(9973, { a: 1, b: 99 });
  assert.equal(sumShares(shares), 9973);
});
