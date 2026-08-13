import test from 'node:test';
import assert from 'node:assert/strict';
import { computePurchaseRefunds, purchaseStatus, totalPendingCents } from '../src/logic/refunds.js';

function purchase(overrides) {
  return {
    id: 'p1',
    payerId: 'felipe',
    participantIds: ['felipe', 'carlos', 'israel'],
    shares: { felipe: 1834, carlos: 1833, israel: 1833 },
    ...overrides,
  };
}

test('computePurchaseRefunds: sin devoluciones, todo pendiente y el pagador queda excluido', () => {
  const progress = computePurchaseRefunds(purchase(), []);
  assert.equal(progress.felipe, undefined); // quien pagó no tiene nada que devolver
  assert.equal(progress.carlos.owedCents, 1833);
  assert.equal(progress.carlos.refundedCents, 0);
  assert.equal(progress.carlos.remainingCents, 1833);
  assert.equal(progress.carlos.settled, false);
  assert.equal(purchaseStatus(progress), 'pending');
});

test('computePurchaseRefunds: ignora transferencias de otras compras', () => {
  const settlements = [{ purchaseId: 'otra-compra', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1833 }];
  const progress = computePurchaseRefunds(purchase(), settlements);
  assert.equal(progress.carlos.refundedCents, 0);
});

test('computePurchaseRefunds: devolución parcial', () => {
  const settlements = [{ purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 }];
  const progress = computePurchaseRefunds(purchase(), settlements);
  assert.equal(progress.carlos.refundedCents, 1000);
  assert.equal(progress.carlos.remainingCents, 833);
  assert.equal(progress.carlos.settled, false);
  assert.equal(purchaseStatus(progress), 'partial');
});

test('computePurchaseRefunds: devolución exacta queda saldada', () => {
  const settlements = [{ purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1833 }];
  const progress = computePurchaseRefunds(purchase(), settlements);
  assert.equal(progress.carlos.remainingCents, 0);
  assert.equal(progress.carlos.settled, true);
  assert.equal(progress.carlos.overpaidCents, 0);
});

test('computePurchaseRefunds: sobrepago deja remainingCents en 0 y registra el excedente', () => {
  const settlements = [{ purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 2000 }];
  const progress = computePurchaseRefunds(purchase(), settlements);
  assert.equal(progress.carlos.remainingCents, 0);
  assert.equal(progress.carlos.settled, true);
  assert.equal(progress.carlos.overpaidCents, 167);
});

test('computePurchaseRefunds: suma varias devoluciones parciales de la misma persona', () => {
  const settlements = [
    { purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 500 },
    { purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 500 },
  ];
  const progress = computePurchaseRefunds(purchase(), settlements);
  assert.equal(progress.carlos.refundedCents, 1000);
  assert.equal(progress.carlos.remainingCents, 833);
});

test('purchaseStatus: settled cuando todos los participantes (menos el pagador) están saldados', () => {
  const settlements = [
    { purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1833 },
    { purchaseId: 'p1', fromPersonId: 'israel', toPersonId: 'felipe', amountCents: 1833 },
  ];
  const progress = computePurchaseRefunds(purchase(), settlements);
  assert.equal(purchaseStatus(progress), 'settled');
});

test('purchaseStatus: settled cuando el pagador cubrió a todos solo (compra sin otros participantes)', () => {
  const soloPurchase = purchase({ participantIds: ['felipe'], shares: { felipe: 5500 } });
  const progress = computePurchaseRefunds(soloPurchase, []);
  assert.equal(purchaseStatus(progress), 'settled');
});

test('totalPendingCents: suma lo que falta devolver entre todos los participantes', () => {
  const settlements = [{ purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 }];
  const progress = computePurchaseRefunds(purchase(), settlements);
  assert.equal(totalPendingCents(progress), 833 + 1833); // carlos parcial + israel completo
});
