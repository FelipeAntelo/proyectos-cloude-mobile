// Store central en memoria, sincronizado con IndexedDB. La UI nunca llama a los
// repositorios directamente: siempre pasa por acá, así hay un único punto que
// notifica a las vistas cuando algo cambia (patrón pub/sub simple, sin librerías).
//
// Grupo compartido (v1.3): esta capa también es el único lugar que conoce
// tanto los repositorios locales como el motor de sync — la UI pide
// "creá un grupo" o "registrá esta compra", nunca habla con Supabase
// directo. Toda escritura sigue local-first: se guarda y se refleja en
// pantalla antes de que el outbox intente subirla.

import * as repo from '../db/repositories.js';
import { computeBalances } from '../logic/balances.js';
import { buildPurchasePayload } from '../logic/purchaseBuilder.js';
import { validateSettlementInput } from '../logic/validation.js';
import { parseAmountToCents } from '../logic/money.js';
import { hasDemoData as computeHasDemoData } from '../logic/demoCleanup.js';
import * as remote from '../remote/remoteRepository.js';
import * as sync from '../sync/syncService.js';
import { isSyncConfigured } from '../remote/config.js';

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
  group: null, // { id, name } | null — grupo compartido activo en este dispositivo
  localPersonId: null, // quién soy yo en este grupo (elegido una vez, guardado local)
  sync: sync.getStatus(),
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

async function reloadAll() {
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
}

export async function init() {
  await reloadAll();
  state.group = await repo.getActiveGroup();
  state.localPersonId = await repo.getLocalPersonId();
  state.loading = false;
  notify();

  let wasSyncing = false;
  sync.onStatusChange(async (s) => {
    state.sync = s;
    if (wasSyncing && s.state !== 'syncing') {
      // Un ciclo de sync recién terminado ya escribió los pulls en IndexedDB,
      // pero el estado reactivo no se entera solo: sin este reload, cambios
      // que llegaron de otro dispositivo (compra, transferencia, persona
      // nueva) quedan invisibles en la UI hasta que alguna otra acción local
      // dispare un reloadAll() por su cuenta.
      await reloadAll();
      state.group = await repo.getActiveGroup();
    }
    wasSyncing = s.state === 'syncing';
    notify();
  });
  // El arranque de sync corre en segundo plano — Home ya se ve con lo local.
  sync.start();

  return state;
}

async function refreshFrom(mutator) {
  const result = await mutator();
  await reloadAll();
  notify();
  return result;
}

/** Encola en el outbox el/los registro(s) que acaba de escribir un mutator, si corresponde. */
function syncOne(entity, record) {
  if (record && record.id) sync.notifyLocalChange(entity, record);
}

// ---------- Personas ----------

export async function addPerson(name, color) {
  const person = await refreshFrom(() => repo.createPerson({ name, color }));
  syncOne('people', person);
  return person;
}

export async function editPerson(id, patch) {
  const person = await refreshFrom(() => repo.updatePerson(id, patch));
  syncOne('people', person);
  return person;
}

export async function setPersonActive(id, active) {
  const person = await refreshFrom(() => repo.setPersonActive(id, active));
  syncOne('people', person);
  return person;
}

// ---------- Categorías ----------

export async function addCategory(name) {
  const category = await refreshFrom(() => repo.createCategory({ name }));
  syncOne('categories', category);
  return category;
}

export async function editCategory(id, patch) {
  const category = await refreshFrom(() => repo.updateCategory(id, patch));
  syncOne('categories', category);
  return category;
}

export async function setCategoryArchived(id, archived) {
  const category = await refreshFrom(() => repo.setCategoryArchived(id, archived));
  syncOne('categories', category);
  return category;
}

// ---------- Productos ----------

export async function addProduct(name, categoryId) {
  const product = await refreshFrom(() => repo.createProduct({ name, categoryId }));
  syncOne('products', product);
  return product;
}

export async function editProduct(id, patch) {
  const product = await refreshFrom(() => repo.updateProduct(id, patch));
  syncOne('products', product);
  return product;
}

export async function setProductArchived(id, archived) {
  const product = await refreshFrom(() => repo.setProductArchived(id, archived));
  syncOne('products', product);
  return product;
}

// ---------- Compras ----------

export async function addPurchase(rawInput) {
  const payload = buildPurchasePayload({ ...rawInput, peopleIds: state.people.map((p) => p.id) });
  const created = await refreshFrom(() => repo.createPurchase(payload));
  syncOne('purchases', created);
  if (payload.productId) {
    const product = await refreshFrom(() => repo.bumpProductUse(payload.productId));
    syncOne('products', product);
  }
  return payload;
}

