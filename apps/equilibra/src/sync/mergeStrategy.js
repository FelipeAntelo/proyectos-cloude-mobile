// Lógica pura de fusión pull/outbox: sin IndexedDB ni red, fácil de testear.
//
// Política de conflictos completa (ver SUPABASE_SETUP.md): "el servidor
// decide". `server_updated_at` lo pone siempre Postgres (nunca el reloj del
// teléfono), y dos upserts concurrentes al mismo id se resuelven en el orden
// en que el servidor los procesa — el último sobrescribe la fila entera. Acá
// solo queda una regla más, del lado del cliente: un pull nunca debe pisar
// localmente una edición propia que todavía no se subió.

export const SYNCED_ENTITIES = ['people', 'categories', 'products', 'purchases', 'settlements'];

export function outboxKeyFor(entity, id) {
  return `${entity}:${id}`;
}

/**
 * De los registros que llegaron en un pull para una entidad, cuáles hay que
 * aplicar (bulkPut) localmente: todos menos los que tienen una edición local
 * pendiente de subir en el outbox. Esos quedan "diferidos": el dispositivo
 * ya tiene, localmente, algo más nuevo para ese registro que todavía no
 * subió — aplicar el pull ahora lo perdería antes de que le tocara subir.
 * Una vez que esa entrada del outbox se suba (deje de estar pendiente), la
 * copia local ya coincide con lo que va a quedar en el servidor, así que no
 * hace falta re-pedir ese registro.
 */
export function partitionPulledRecords(entity, pulledRecords, pendingOutboxKeys) {
  const pendingSet = pendingOutboxKeys instanceof Set ? pendingOutboxKeys : new Set(pendingOutboxKeys);
  const toApply = [];
  const deferred = [];
  for (const record of pulledRecords) {
    if (pendingSet.has(outboxKeyFor(entity, record.id))) deferred.push(record);
    else toApply.push(record);
  }
  return { toApply, deferred };
}

/**
 * Próximo cursor de sync para una entidad tras un lote de pull: el mayor
 * `serverUpdatedAt` visto (aplicado o diferido — diferir no debe hacer que
 * se vuelva a pedir por siempre, ver arriba), o el cursor anterior si el
 * lote vino vacío.
 */
export function nextCursor(previousCursor, records) {
  let max = previousCursor || null;
  for (const record of records) {
    const value = record.serverUpdatedAt;
    if (!value) continue;
    if (!max || value > max) max = value;
  }
  return max;
}

/** Upsert por id sobre un array — modela lo que hace bulkPut en IndexedDB / upsert en Postgres. */
export function upsertById(list, record) {
  const idx = list.findIndex((r) => r.id === record.id);
  if (idx === -1) return [...list, record];
  const copy = list.slice();
  copy[idx] = record;
  return copy;
}

/** Filtra tombstones: una lista "visible" nunca incluye deletedAt. */
export function visible(list) {
  return list.filter((r) => !r.deletedAt);
}

/** Nunca sincronizar datos de demostración: se filtran antes de encolarlos. */
export function isSyncable(record) {
  return Boolean(record) && record.source !== 'demo';
}
