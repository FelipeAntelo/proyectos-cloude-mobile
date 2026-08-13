import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBalance, formatBalancePhrase } from '../src/logic/wording.js';

test('describeBalance: positivo es "Saldo a favor", nunca "+"', () => {
  const d = describeBalance(3667);
  assert.equal(d.kind, 'favor');
  assert.equal(d.title, 'Saldo a favor');
  assert.equal(d.amountCents, 3667);
});

test('describeBalance: negativo es "Aporte pendiente", nunca "-"', () => {
  const d = describeBalance(-1833);
  assert.equal(d.kind, 'pending');
  assert.equal(d.title, 'Aporte pendiente');
  assert.equal(d.amountCents, 1833); // se muestra en positivo, el signo no es parte del mensaje
});

test('describeBalance: cero es "Al día"', () => {
  const d = describeBalance(0);
  assert.equal(d.kind, 'even');
  assert.equal(d.title, 'Al día');
});

test('describeBalance: diferencias mínimas de redondeo también cuentan como "Al día"', () => {
  assert.equal(describeBalance(10).kind, 'even');
  assert.equal(describeBalance(-10).kind, 'even');
});

test('formatBalancePhrase: incluye el monto salvo cuando está al día', () => {
  assert.equal(formatBalancePhrase(3667), 'Saldo a favor: Bs 36.67');
  assert.equal(formatBalancePhrase(-1833), 'Aporte pendiente: Bs 18.33');
  assert.equal(formatBalancePhrase(0), 'Al día');
});

test('describeBalance: nunca usa las palabras balance/profit/debt/credit de cara al usuario', () => {
  const banned = /balance|profit|debt|credit/i;
  for (const cents of [5000, -5000, 0]) {
    const d = describeBalance(cents);
    assert.ok(!banned.test(d.title));
    assert.ok(!banned.test(d.detail));
  }
});
