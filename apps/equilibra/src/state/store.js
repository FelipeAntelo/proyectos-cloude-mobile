// Store central en memoria, sincronizado con IndexedDB. La UI nunca llama a los
// repositorios directamente: siempre pasa por acá, así hay un único punto que
// notifica a las vistas cuando algo cambia (patrón pub/sub simple, sin librerías).

import * as repo from '../db/repositories.js';
import { computeBalances } from '../logic/balances.js';
import { buildPurchasePayload } from '../logic/purchaseBuilder.js';
import { validateSettlementInput } from '../logic/validation.js';
import { parseAmountToCents } from '../logic/money.js';
import { hasDemoData as computeHasDemoData } from '../logic/demoCleanup.js';

const listeners = new Set();

const state = {
  loading: true,
  people: [],
  categories: [],
  products: [],
  purchases: [],
  settlements: [],
  balances: {},
  hasDemoData: false,
};

function recomputeDerived() {
  state.balances = computeBalances(state.people, state.purchases, state.settlements);
  state.hasDemoData = computeHasDemoData(state);
}

function notify() {
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export async function init() {
  const [people, categories, products, purchases, settlements] = await Promise.all([
    repo.listPeople(),
    repo.listCategories(),
    repo.listProducts(),
    repo.listPurchases(),
    repo.listSettlements(),
  ]);
  state.people = people;
  state.categories = categories;
  state.products = products;
  state.purchases = purchases;
  state.settlements = settlements;
  recomputeDerived();
  state.loading = false;
  notify();
  return state;
}

async function refreshFrom(mutator) {
  await mutator();
  const [people, categories, products, purchases, settlements] = await Promise.all([
    repo.listPeople(),
    repo.listCategories(),
    repo.listProducts(),
    repo.listPurchases(),
    repo.listSettlements(),
  ]);
  state.people = people;
  state.categories = categories;
  state.products = products;
  state.purchases = purchases;
  state.settlements = settlements;
  recomputeDerived();
  notify();
}

// ---------- Personas ----------

export async function addPerson(name, color) {
  return refreshFrom(() => repo.createPerson({ name, color }));
}

export async function editPerson(id, patch) {
  return refreshFrom(() => repo.updatePerson(id, patch));
}

export async function setPersonActive(id, active) {
  return refreshFrom(() => repo.setPersonActive(id, active));
}

// ---------- Categorías ----------

export async function addCategory(name) {
  return refreshFrom(() => repo.createCategory({ name }));
}

export async function editCategory(id, patch) {
  return refreshFrom(() => repo.updateCategory(id, patch));
}

export async function setCategoryArchived(id, archived) {
  return refreshFrom(() => repo.setCategoryArchived(id, archived));
}

// ---------- Productos ----------

export async function addProduct(name, categoryId) {
  return refreshFrom(() => repo.createProduct({ name, categoryId }));
}

export async function editProduct(id, patch) {
  return refreshFrom(() => repo.updateProduct(id, patch));
}

export async function setProductArchived(id, archived) {
  return refreshFrom(() => repo.setProductArchived(id, archived));
}

// ---------- Compras ----------

export async function addPurchase(rawInput) {
  const payload = buildPurchasePayload({ ...rawInput, peopleIds: state.people.map((p) => p.id) });
  await refreshFrom(() => repo.createPurchase(payload));
  if (payload.productId) {
    await refreshFrom(() => repo.bumpProductUse(payload.productId));
  }
  return payload;
}

export async function editPurchase(id, rawInput) {
  const payload = buildPurchasePayload({ ...rawInput, peopleIds: state.people.map((p) => p.id) });
  return refreshFrom(() => repo.updatePurchase(id, payload));
}

/** Cuántas devoluciones/transferencias quedarían huérfanas si se borra esta compra. Para confirmar con el usuario antes de llamar a removePurchase. */
export async function getSettlementsForPurchase(purchaseId) {
  return repo.listSettlementsForPurchase(purchaseId);
}

export async function removePurchase(id) {
  return refreshFrom(() => repo.deletePurchaseWithSettlements(id));
}

// ---------- Transferencias (transferencia general o devolución ligada a una compra) ----------

export async function addSettlement({ amountInput, fromPersonId, toPersonId, purchaseId, note, datetime }) {
  const amountCents = parseAmountToCents(amountInput);
  const errors = validateSettlementInput({
    amountCents,
    fromPersonId,
    toPersonId,
    peopleIds: state.people.map((p) => p.id),
  });
  if (errors.length > 0) throw new Error(errors.join(' '));

  return refreshFrom(() =>
    repo.createSettlement({ amountCents, fromPersonId, toPersonId, purchaseId: purchaseId || null, note, datetime })
  );
}

export async function editSettlement(id, { amountInput, fromPersonId, toPersonId, purchaseId, note, datetime }) {
  const amountCents = parseAmountToCents(amountInput);
  const errors = validateSettlementInput({
    amountCents,
    fromPersonId,
    toPersonId,
    peopleIds: state.people.map((p) => p.id),
  });
  if (errors.length > 0) throw new Error(errors.join(' '));

  return refreshFrom(() =>
    repo.updateSettlement(id, { amountCents, fromPersonId, toPersonId, purchaseId: purchaseId || null, note, datetime })
  );
}

export async function removeSettlement(id) {
  return refreshFrom(() => repo.deleteSettlement(id));
}

// ---------- Backup ----------

export async function exportBackup() {
  return repo.exportAllData();
}

export async function importBackup(backup, options) {
  return refreshFrom(() => repo.importAllData(backup, options));
}

export async function wipeAll() {
  return refreshFrom(() => repo.wipeAllData());
}

export async function deleteDemoData() {
  let result;
  await refreshFrom(async () => {
    result = await repo.deleteDemoData();
  });
  return result;
}

export async function getSetting(key, fallback) {
  return repo.getMeta(key, fallback);
}

export async function setSetting(key, value) {
  return repo.setMeta(key, value);
}
