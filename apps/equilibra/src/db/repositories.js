// Repositorios: única puerta de entrada a los datos para el resto de la app.
// La UI y la lógica de negocio nunca hablan con IndexedDB directamente, solo con estas funciones.
// Esta capa está pensada para poder reemplazarse mañana por un RemoteRepository (Supabase/Postgres)
// sin tocar el resto de la aplicación: firma de funciones estable, entidades con id/timestamps propios.

import { dbGetAll, dbGetAllByIndex, dbGet, dbPut, dbDelete, dbBulkPut, dbClearAll, dbTransaction, ALL_STORES, SYNCED_STORES } from './db.js';
import { uuid } from '../utils/uuid.js';
import { planDemoCleanup, hasDemoData as computeHasDemoData } from '../logic/demoCleanup.js';

const nowIso = () => new Date().toISOString();

// ---------- Grupo activo / identidad local ----------
// "Grupo compartido" (v1.3) es opcional: si el dispositivo nunca se conectó a
// uno, activeGroup es null y todo funciona exactamente como antes (local-only).
// Cuando hay grupo activo, los create* de abajo estampan `groupId` para que
// SyncService sepa qué registros subir.

const ACTIVE_GROUP_META_KEY = 'activeGroup';
const LOCAL_PERSON_META_KEY = 'localPersonId';

export async function getActiveGroup() {
  return getMeta(ACTIVE_GROUP_META_KEY, null);
}

async function getActiveGroupId() {
  const group = await getMeta(ACTIVE_GROUP_META_KEY, null);
  return group ? group.id : null;
}

export async function setActiveGroup(group) {
  return setMeta(ACTIVE_GROUP_META_KEY, group);
}

export async function clearActiveGroup() {
  return setMeta(ACTIVE_GROUP_META_KEY, null);
}

export async function getLocalPersonId() {
  return getMeta(LOCAL_PERSON_META_KEY, null);
}

export async function setLocalPersonId(personId) {
  return setMeta(LOCAL_PERSON_META_KEY, personId);
}

/**
 * "Compartir este grupo": estampa `groupId` en TODO lo que ya existe
 * localmente y todavía no pertenece a ningún grupo. Conserva los UUIDs
 * actuales (no crea registros nuevos) para que los balances no cambien y no
 * haya duplicados al subir. Devuelve cuántos registros de cada tipo se
 * vincularon, para que el llamador pueda encolarlos en el outbox.
 */
export async function attachAllLocalDataToGroup(groupId) {
  return dbTransaction(SYNCED_STORES, 'readwrite', async (tx) => {
    const touched = {};
    for (const storeName of SYNCED_STORES) {
      const store = tx.objectStore(storeName);
      const all = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const ids = [];
      for (const record of all) {
        if (record.groupId) continue; // ya pertenece a un grupo: no tocar
        store.put({ ...record, groupId, updatedAt: nowIso() });
        ids.push(record.id);
      }
      touched[storeName] = ids;
    }
    return touched;
  });
}

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
    groupId: await getActiveGroupId(),
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
    groupId: await getActiveGroupId(),
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
    groupId: await getActiveGroupId(),
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
  const all = await dbGetAll('purchases');
  return all.filter((p) => !p.deletedAt);
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
    groupId: await getActiveGroupId(),
    createdByPersonId: (await getLocalPersonId()) || null,
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

/**
 * Borra una compra. Si pertenece a un grupo compartido, no se elimina de
 * verdad: se marca `deletedAt` (tombstone) para que la sincronización pueda
 * propagar el borrado sin que un dispositivo que todavía no vio el cambio la
 * "resucite" en el siguiente pull. Sin grupo activo, se borra de una (mismo
 * comportamiento que antes de v1.3).
 */
export async function deletePurchase(id) {
  const existing = await dbGet('purchases', id);
  if (existing && existing.groupId) {
    return dbPut('purchases', { ...existing, deletedAt: nowIso(), updatedAt: nowIso() });
  }
  return dbDelete('purchases', id);
}