export async function editPurchase(id, rawInput) {
  const payload = buildPurchasePayload({ ...rawInput, peopleIds: state.people.map((p) => p.id) });
  const updated = await refreshFrom(() => repo.updatePurchase(id, payload));
  syncOne('purchases', updated);
  return updated;
}

/** Cuántas devoluciones/transferencias quedarían huérfanas si se borra esta compra. Para confirmar con el usuario antes de llamar a removePurchase. */
export async function getSettlementsForPurchase(purchaseId) {
  return repo.listSettlementsForPurchase(purchaseId);
}

export async function removePurchase(id) {
  const result = await refreshFrom(() => repo.deletePurchaseWithSettlements(id));
  if (result) {
    syncOne('purchases', result.purchase);
    (result.settlements || []).forEach((s) => syncOne('settlements', s));
  }
  return result;
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

  const settlement = await refreshFrom(() =>
    repo.createSettlement({ amountCents, fromPersonId, toPersonId, purchaseId: purchaseId || null, note, datetime })
  );
  syncOne('settlements', settlement);
  return settlement;
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

  const settlement = await refreshFrom(() =>
    repo.updateSettlement(id, { amountCents, fromPersonId, toPersonId, purchaseId: purchaseId || null, note, datetime })
  );
  syncOne('settlements', settlement);
  return settlement;
}

export async function removeSettlement(id) {
  const deleted = await refreshFrom(() => repo.deleteSettlement(id));
  syncOne('settlements', deleted);
  return deleted;
}

// ---------- Backup ----------

export async function exportBackup() {
  return repo.exportAllData();
}

export async function importBackup(backup, options) {
  return refreshFrom(() => repo.importAllData(backup, options));
}

export async function wipeAll() {
  const result = await refreshFrom(() => repo.wipeAllData());
  state.group = null;
  state.localPersonId = null;
  notify();
  return result;
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

// ---------- Grupo compartido ----------

export function isGroupSyncAvailable() {
  return isSyncConfigured();
}

export async function hasConflictingLocalState() {
  if (state.group) return { type: 'group', group: state.group };
  const hasRealData = state.people.length > 0 || state.purchases.length > 0 || state.settlements.length > 0;
  return hasRealData ? { type: 'localData' } : null;
}

export async function createGroup(name) {
  const groupId = await remote.rpcCreateGroup(name);
  await repo.setActiveGroup({ id: groupId, name });
  state.group = { id: groupId, name };
  notify();
  sync.onGroupJoined(groupId);
  return state.group;
}

/**
 * "Compartir este grupo": crea el grupo remoto y vincula TODO lo que ya
 * existe localmente sin recrearlo — mismos UUIDs, mismos balances. Es la
 * migración de una instalación existente hacia un grupo compartido.
 */
export async function shareCurrentGroupData(name) {
  const groupId = await remote.rpcCreateGroup(name);
  await repo.setActiveGroup({ id: groupId, name });
  const touched = await repo.attachAllLocalDataToGroup(groupId);
  await reloadAll();
  state.group = { id: groupId, name };
  notify();

  for (const [entity, ids] of Object.entries(touched)) {
    // eslint-disable-next-line no-await-in-loop
    for (const id of ids) await sync.notifyLocalChange(entity, { id, groupId, source: null });
  }
  sync.onGroupJoined(groupId);
  return state.group;
}

export async function previewInvite(token) {
  return remote.rpcPreviewInvite(token);
}

/** Canjea la invitación, vincula este dispositivo al grupo y trae el snapshot inicial. */
export async function redeemInvite(token) {
  const groupId = await remote.rpcRedeemInvite(token);
  const info = await remote.fetchGroup(groupId);
  await repo.setActiveGroup({ id: groupId, name: info.name });
  state.group = { id: groupId, name: info.name };
  notify();

  await sync.onGroupJoined(groupId);
  await reloadAll();
  notify();
  return state.group;
}

export async function generateInviteLink() {
  if (!state.group) throw new Error('No hay grupo activo.');
  return remote.rpcCreateInvite(state.group.id);
}

export async function renameActiveGroup(name) {
  if (!state.group) throw new Error('No hay grupo activo.');
  await remote.renameGroup(state.group.id, name);
  state.group = { ...state.group, name };
  await repo.setActiveGroup(state.group);
  notify();
  return state.group;
}

export async function selectLocalPerson(personId) {
  await repo.setLocalPersonId(personId);
  state.localPersonId = personId;
  notify();
}

export function syncNowManual() {
  return sync.syncNow();
}
