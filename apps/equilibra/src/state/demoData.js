// Datos de demostración, solo para probar la app (saldos variados, categorías,
// devoluciones parciales/completas, transferencias, recomendaciones). Se
// cargan únicamente si el usuario lo pide explícitamente desde Ajustes —
// nunca automáticamente.

import * as repo from '../db/repositories.js';
import { splitEqual, splitWeighted } from '../logic/split.js';

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export async function loadDemoData() {
  const people = {};
  for (const name of ['Felipe', 'Carlos', 'Diego', 'Ana']) {
    // eslint-disable-next-line no-await-in-loop
    people[name] = await repo.createPerson({ name });
  }
  const ids = {
    felipe: people.Felipe.id,
    carlos: people.Carlos.id,
    diego: people.Diego.id,
    ana: people.Ana.id,
  };

  const catComida = await repo.createCategory({ name: 'Comida' });
  const catBebidas = await repo.createCategory({ name: 'Bebidas' });
  const catCafe = await repo.createCategory({ name: 'Café' });
  const catSnacks = await repo.createCategory({ name: 'Snacks' });

  await repo.createProduct({ name: 'Café', categoryId: catCafe.id });
  await repo.createProduct({ name: 'Agua', categoryId: catBebidas.id });
  await repo.createProduct({ name: 'Hielo', categoryId: catBebidas.id });
  await repo.createProduct({ name: 'Galletas', categoryId: catSnacks.id });

  const all = [ids.felipe, ids.carlos, ids.diego, ids.ana];

  const purchases = [
    { payerId: ids.felipe, amountCents: 12000, categoryId: catComida.id, concept: 'Almuerzo de equipo', participants: all, daysAgo: 18 },
    { payerId: ids.carlos, amountCents: 6000, categoryId: catBebidas.id, concept: 'Bebidas para la reunión', participants: all, daysAgo: 16 },
    { payerId: ids.diego, amountCents: 3500, categoryId: catCafe.id, concept: 'Café de la tarde', participants: [ids.felipe, ids.carlos, ids.diego], daysAgo: 12 },
    { payerId: ids.felipe, amountCents: 9000, categoryId: catComida.id, concept: 'Pedido de hamburguesas', participants: all, daysAgo: 9 },
    { payerId: ids.ana, amountCents: 4200, categoryId: catSnacks.id, concept: 'Snacks de oficina', participants: all, daysAgo: 6 },
    { payerId: ids.felipe, amountCents: 15000, categoryId: catComida.id, concept: 'Cena de cierre de sprint', participants: all, daysAgo: 3, weighted: { [ids.felipe]: 1, [ids.carlos]: 2, [ids.diego]: 1, [ids.ana]: 1 } },
    { payerId: ids.carlos, amountCents: 2000, categoryId: catCafe.id, concept: 'Café rápido', participants: [ids.carlos, ids.ana], daysAgo: 1 },
  ];

  const createdPurchases = [];
  for (const p of purchases) {
    const splitMode = p.weighted ? 'weighted' : 'equal';
    const shares = p.weighted ? splitWeighted(p.amountCents, p.weighted) : splitEqual(p.amountCents, p.participants);
    // eslint-disable-next-line no-await-in-loop
    const created = await repo.createPurchase({
      datetime: daysAgoIso(p.daysAgo),
      concept: p.concept,
      categoryId: p.categoryId,
      productId: null,
      amountCents: p.amountCents,
      payerId: p.payerId,
      participantIds: p.participants,
      splitMode,
      weights: p.weighted || null,
      shares,
      note: '',
    });
    createdPurchases.push(created);
  }

  // Almuerzo de equipo (Bs 120, paga Felipe, Bs 30 c/u): Carlos devuelve una
  // parte y Diego la totalidad, para mostrar los tres estados de una compra
  // (pendiente / parcialmente saldada para Carlos / saldada para Diego).
  const almuerzo = createdPurchases[0];
  await repo.createSettlement({
    datetime: daysAgoIso(15),
    fromPersonId: ids.carlos,
    toPersonId: ids.felipe,
    purchaseId: almuerzo.id,
    amountCents: 1500,
    note: '',
  });
  await repo.createSettlement({
    datetime: daysAgoIso(14),
    fromPersonId: ids.diego,
    toPersonId: ids.felipe,
    purchaseId: almuerzo.id,
    amountCents: 3000,
    note: '',
  });

  // Transferencia general, sin ligar a ninguna compra puntual.
  await repo.createSettlement({
    datetime: daysAgoIso(2),
    fromPersonId: ids.diego,
    toPersonId: ids.felipe,
    purchaseId: null,
    amountCents: 4000,
    note: 'Transferencia por QR',
  });
}
