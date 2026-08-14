// Capa de acceso a IndexedDB. Sin dependencias externas.
// Único punto que conoce el nombre de la base, versión y esquema de object stores.
// Todo lo demás (repositories.js, lógica de negocio, UI) pasa siempre por aquí.

const DB_NAME = 'equilibra-db';
// v1 -> v2: las compensaciones (ahora "transferencias") ganan un campo opcional
// `purchaseId` para poder representar devoluciones ligadas a una compra
// concreta (ver logic/refunds.js). Es un campo aditivo: los registros viejos
// simplemente no lo tienen (equivale a `null`, "transferencia general"), así
// que no hace falta reescribir datos existentes — solo agregar el índice
// nuevo sobre el object store ya existente, preservando todo lo demás.
//
// v2 -> v3: soporte para "grupo compartido" (ver src/sync/). Cada entidad
// sincronizable gana dos campos aditivos: `groupId` (a qué grupo remoto
// pertenece; `null`/ausente = todavía no está vinculada a ningún grupo) y
// `deletedAt` (tombstone: un registro "borrado" se marca así en vez de
// eliminarse de verdad, para que la sincronización pueda propagar el borrado
// sin que un dispositivo que todavía no vio el cambio lo "resucite"). Se
// agrega también el store `outbox` (cola de cambios pendientes de subir) y
// se reutiliza `meta` para guardar el estado de sync (grupo activo, cursor,
// identidad local). Ningún dato existente se reescribe.
const DB_VERSION = 3;

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = event.target.transaction;

      if (!db.objectStoreNames.contains('people')) {
        const store = db.createObjectStore('people', { keyPath: 'id' });
        store.createIndex('active', 'active');
      }

      if (!db.objectStoreNames.contains('categories')) {
        const store = db.createObjectStore('categories', { keyPath: 'id' });
        store.createIndex('archived', 'archived');
      }

      if (!db.objectStoreNames.contains('products')) {
        const store = db.createObjectStore('products', { keyPath: 'id' });
        store.createIndex('archived', 'archived');
        store.createIndex('categoryId', 'categoryId');
        store.createIndex('useCount', 'useCount');
      }

      if (!db.objectStoreNames.contains('purchases')) {
        const store = db.createObjectStore('purchases', { keyPath: 'id' });
        store.createIndex('datetime', 'datetime');
        store.createIndex('payerId', 'payerId');
        store.createIndex('categoryId', 'categoryId');
      }

      if (!db.objectStoreNames.contains('settlements')) {
        const store = db.createObjectStore('settlements', { keyPath: 'id' });
        store.createIndex('datetime', 'datetime');
        store.createIndex('fromPersonId', 'fromPersonId');
        store.createIndex('toPersonId', 'toPersonId');
        store.createIndex('purchaseId', 'purchaseId');
      } else if (event.oldVersion < 2) {
        // DB creada con el esquema v1: el store ya existe con sus datos intactos,
        // solo le agregamos el índice nuevo por encima.
        const store = tx.objectStore('settlements');
        if (!store.indexNames.contains('purchaseId')) {
          store.createIndex('purchaseId', 'purchaseId');
        }
      }

      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }

      if (event.oldVersion < 3) {
        // Índice groupId sobre las entidades sincronizables, para poder
        // filtrar/limpiar por grupo sin recorrer todo el store en JS.
        ['people', 'categories', 'products', 'purchases', 'settlements'].forEach((name) => {
          const store = tx.objectStore(name);
          if (!store.indexNames.contains('groupId')) {
            store.createIndex('groupId', 'groupId');
          }
        });

        if (!db.objectStoreNames.contains('outbox')) {
          // keyPath compuesto "entity:recordId": a lo sumo una operación
          // pendiente por registro. Una escritura local nueva sobre un
          // registro que ya tenía cambios sin sincronizar simplemente
          // reemplaza esa entrada (ver src/sync/outbox.js) en vez de
          // acumular una cola creciente de pasos intermedios.
          const outbox = db.createObjectStore('outbox', { keyPath: 'key' });
          outbox.createIndex('createdAt', 'createdAt');
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña abierta.'));
  });

  return dbPromise;
}

/**
 * Ejecuta `fn` dentro de una transacción sobre los stores indicados.
 * `fn` recibe la transacción y debe devolver una promesa o valor con las operaciones ya disparadas.
 */
async function withTransaction(storeNames, mode, fn) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción abortada'));
    Promise.resolve(fn(tx))
      .then((value) => {
        result = value;
      })
      .catch((err) => {
        try {
          tx.abort();
        } catch {
          /* ya abortada */
        }
        reject(err);
      });
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbGetAll(storeName) {
  return withTransaction([storeName], 'readonly', (tx) =>
    requestToPromise(tx.objectStore(storeName).getAll())
  );
}

export async function dbGetAllByIndex(storeName, indexName, value) {
  return withTransaction([storeName], 'readonly', (tx) =>
    requestToPromise(tx.objectStore(storeName).index(indexName).getAll(value))
  );
}

export async function dbGet(storeName, id) {
  return withTransaction([storeName], 'readonly', (tx) =>
    requestToPromise(tx.objectStore(storeName).get(id))
  );
}

export async function dbPut(storeName, value) {
  return withTransaction([storeName], 'readwrite', (tx) =>
    requestToPromise(tx.objectStore(storeName).put(value))
  ).then(() => value);
}

export async function dbBulkPut(storeName, values) {
  return withTransaction([storeName], 'readwrite', (tx) => {
    const store = tx.objectStore(storeName);
    values.forEach((v) => store.put(v));
  }).then(() => values);
}

export async function dbDelete(storeName, id) {
  return withTransaction([storeName], 'readwrite', (tx) =>
    requestToPromise(tx.objectStore(storeName).delete(id))
  );
}

export async function dbClearAll(storeNames) {
  return withTransaction(storeNames, 'readwrite', (tx) => {
    storeNames.forEach((name) => tx.objectStore(name).clear());
  });
}

/**
 * Punto de escape controlado para operaciones que necesitan tocar más de un
 * store de forma atómica (ej. borrar una compra junto con sus devoluciones).
 * Sigue siendo el único módulo que conoce IndexedDB: repositories.js compone
 * operaciones con esto, pero nunca importa `indexedDB` directamente.
 */
export async function dbTransaction(storeNames, mode, fn) {
  return withTransaction(storeNames, mode, fn);
}

export const ALL_STORES = ['people', 'categories', 'products', 'purchases', 'settlements', 'meta', 'outbox'];
export const SYNCED_STORES = ['people', 'categories', 'products', 'purchases', 'settlements'];
