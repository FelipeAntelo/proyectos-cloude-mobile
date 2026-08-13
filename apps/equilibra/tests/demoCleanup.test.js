// Casos de la sección "Datos de demostración": cargar demo, mezclarla con
// datos reales, y eliminarla sin romper nada real. `planDemoCleanup` es pura
// (no toca IndexedDB), así que estos tests cubren la decisión completa sin
// necesitar un navegador.

import test from 'node:test';
import assert from 'node:assert/strict';
import { planDemoCleanup, hasDemoData } from '../src/logic/demoCleanup.js';

function demoDataset() {
  return {
    people: [
      { id: 'p-demo-1', name: 'Demo A', source: 'demo' },
      { id: 'p-demo-2', name: 'Demo B', source: 'demo' },
    ],
    categories: [{ id: 'c-demo-1', name: 'Demo cat', source: 'demo' }],
    products: [{ id: 'pr-demo-1', name: 'Demo prod', categoryId: 'c-demo-1', source: 'demo' }],
    purchases: [
      {
        id: 'pu-demo-1',
        payerId: 'p-demo-1',
        participantIds: ['p-demo-1', 'p-demo-2'],
        categoryId: 'c-demo-1',
        productId: 'pr-demo-1',
        source: 'demo',
      },
    ],
    settlements: [
      { id: 's-demo-1', purchaseId: 'pu-demo-1', fromPersonId: 'p-demo-2', toPersonId: 'p-demo-1', source: 'demo' },
      { id: 's-demo-2', purchaseId: null, fromPersonId: 'p-demo-1', toPersonId: 'p-demo-2', source: 'demo' },
    ],
  };
}

test('caso 1: cargar demo y eliminarla deja la base limpia', () => {
  const data = demoDataset();
  assert.equal(hasDemoData(data), true);

  const plan = planDemoCleanup(data);
  assert.deepEqual(plan.purchaseIds.sort(), ['pu-demo-1']);
  assert.deepEqual(plan.settlementIds.sort(), ['s-demo-1', 's-demo-2']);
  assert.deepEqual(plan.personIds.sort(), ['p-demo-1', 'p-demo-2']);
  assert.deepEqual(plan.categoryIds, ['c-demo-1']);
  assert.deepEqual(plan.productIds, ['pr-demo-1']);

  // simulamos aplicar el plan y confirmamos que ya no queda nada de demo
  const applied = applyPlan(data, plan);
  assert.equal(hasDemoData(applied), false);
  assert.equal(applied.people.length, 0);
  assert.equal(applied.purchases.length, 0);
  assert.equal(applied.settlements.length, 0);
});

test('caso 2: demo + compra real (usando personas de demo) -> solo permanece la compra real, las personas se conservan', () => {
  const data = demoDataset();
  data.purchases.push({
    id: 'pu-real-1',
    payerId: 'p-demo-1',
    participantIds: ['p-demo-1', 'p-demo-2'],
    categoryId: null,
    productId: null,
    source: null, // compra real, creada por el usuario después de cargar la demo
  });

  const plan = planDemoCleanup(data);
  assert.deepEqual(plan.purchaseIds, ['pu-demo-1']); // solo la compra demo se borra
  // las personas de demo siguen referenciadas por la compra real: no se borran
  assert.deepEqual(plan.personIds, []);

  const applied = applyPlan(data, plan);
  assert.deepEqual(applied.purchases.map((p) => p.id), ['pu-real-1']);
  assert.equal(applied.people.length, 2); // Demo A y Demo B se conservan porque la compra real las necesita
});

test('caso 3: demo + persona real -> la persona real permanece siempre', () => {
  const data = demoDataset();
  data.people.push({ id: 'p-real-1', name: 'Real', source: null });

  const plan = planDemoCleanup(data);
  assert.ok(!plan.personIds.includes('p-real-1'));

  const applied = applyPlan(data, plan);
  assert.ok(applied.people.some((p) => p.id === 'p-real-1'));
});

test('caso 4: eliminar demo cuando no existe no produce error y no borra nada', () => {
  const data = { people: [{ id: 'p-real-1', source: null }], categories: [], products: [], purchases: [], settlements: [] };
  assert.equal(hasDemoData(data), false);

  const plan = planDemoCleanup(data);
  assert.deepEqual(plan, { purchaseIds: [], settlementIds: [], personIds: [], categoryIds: [], productIds: [] });

  const applied = applyPlan(data, plan);
  assert.deepEqual(applied, data);
});

test('hasDemoData: detecta demo en cualquiera de las cinco colecciones', () => {
  assert.equal(hasDemoData({ people: [{ source: 'demo' }], categories: [], products: [], purchases: [], settlements: [] }), true);
  assert.equal(hasDemoData({ people: [], categories: [], products: [], purchases: [], settlements: [{ source: 'demo' }] }), true);
  assert.equal(hasDemoData({ people: [{ source: null }], categories: [], products: [], purchases: [], settlements: [] }), false);
});

function applyPlan(data, plan) {
  return {
    people: data.people.filter((p) => !plan.personIds.includes(p.id)),
    categories: data.categories.filter((c) => !plan.categoryIds.includes(c.id)),
    products: data.products.filter((p) => !plan.productIds.includes(p.id)),
    purchases: data.purchases.filter((p) => !plan.purchaseIds.includes(p.id)),
    settlements: data.settlements.filter((s) => !plan.settlementIds.includes(s.id)),
  };
}
