// Escenario principal de la iteración "devoluciones y UX" (ver enunciado):
// Felipe, Carlos, Israel. Compra de Bs 55, paga Felipe, división igualitaria.
// Carlos devuelve Bs 10 y después otros Bs 10 (total Bs 20, más de lo que le
// correspondía) y su compra queda saldada con saldo a favor sobrante.
//
// Los montos exactos de "quién recibe el centavo extra" dependen de la
// rotación determinista de split.js (ver ese archivo), así que este test usa
// las shares REALMENTE calculadas en vez de asumir un reparto fijo — lo que
// importa es que la contabilidad cierra siempre, no quién de los tres se
// queda con el centavo de más.

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEqual } from '../src/logic/split.js';
import { computeBalances } from '../src/logic/balances.js';
import { computePurchaseRefunds, purchaseStatus } from '../src/logic/refunds.js';
import { describeBalance } from '../src/logic/wording.js';

const people = [
  { id: 'felipe', active: true },
  { id: 'carlos', active: true },
  { id: 'israel', active: true },
];

function sumOfBalances(balancesMap) {
  return Object.values(balancesMap).reduce((sum, b) => sum + b.balanceCents, 0);
}

test('escenario Bs 55: balances iniciales sin devoluciones', () => {
  const shares = splitEqual(5500, ['felipe', 'carlos', 'israel']);
  const purchase = { id: 'p1', payerId: 'felipe', amountCents: 5500, shares };
  const balances = computeBalances(people, [purchase], []);

  assert.equal(balances.felipe.balanceCents, 5500 - shares.felipe);
  assert.equal(balances.carlos.balanceCents, -shares.carlos);
  assert.equal(balances.israel.balanceCents, -shares.israel);
  assert.equal(sumOfBalances(balances), 0);

  // Felipe adelantó dinero: debe leerse como "saldo a favor", nunca como "+".
  assert.equal(describeBalance(balances.felipe.balanceCents).kind, 'favor');
  assert.equal(describeBalance(balances.carlos.balanceCents).kind, 'pending');
});

test('escenario Bs 55: devolución parcial de Carlos (Bs 10) actualiza ambos balances y el detalle de la compra', () => {
  const shares = splitEqual(5500, ['felipe', 'carlos', 'israel']);
  const purchase = { id: 'p1', payerId: 'felipe', amountCents: 5500, shares, participantIds: ['felipe', 'carlos', 'israel'] };
  const refund1 = { id: 's1', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 };

  const balances = computeBalances(people, [purchase], [refund1]);
  assert.equal(balances.carlos.balanceCents, -shares.carlos + 1000); // Carlos entrega plata: su balance mejora
  assert.equal(balances.felipe.balanceCents, 5500 - shares.felipe - 1000); // Felipe cobra parte de lo adelantado: su saldo a favor baja
  assert.equal(balances.israel.balanceCents, -shares.israel);
  assert.equal(sumOfBalances(balances), 0);

  const progress = computePurchaseRefunds(purchase, [refund1]);
  assert.equal(progress.carlos.owedCents, shares.carlos);
  assert.equal(progress.carlos.refundedCents, 1000);
  assert.equal(progress.carlos.remainingCents, shares.carlos - 1000);
  assert.equal(progress.carlos.settled, false);
  assert.equal(purchaseStatus(progress), 'partial'); // carlos devolvió algo, israel todavía nada
});

test('escenario Bs 55: segunda devolución de Carlos supera lo que le correspondía -> saldada + saldo a favor que se conserva', () => {
  const shares = splitEqual(5500, ['felipe', 'carlos', 'israel']);
  const purchase = { id: 'p1', payerId: 'felipe', amountCents: 5500, shares, participantIds: ['felipe', 'carlos', 'israel'] };
  const settlements = [
    { id: 's1', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 },
    { id: 's2', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 },
  ];
  // Carlos devolvió Bs 20 en total; le correspondía menos que eso (1833 o 1834 centavos).
  const totalRefunded = 2000;
  assert.ok(totalRefunded > shares.carlos, 'la devolución total debe superar lo que le correspondía a Carlos para este escenario');

  const progress = computePurchaseRefunds(purchase, settlements);
  assert.equal(progress.carlos.remainingCents, 0);
  assert.equal(progress.carlos.settled, true);
  assert.equal(progress.carlos.overpaidCents, totalRefunded - shares.carlos);

  const balances = computeBalances(people, [purchase], settlements);
  // El sobrepago de Carlos NO desaparece: queda como saldo a favor en su balance global.
  assert.equal(balances.carlos.balanceCents, totalRefunded - shares.carlos);
  assert.ok(balances.carlos.balanceCents > 0);
  assert.equal(describeBalance(balances.carlos.balanceCents).kind, 'favor');

  assert.equal(balances.felipe.balanceCents, 5500 - shares.felipe - totalRefunded);
  assert.equal(balances.israel.balanceCents, -shares.israel);
  assert.equal(sumOfBalances(balances), 0); // invariante contable, obligatorio (sección 26)
});

test('escenario Bs 55: crédito de Carlos se arrastra a una compra futura donde no paga', () => {
  const shares1 = splitEqual(5500, ['felipe', 'carlos', 'israel']);
  const purchase1 = { id: 'p1', payerId: 'felipe', amountCents: 5500, shares: shares1, participantIds: ['felipe', 'carlos', 'israel'] };
  const settlements = [
    { id: 's1', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 },
    { id: 's2', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 },
  ];
  const carlosCreditAfterP1 = 2000 - shares1.carlos;

  // Nueva compra: Bs 45 entre los tres, Bs 15 cada uno, paga Felipe. Carlos no aporta nada a esta.
  const purchase2 = {
    id: 'p2',
    payerId: 'felipe',
    amountCents: 4500,
    shares: { felipe: 1500, carlos: 1500, israel: 1500 },
    participantIds: ['felipe', 'carlos', 'israel'],
  };

  const balances = computeBalances(people, [purchase1, purchase2], settlements);

  // Carlos pasa de +credito a (credito - 1500), sin tocar el costo histórico de purchase1.
  assert.equal(balances.carlos.balanceCents, carlosCreditAfterP1 - 1500);
  assert.equal(describeBalance(balances.carlos.balanceCents).kind, 'pending');
  assert.equal(sumOfBalances(balances), 0);
});

test('invariante contable: sum(balance) siempre es 0, con varias compras y transferencias mezcladas', () => {
  const purchases = [
    { id: 'p1', payerId: 'felipe', amountCents: 5500, shares: splitEqual(5500, ['felipe', 'carlos', 'israel']), participantIds: ['felipe', 'carlos', 'israel'] },
    { id: 'p2', payerId: 'carlos', amountCents: 3000, shares: splitEqual(3000, ['felipe', 'carlos']), participantIds: ['felipe', 'carlos'] },
    { id: 'p3', payerId: 'israel', amountCents: 999, shares: splitEqual(999, ['felipe', 'carlos', 'israel']), participantIds: ['felipe', 'carlos', 'israel'] },
  ];
  const settlements = [
    { id: 's1', purchaseId: 'p1', fromPersonId: 'carlos', toPersonId: 'felipe', amountCents: 1000 },
    { id: 's2', purchaseId: null, fromPersonId: 'israel', toPersonId: 'carlos', amountCents: 500 },
    { id: 's3', purchaseId: 'p3', fromPersonId: 'felipe', toPersonId: 'israel', amountCents: 333 },
  ];

  const balances = computeBalances(people, purchases, settlements);
  assert.equal(sumOfBalances(balances), 0);
});
