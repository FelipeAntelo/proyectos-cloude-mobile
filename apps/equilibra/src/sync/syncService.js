// Orquesta push (outbox -> Supabase) y pull (Supabase -> IndexedDB) sin que
// la UI hable nunca directo con Supabase. Local-first de verdad: toda
// escritura ya quedó en IndexedDB y en pantalla antes de que esto corra.
// Si falla (sin red, Supabase caído, credenciales no configuradas), la app
// sigue funcionando: los cambios quedan en el outbox para el próximo intento.

import { dbBulkPut, dbGet } from '../db/db.js';
import { getActiveGroup, getMeta, setMeta } from '../db/repositories.js';
import * as outbox from './outbox.js';
import { SYNCED_ENTITIES, partitionPulledRecords, nextCursor, isSyncable } from './mergeStrategy.js';
import { pushRecord, pullEntity, subscribeToGroupChanges } from '../remote/remoteRepository.js';
import { isSyncConfigured } from '../remote/config.js';

const CURSOR_META_KEY = 'syncCursor';
const PERIODIC_PULL_MS = 25000;

let listeners = [];
let status = { state: 'idle', pendingCount: 0, lastSyncAt: null, configured: isSyncConfigured() };
let syncing = false;
let queuedAnotherRun = false;
let periodicTimer = null;
let unsubscribeRealtime = null;
let started = false;

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      /* un listener roto no debe tumbar el resto */
    }
  });
}

function setStatus(patch) {
  status = { ...status, ...patch };
  emit();
}

export function onStatusChange(fn) {
  listeners.push(fn);
  fn(status);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function getStatus() {
  return status;
}

async function getCursorMap() {
  return getMeta(CURSOR_META_KEY, {});
}

async function setCursorMap(map) {
  return setMeta(CURSOR_META_KEY, map);
}

async function refreshPendingCount() {
  const pending = await outbox.listPending();
  setStatus({ pendingCount: pending.length });
  return pending;
}

/** Sube todo lo que haya en el outbox. No lanza: los fallos quedan encolados para reintentar. */
async function pushOutbox() {
  const pending = await outbox.listPending();
  let pushedAny = false;
  for (const entry of pending) {
    try {
      const record = await dbGet(entry.entity, entry.recordId);
      if (!record || !isSyncable(record) || !record.groupId) {
        await outbox.remove(entry.key);
        continue;
      }
      await pushRecord(entry.entity, record);
      await outbox.remove(entry.key);
      pushedAny = true;
    } catch (err) {
      await outbox.markFailed(entry, err);
    }
  }
  return pushedAny;
}

/** Trae cambios nuevos del grupo activo y los aplica localmente (ver mergeStrategy). */
async function pullAll(groupId) {
  const cursorMap = await getCursorMap();
  const pending = await outbox.listPending();
  const pendingKeys = outbox.pendingKeySet(pending);
  let appliedAny = false;

  for (const entity of SYNCED_ENTITIES) {
    const cursor = cursorMap[entity] || null;
    const pulled = await pullEntity(entity, groupId, cursor);
    if (pulled.length === 0) continue;

    const { toApply, deferred } = partitionPulledRecords(entity, pulled, pendingKeys);
    if (toApply.length > 0) {
      await dbBulkPut(entity, toApply);
      appliedAny = true;
    }
    cursorMap[entity] = nextCursor(cursor, [...toApply, ...deferred]);
  }

  await setCursorMap(cursorMap);
  return appliedAny;
}

/** Un ciclo completo: push primero (para no pisar ediciones propias con el pull), después pull. */
export async function syncNow({ silent = false } = {}) {
  if (!isSyncConfigured()) return;
  if (syncing) {
    queuedAnotherRun = true;
    return;
  }
  const group = await getActiveGroup();
  if (!group) return;

  syncing = true;
  if (!silent) setStatus({ state: 'syncing' });
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus({ state: 'offline' });
      return;
    }
    await pushOutbox();
    await pullAll(group.id);
    await refreshPendingCount();
    setStatus({ state: 'idle', lastSyncAt: new Date().toISOString() });
  } catch (err) {
    console.warn('Equilibra: fallo de sincronización, se reintentará.', err);
    setStatus({ state: 'error' });
  } finally {
    syncing = false;
    if (queuedAnotherRun) {
      queuedAnotherRun = false;
      syncNow({ silent: true });
    }
  }
}

async function setUpRealtime(groupId) {
  if (unsubscribeRealtime) {
    unsubscribeRealtime();
    unsubscribeRealtime = null;
  }
  try {
    unsubscribeRealtime = await subscribeToGroupChanges(groupId, () => syncNow({ silent: true }));
  } catch {
    // Realtime es una mejora de UX, no una dependencia crítica: si falla, el
    // pull periódico igual mantiene todo al día.
  }
}

/** Arranca el motor de sync. Seguro de llamar aunque no haya credenciales o no haya grupo activo. */
export async function start() {
  if (started) return;
  started = true;
  await refreshPendingCount();

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => syncNow());
    window.addEventListener('offline', () => setStatus({ state: 'offline' }));
    if (navigator.onLine === false) setStatus({ state: 'offline' });
  }

  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = setInterval(() => syncNow({ silent: true }), PERIODIC_PULL_MS);

  const group = await getActiveGroup();
  if (group) {
    syncNow();
    setUpRealtime(group.id);
  }
}

/**
 * Se llama cuando el dispositivo se vincula a un grupo (creado o unido por
 * invitación). Espera a que termine el primer push+pull real — quien llama
 * a esto (p. ej. "Preparando el grupo…") necesita que al resolver la
 * promesa el snapshot ya esté aplicado localmente, no solo encolado.
 */
export async function onGroupJoined(groupId) {
  await setCursorMap({});
  await refreshPendingCount();
  await syncNow();
  setUpRealtime(groupId);
}

/** Notifica al motor de sync que hay un cambio local nuevo para encolar y subir pronto. */
export async function notifyLocalChange(entity, record) {
  const enqueued = await outbox.enqueueIfSyncable(entity, record);
  if (!enqueued) return;
  await refreshPendingCount();
  syncNow({ silent: true });
}