/**
 * Borra una compra junto con todas las devoluciones ligadas a ella (mismo
 * `purchaseId`), en una única transacción atómica. Evita dejar transferencias
 * huérfanas apuntando a una compra que ya no existe. El llamador (store.js) es
 * responsable de confirmar con el usuario antes de invocar esto.
 */
/**
 * Devuelve `{ count, purchase, settlements }`: `count` para la UI ("se
 * borraron N devoluciones junto con la compra"), y `purchase`/`settlements`
 * con los registros tombstoned (o `null`/`[]` si no había grupo activo y se
 * borraron de verdad) para que el llamador los encole en el outbox.
 */
export async function deletePurchaseWithSettlements(purchaseId) {
  return dbTransaction(['purchases', 'settlements'], 'readwrite', async (tx) => {
    const purchasesStore = tx.objectStore('purchases');
    const settlementsStore = tx.objectStore('settlements');
    const purchase = await new Promise((resolve, reject) => {
      const req = purchasesStore.get(purchaseId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const linked = await new Promise((resolve, reject) => {
      const req = settlementsStore.index('purchaseId').getAll(purchaseId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const grouped = Boolean(purchase && purchase.groupId);
    const stamp = nowIso();
    const tombstonedSettlements = [];
    let tombstonedPurchase = null;

    linked.forEach((s) => {
      if (grouped) {
        const updated = { ...s, deletedAt: stamp, updatedAt: stamp };
        settlementsStore.put(updated);
        tombstonedSettlements.push(updated);
      } else {
        settlementsStore.delete(s.id);
      }
    });
    if (grouped) {
      tombstonedPurchase = { ...purchase, deletedAt: stamp, updatedAt: stamp };
      purchasesStore.put(tombstonedPurchase);
    } else if (purchase) {
      purchasesStore.delete(purchaseId);
    }

    return { count: linked.length, purchase: tombstonedPurchase, settlements: tombstonedSettlements };
  });
}

// ---------- Transferencias (incluye devoluciones ligadas a una compra) ----------
// Una "settlement" es siempre el mismo hecho económico: dinero que se mueve de
// una persona a otra. `purchaseId` es opcional: si está presente, la UI la
// presenta como "devolución" de esa compra puntual; si es null, como
// "transferencia" general entre personas. No hay dos entidades ni doble
// contabilización: es un único movimiento con un dato de contexto opcional.

export async function listSettlements() {
  const all = await dbGetAll('settlements');
  return all.filter((s) => !s.deletedAt);
}

export async function getSettlement(id) {
  return dbGet('settlements', id);
}

export async function listSettlementsForPurchase(purchaseId) {
  const all = await dbGetAllByIndex('settlements', 'purchaseId', purchaseId);
  return all.filter((s) => !s.deletedAt);
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
    groupId: await getActiveGroupId(),
    createdByPersonId: (await getLocalPersonId()) || null,
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

/**
 * Igual criterio que deletePurchase: tombstone si pertenece a un grupo,
 * borrado directo si es puramente local.
 */
export async function deleteSettlement(id) {
  const existing = await dbGet('settlements', id);
  if (existing && existing.groupId) {
    return dbPut('settlements', { ...existing, deletedAt: nowIso(), updatedAt: nowIso() });
  }
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

/**
 * "Borrar todos los datos" es un botón local por dispositivo: además de
 * vaciar las entidades, desvincula este dispositivo del grupo (la membresía
 * remota no se toca — solo el estado local de "a qué grupo pertenezco").
 * Así el dispositivo vuelve a la pantalla de entrada en vez de quedar en un
 * estado inconsistente (grupo activo sin ninguna persona/compra local).
 */
export async function wipeAllData() {
  await dbClearAll(ALL_STORES.filter((s) => s !== 'meta'));
  await clearActiveGroup();
  await setLocalPersonId(null);
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
