// Capa de acceso a IndexedDB. Sin dependencias externas.
// Único punto que conoce el nombre de la base, versión y esquema de object stores.
// Todo lo demás (repositories.js, lógica de negocio, UI) pasa siempre por aquí.

const DB_NAME = 'equilibra-db';
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

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
      }

      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }

      event.target.transaction.oncomplete = () => {
        // no-op: reservado para futuras migraciones incrementales por versión.
      };
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

export const ALL_STORES = ['people', 'categories', 'products', 'purchases', 'settlements', 'meta'];
