// Edición/eliminación de devoluciones y transferencias, y borrado en cascada
// de una compra junto con sus devoluciones asociadas (lo que hace
// repositories.deletePurchaseWithSettlements, replicado acá a nivel de
// arrays/lógica pura para no depender de IndexedDB en Node).

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEqual } from '../src/logic/split.js';
import { computeBalances } from '../src/logic/balances.js';
import { computePurchaseRefunds, purchaseStatus } from '../src/logic/refunds.js';

const people = [{ id: 'felipe' }, { id: 'carlos' }, { id: 'israel' }];

function sumOfBalances(balancesMap) {
  return Object.values(balancesMap).reduce((sum, b) => sum + b.balanceCents, 0);
}

test('editar el monto de una devolución recalcula balances y el detalle de la compra', () => {
  const shares = splitEqual(5500, ['felipe', 'carlos', 'israel']);
  const purchase = { id: 'p1', payerId: 'felipe', amountCents: 5500, shares, participantIds: ['felipe', 'carlos', 'israel'] };
  let settlements = [{ id: 's1', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 }];

  let balances = computeBalances(people, [purchase], settlements);
  assert.equal(balances.carlos.balanceCents, -shares.carlos + 1000);

  // se edita: en vez de 1000, ahora son 1833 (devolución completa)
  settlements = settlements.map((s) => (s.id === 's1' ? { ...s, amountCents: shares.carlos } : s));
  balances = computeBalances(people, [purchase], settlements);
  assert.equal(balances.carlos.balanceCents, 0);
  const progress = computePurchaseRefunds(purchase, settlements);
  assert.equal(progress.carlos.settled, true);
  assert.equal(sumOfBalances(balances), 0);
});

test('eliminar una devolución revierte su efecto por completo', () => {
  const shares = splitEqual(5500, ['felipe', 'carlos', 'israel']);
  const purchase = { id: 'p1', payerId: 'felipe', amountCents: 5500, shares, participantIds: ['felipe', 'carlos', 'israel'] };
  let settlements = [
    { id: 's1', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 },
    { id: 's2', purchaseId: null, fromPersonId: 'israel', toPersonId: 'felipe', amountCents: 500 },
  ];

  let balances = computeBalances(people, [purchase], settlements);
  assert.equal(balances.carlos.balanceCents, -shares.carlos + 1000);

  settlements = settlements.filter((s) => s.id !== 's1');
  balances = computeBalances(people, [purchase], settlements);
  assert.equal(balances.carlos.balanceCents, -shares.carlos); // vuelve a estar como si nunca hubiera devuelto
  assert.equal(sumOfBalances(balances), 0);
});

test('editar una transferencia general (sin compra asociada) recalcula balances', () => {
  let settlements = [{ id: 's1', purchaseId: null, fromPersonId: 'israel', toPersonId: 'felipe', amountCents: 2000 }];
  let balances = computeBalances(people, [], settlements);
  assert.equal(balances.israel.balanceCents, 2000);
  assert.equal(balances.felipe.balanceCents, -2000);

  settlements = settlements.map((s) => (s.id === 's1' ? { ...s, amountCents: 5000 } : s));
  balances = computeBalances(people, [], settlements);
  assert.equal(balances.israel.balanceCents, 5000);
  assert.equal(balances.felipe.balanceCents, -5000);
  assert.equal(sumOfBalances(balances), 0);
});

test('eliminar una compra en cascada con sus devoluciones no deja movimientos huérfanos ni descuadra la contabilidad', () => {
  const shares1 = splitEqual(5500, ['felipe', 'carlos', 'israel']);
  const purchase1 = { id: 'p1', payerId: 'felipe', amountCents: 5500, shares: shares1, participantIds: ['felipe', 'carlos', 'israel'] };
  const purchase2 = { id: 'p2', payerId: 'israel', amountCents: 3000, shares: splitEqual(3000, ['felipe', 'israel']), participantIds: ['felipe', 'israel'] };

  let purchases = [purchase1, purchase2];
  let settlements = [
    { id: 's1', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 }, // ligada a p1
    { id: 's2', purchaseId: null, fromPersonId: 'israel', toPersonId: 'carlos', amountCents: 300 }, // transferencia libre, no debe tocarse
  ];

  let balances = computeBalances(people, purchases, settlements);
  assert.equal(sumOfBalances(balances), 0);

  // Se borra p1: la cascada debe quitar también s1 (ligada a p1), pero conservar s2 (transferencia libre) y p2 intactas.
  const deletedId = 'p1';
  purchases = purchases.filter((p) => p.id !== deletedId);
  settlements = settlements.filter((s) => s.purchaseId !== deletedId);

  assert.deepEqual(purchases.map((p) => p.id), ['p2']);
  assert.deepEqual(settlements.map((s) => s.id), ['s2']); // s1 se fue con la compra, s2 sigue viva

  balances = computeBalances(people, purchases, settlements);
  assert.equal(sumOfBalances(balances), 0); // la contabilidad sigue cerrando tras el borrado en cascada
});

test('el estado de una compra se recalcula tras editar/eliminar sus devoluciones', () => {
  const shares = splitEqual(5500, ['felipe', 'carlos', 'israel']);
  const purchase = { id: 'p1', payerId: 'felipe', amountCents: 5500, shares, participantIds: ['felipe', 'carlos', 'israel'] };

  let settlements = [];
  assert.equal(purchaseStatus(computePurchaseRefunds(purchase, settlements)), 'pending');

  settlements = [{ id: 's1', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 500 }];
  assert.equal(purchaseStatus(computePurchaseRefunds(purchase, settlements)), 'partial');

  settlements = [
    { id: 's1', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: shares.carlos },
    { id: 's2', purchaseId: 'p1', fromPersonId: 'israel', toPersonId: 'felipe', amountCents: shares.israel },
  ];
  assert.equal(purchaseStatus(computePurchaseRefunds(purchase, settlements)), 'settled');

  // se elimina la devolución de israel: vuelve a partial
  settlements = settlements.filter((s) => s.id !== 's2');
  assert.equal(purchaseStatus(computePurchaseRefunds(purchase, settlements)), 'partial');
});
