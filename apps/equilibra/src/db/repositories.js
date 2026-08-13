// Repositorios: única puerta de entrada a los datos para el resto de la app.
// La UI y la lógica de negocio nunca hablan con IndexedDB directamente, solo con estas funciones.
// Esta capa está pensada para poder reemplazarse mañana por un RemoteRepository (Supabase/Postgres)
// sin tocar el resto de la aplicación: firma de funciones estable, entidades con id/timestamps propios.

import { dbGetAll, dbGetAllByIndex, dbGet, dbPut, dbDelete, dbBulkPut, dbClearAll, dbTransaction, ALL_STORES } from './db.js';
import { uuid } from '../utils/uuid.js';
import { planDemoCleanup, hasDemoData as computeHasDemoData } from '../logic/demoCleanup.js';

const nowIso = () => new Date().toISOString();

// ---------- Personas ----------

export async function listPeople() {
  return dbGetAll('people');
}

export async function getPerson(id) {
  return dbGet('people', id);
}

export async function createPerson({ name, color, source }) {
  const person = {
    id: uuid(),
    name: name.trim(),
    color: color || null,
    active: true,
    source: source || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return dbPut('people', person);
}

export async function updatePerson(id, patch) {
  const existing = await dbGet('people', id);
  if (!existing) throw new Error('Persona no encontrada');
  const updated = { ...existing, ...patch, id, updatedAt: nowIso() };
  return dbPut('people', updated);
}

export async function setPersonActive(id, active) {
  return updatePerson(id, { active });
}

// ---------- Categorías ----------

export async function listCategories() {
  return dbGetAll('categories');
}

export async function createCategory({ name, source }) {
  const category = {
    id: uuid(),
    name: name.trim(),
    archived: false,
    source: source || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return dbPut('categories', category);
}

export async function updateCategory(id, patch) {
  const existing = await dbGet('categories', id);
  if (!existing) throw new Error('Categoría no encontrada');
  const updated = { ...existing, ...patch, id, updatedAt: nowIso() };
  return dbPut('categories', updated);
}

export async function setCategoryArchived(id, archived) {
  return updateCategory(id, { archived });
}

// ---------- Productos frecuentes ----------

export async function listProducts() {
  return dbGetAll('products');
}

export async function createProduct({ name, categoryId, source }) {
  const product = {
    id: uuid(),
    name: name.trim(),
    categoryId: categoryId || null,
    archived: false,
    useCount: 0,
    source: source || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return dbPut('products', product);
}

export async function updateProduct(id, patch) {
  const existing = await dbGet('products', id);
  if (!existing) throw new Error('Producto no encontrado');
  const updated = { ...existing, ...patch, id, updatedAt: nowIso() };
  return dbPut('products', updated);
}

export async function setProductArchived(id, archived) {
  return updateProduct(id, { archived });
}

export async function bumpProductUse(id) {
  const existing = await dbGet('products', id);
  if (!existing) return;
  return dbPut('products', { ...existing, useCount: (existing.useCount || 0) + 1, updatedAt: nowIso() });
}

// ---------- Compras ----------

export async function listPurchases() {
  return dbGetAll('purchases');
}

export async function getPurchase(id) {
  return dbGet('purchases', id);
}

export async function createPurchase(data) {
  const purchase = {
    id: uuid(),
    datetime: data.datetime || nowIso(),
    concept: data.concept.trim(),
    categoryId: data.categoryId || null,
    productId: data.productId || null,
    amountCents: data.amountCents,
    currency: data.currency || 'BOB',
    payerId: data.payerId,
    participantIds: [...data.participantIds],
    splitMode: data.splitMode,
    weights: data.weights || null,
    shares: { ...data.shares },
    note: data.note || '',
    source: data.source || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return dbPut('purchases', purchase);
}

export async function updatePurchase(id, data) {
  const existing = await dbGet('purchases', id);
  if (!existing) throw new Error('Compra no encontrada');
  const updated = {
    ...existing,
    ...data,
    participantIds: data.participantIds ? [...data.participantIds] : existing.participantIds,
    shares: data.shares ? { ...data.shares } : existing.shares,
    id,
    updatedAt: nowIso(),
  };
  return dbPut('purchases', updated);
}

export async function deletePurchase(id) {
  return dbDelete('purchases', id);
}

/**
 * Borra una compra junto con todas las devoluciones ligadas a ella (mismo
 * `purchaseId`), en una única transacción atómica. Evita dejar transferencias
 * huérfanas apuntando a una compra que ya no existe. El llamador (store.js) es
 * responsable de confirmar con el usuario antes de invocar esto.
 */
export async function deletePurchaseWithSettlements(purchaseId) {
  return dbTransaction(['purchases', 'settlements'], 'readwrite', async (tx) => {
    const settlementsStore = tx.objectStore('settlements');
    const linked = await new Promise((resolve, reject) => {
      const req = settlementsStore.index('purchaseId').getAll(purchaseId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    linked.forEach((s) => settlementsStore.delete(s.id));
    tx.objectStore('purchases').delete(purchaseId);
    return linked.length;
  });
}

// ---------- Transferencias (incluye devoluciones ligadas a una compra) ----------
// Una "settlement" es siempre el mismo hecho económico: dinero que se mueve de
// una persona a otra. `purchaseId` es opcional: si está presente, la UI la
// presenta como "devolución" de esa compra puntual; si es null, como
// "transferencia" general entre personas. No hay dos entidades ni doble
// contabilización: es un único movimiento con un dato de contexto opcional.

export async function listSettlements() {
  return dbGetAll('settlements');
}

export async function getSettlement(id) {
  return dbGet('settlements', id);
}

export async function listSettlementsForPurchase(purchaseId) {
  return dbGetAllByIndex('settlements', 'purchaseId', purchaseId);
}

export async function createSettlement(data) {
  const settlement = {
    id: uuid(),
    datetime: data.datetime || nowIso(),
    fromPersonId: data.fromPersonId,
    toPersonId: data.toPersonId,
    amountCents: data.amountCents,
    currency: data.currency || 'BOB',
    purchaseId: data.purchaseId || null,
    note: data.note || '',
    source: data.source || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return dbPut('settlements', settlement);
}

export async function updateSettlement(id, data) {
  const existing = await dbGet('settlements', id);
  if (!existing) throw new Error('Transferencia no encontrada');
  const updated = { ...existing, ...data, id, updatedAt: nowIso() };
  return dbPut('settlements', updated);
}

export async function deleteSettlement(id) {
  return dbDelete('settlements', id);
}

// ---------- Meta / configuración ----------

export async function getMeta(key, fallback = null) {
  const row = await dbGet('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  return dbPut('meta', { key, value });
}

// ---------- Backup ----------
// v1 -> v2: las transferencias pueden traer `purchaseId` (devoluciones ligadas
// a una compra). Es aditivo: un backup v1 (sin ese campo) importa igual en la
// v2 de la app, y un backup v2 importado en una v1 vieja simplemente ignoraría
// el campo extra. Por eso `importAllData` acepta cualquier schemaVersion <= la
// que soporta esta versión de la app (nunca una futura que no entienda).

export const BACKUP_SCHEMA_VERSION = 2;

export async function exportAllData() {
  const [people, categories, products, purchases, settlements] = await Promise.all([
    listPeople(),
    listCategories(),
    listProducts(),
    listPurchases(),
    listSettlements(),
  ]);
  return {
    schema: 'equilibra-backup',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: nowIso(),
    data: { people, categories, products, purchases, settlements },
  };
}

export async function importAllData(backup, { replace = false } = {}) {
  if (!backup || backup.schema !== 'equilibra-backup') {
    throw new Error('El archivo no es un backup válido de Equilibra.');
  }
  if (typeof backup.schemaVersion !== 'number' || backup.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error('El backup fue generado por una versión más nueva de la app.');
  }
  const { people = [], categories = [], products = [], purchases = [], settlements = [] } = backup.data || {};

  if (replace) {
    await dbClearAll(ALL_STORES.filter((s) => s !== 'meta'));
  }

  await Promise.all([
    dbBulkPut('people', people),
    dbBulkPut('categories', categories),
    dbBulkPut('products', products),
    dbBulkPut('purchases', purchases),
    dbBulkPut('settlements', settlements),
  ]);

  return { people: people.length, categories: categories.length, products: products.length, purchases: purchases.length, settlements: settlements.length };
}

export async function wipeAllData() {
  return dbClearAll(ALL_STORES.filter((s) => s !== 'meta'));
}

// ---------- Datos de demostración ----------
// Los registros que crea loadDemoData() llevan `source: 'demo'`. Borrarlos usa
// planDemoCleanup (lógica pura, ver logic/demoCleanup.js) para decidir qué
// borrar sin tocar nada real, incluso si el usuario mezcló datos reales con
// personas/categorías/productos que originalmente eran de demo.

export async function hasDemoData() {
  const [people, categories, products, purchases, settlements] = await Promise.all([
    listPeople(),
    listCategories(),
    listProducts(),
    listPurchases(),
    listSettlements(),
  ]);
  return computeHasDemoData({ people, categories, products, purchases, settlements });
}

export async function deleteDemoData() {
  const [people, categories, products, purchases, settlements] = await Promise.all([
    listPeople(),
    listCategories(),
    listProducts(),
    listPurchases(),
    listSettlements(),
  ]);
  const plan = planDemoCleanup({ people, categories, products, purchases, settlements });

  return dbTransaction(['people', 'categories', 'products', 'purchases', 'settlements'], 'readwrite', (tx) => {
    plan.purchaseIds.forEach((id) => tx.objectStore('purchases').delete(id));
    plan.settlementIds.forEach((id) => tx.objectStore('settlements').delete(id));
    plan.personIds.forEach((id) => tx.objectStore('people').delete(id));
    plan.categoryIds.forEach((id) => tx.objectStore('categories').delete(id));
    plan.productIds.forEach((id) => tx.objectStore('products').delete(id));
    return {
      purchases: plan.purchaseIds.length,
      settlements: plan.settlementIds.length,
      people: plan.personIds.length,
      categories: plan.categoryIds.length,
      products: plan.productIds.length,
    };
  });
}
