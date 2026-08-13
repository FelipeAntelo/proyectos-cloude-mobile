// Cola local de cambios pendientes de subir. A lo sumo una entrada por
// registro (`entity:recordId`): una escritura local nueva sobre algo que ya
// tenía cambios sin sincronizar no acumula pasos intermedios — cuando le
// toque subir, SyncService lee el estado ACTUAL del registro en IndexedDB,
// no un snapshot viejo guardado acá. Eso hace que la cola sea naturalmente
// idempotente y se mantenga acotada.

import { dbGet, dbPut, dbDelete, dbGetAll } from '../db/db.js';
import { outboxKeyFor, isSyncable } from './mergeStrategy.js';

export async function enqueue(entity, recordId) {
  const key = outboxKeyFor(entity, recordId);
  const existing = await dbGet('outbox', key);
  if (existing) return existing;
  const entry = { key, entity, recordId, createdAt: new Date().toISOString(), attempts: 0, lastError: null };
  return dbPut('outbox', entry);
}

/**
 * Encola un registro recién creado/editado localmente, salvo que sea de
 * demostración (nunca debe llegar a un grupo compartido) o que no pertenezca
 * a ningún grupo activo (nada que sincronizar todavía).
 */
export async function enqueueIfSyncable(entity, record) {
  if (!record || !record.groupId || !isSyncable(record)) return null;
  return enqueue(entity, record.id);
}

export async function listPending() {
  const all = await dbGetAll('outbox');
  return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

export async function remove(key) {
  return dbDelete('outbox', key);
}

export async function markFailed(entry, error) {
  const updated = {
    ...entry,
    attempts: (entry.attempts || 0) + 1,
    lastError: error && error.message ? error.message : String(error || 'error desconocido'),
  };
  return dbPut('outbox', updated);
}

export async function count() {
  const all = await dbGetAll('outbox');
  return all.length;
}

export function pendingKeySet(entries) {
  return new Set(entries.map((e) => e.key));
}
