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
  // exactamente una persona recibe el centavo extra
  assert.equal(values.filter((v) => v === 3334).length, 1);
});

test('splitEqual: el ejemplo del enunciado (Bs 55 entre 3) suma exacto y reparte 1 centavo', () => {
  const shares = splitEqual(5500, ['felipe', 'b', 'israel']);
  assert.equal(sumShares(shares), 5500);
  const values = Object.values(shares).sort((x, y) => x - y);
  assert.deepEqual(values, [1833, 1833, 1834]);
});

test('splitEqual: es determinista (recalcular la misma compra da siempre el mismo resultado)', () => {
  const a = splitEqual(10000, ['a', 'b', 'c']);
  const b = splitEqual(10000, ['a', 'b', 'c']);
  assert.deepEqual(a, b);
});

test('splitEqual: el centavo sobrante no siempre cae en la misma persona (sin sesgo sistemático)', () => {
  // Mismo trío, distintos montos con resto: si siempre le tocara al primero
  // del array ('a'), este set tendría un solo elemento. La rotación por hash
  // hace que varíe según el monto.
  const winners = new Set();
  for (let cents = 10001; cents < 10001 + 30; cents += 1) {
    const shares = splitEqual(cents, ['a', 'b', 'c']);
    const [winner] = Object.entries(shares)
      .sort((x, y) => y[1] - x[1])[0];
    winners.add(winner);
  }
  assert.ok(winners.size > 1, 'el centavo extra debería repartirse entre más de una persona a lo largo de varias compras');
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
