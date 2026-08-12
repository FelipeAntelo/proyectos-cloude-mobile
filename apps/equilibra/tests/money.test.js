import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountToCents, centsToAmount, formatCents, formatSignedCents } from '../src/logic/money.js';

test('parseAmountToCents: casos básicos', () => {
  assert.equal(parseAmountToCents('12.50'), 1250);
  assert.equal(parseAmountToCents('12,50'), 1250);
  assert.equal(parseAmountToCents(12.5), 1250);
  assert.equal(parseAmountToCents('120'), 12000);
  assert.equal(parseAmountToCents('0.01'), 1);
});

test('parseAmountToCents: redondeo de flotantes problemáticos', () => {
  // 1.005 en binario no es exacto; el redondeo debe seguir dando un entero limpio y consistente.
  assert.equal(parseAmountToCents('0.1'), 10);
  assert.equal(parseAmountToCents('0.2'), 20);
  assert.equal(Number.isInteger(parseAmountToCents('19.99')), true);
});

test('parseAmountToCents: entradas inválidas', () => {
  assert.ok(Number.isNaN(parseAmountToCents('')));
  assert.ok(Number.isNaN(parseAmountToCents('abc')));
  assert.ok(Number.isNaN(parseAmountToCents(NaN)));
});

test('centsToAmount', () => {
  assert.equal(centsToAmount(1250), 12.5);
  assert.equal(centsToAmount(1), 0.01);
});

test('formatCents', () => {
  assert.equal(formatCents(12050), 'Bs 120.50');
  assert.equal(formatCents(1), 'Bs 0.01');
  assert.equal(formatCents(0), 'Bs 0.00');
  assert.equal(formatCents(-500), '-Bs 5.00');
});

test('formatSignedCents muestra signo explícito', () => {
  assert.equal(formatSignedCents(8000), '+ Bs 80.00');
  assert.equal(formatSignedCents(-4000), '− Bs 40.00');
  assert.equal(formatSignedCents(0), 'Bs 0.00');
});
