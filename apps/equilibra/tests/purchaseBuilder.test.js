import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPurchasePayload } from '../src/logic/purchaseBuilder.js';
import { validateSettlementInput } from '../src/logic/validation.js';

const peopleIds = ['a', 'b', 'c'];

test('buildPurchasePayload: caso feliz con división igualitaria', () => {
  const payload = buildPurchasePayload({
    amountInput: '120',
    concept: 'Almuerzo',
    payerId: 'a',
    participantIds: ['a', 'b', 'c'],
    splitMode: 'equal',
    peopleIds,
  });
  assert.equal(payload.amountCents, 12000);
  assert.deepEqual(payload.shares, { a: 4000, b: 4000, c: 4000 });
});

test('buildPurchasePayload: división ponderada', () => {
  const payload = buildPurchasePayload({
    amountInput: '120',
    concept: 'Bebidas',
    payerId: 'a',
    participantIds: ['a', 'b', 'c'],
    splitMode: 'weighted',
    weights: { a: 1, b: 2, c: 1 },
    peopleIds,
  });
  assert.deepEqual(payload.shares, { a: 3000, b: 6000, c: 3000 });
});

test('buildPurchasePayload: monto <= 0 rechazado', () => {
  assert.throws(() =>
    buildPurchasePayload({
      amountInput: '0',
      concept: 'x',
      payerId: 'a',
      participantIds: ['a'],
      splitMode: 'equal',
      peopleIds,
    })
  );
  assert.throws(() =>
    buildPurchasePayload({
      amountInput: '-5',
      concept: 'x',
      payerId: 'a',
      participantIds: ['a'],
      splitMode: 'equal',
      peopleIds,
    })
  );
});

test('buildPurchasePayload: sin pagador rechazado', () => {
  assert.throws(() =>
    buildPurchasePayload({
      amountInput: '10',
      concept: 'x',
      payerId: '',
      participantIds: ['a'],
      splitMode: 'equal',
      peopleIds,
    })
  );
});

test('buildPurchasePayload: sin participantes rechazado', () => {
  assert.throws(() =>
    buildPurchasePayload({
      amountInput: '10',
      concept: 'x',
      payerId: 'a',
      participantIds: [],
      splitMode: 'equal',
      peopleIds,
    })
  );
});

test('buildPurchasePayload: participante inexistente rechazado', () => {
  assert.throws(() =>
    buildPurchasePayload({
      amountInput: '10',
      concept: 'x',
      payerId: 'a',
      participantIds: ['a', 'ghost'],
      splitMode: 'equal',
      peopleIds,
    })
  );
});

test('buildPurchasePayload: sin concepto rechazado', () => {
  assert.throws(() =>
    buildPurchasePayload({
      amountInput: '10',
      concept: '   ',
      payerId: 'a',
      participantIds: ['a'],
      splitMode: 'equal',
      peopleIds,
    })
  );
});

test('validateSettlementInput: caso válido', () => {
  const errors = validateSettlementInput({ amountCents: 1000, fromPersonId: 'a', toPersonId: 'b', peopleIds });
  assert.deepEqual(errors, []);
});

test('validateSettlementInput: mismo origen y destino inválido', () => {
  const errors = validateSettlementInput({ amountCents: 1000, fromPersonId: 'a', toPersonId: 'a', peopleIds });
  assert.ok(errors.length > 0);
});

test('validateSettlementInput: monto inválido', () => {
  const errors = validateSettlementInput({ amountCents: 0, fromPersonId: 'a', toPersonId: 'b', peopleIds });
  assert.ok(errors.length > 0);
});

test('validateSettlementInput: persona inexistente', () => {
  const errors = validateSettlementInput({ amountCents: 1000, fromPersonId: 'a', toPersonId: 'ghost', peopleIds });
  assert.ok(errors.length > 0);
});
