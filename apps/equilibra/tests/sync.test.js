// Tests del motor de sync (grupo compartido, v1.3). Todo lo que se puede
// probar sin IndexedDB ni red se prueba acá con las funciones puras de
// src/sync/mergeStrategy.js — incluyendo una simulación de dos dispositivos
// compartiendo una tabla remota (un array en memoria) para probar
// idempotencia, tombstones y el invariante financiero de punta a punta.
// Lo que sí depende de IndexedDB/red real (unirse a un grupo, "¿quién sos?",
// offline/reconexión reales) se cubre con Playwright (ver e2e/).

import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionPulledRecords, nextCursor, upsertById, visible, isSyncable, outboxKeyFor, SYNCED_ENTITIES } from '../src/sync/mergeStrategy.js';
import { computeBalances } from '../src/logic/balances.js';

test('outboxKeyFor: namespacea por entidad para no pisar ids repetidos entre tablas', () => {
  assert.equal(outboxKeyFor('purchases', 'abc'), 'purchases:abc');
  assert.notEqual(outboxKeyFor('purchases', 'abc'), outboxKeyFor('settlements', 'abc'));
});

test('partitionPulledRecords: diferir un registro con edición local pendiente en el outbox', () => {
  const pulled = [{ id: 'p1', concept: 'remoto v2' }, { id: 'p2', concept: 'sin conflicto' }];
  const pending = new Set([outboxKeyFor('purchases', 'p1')]);
  const { toApply, deferred } = partitionPulledRecords('purchases', pulled, pending);
  assert.deepEqual(toApply.map((r) => r.id), ['p2']);
  assert.deepEqual(deferred.map((r) => r.id), ['p1']);
});

test('partitionPulledRecords: sin nada pendiente, se aplica todo', () => {
  const pulled = [{ id: 'a' }, { id: 'b' }];
  const { toApply, deferred } = partitionPulledRecords('people', pulled, []);
  assert.equal(toApply.length, 2);
  assert.equal(deferred.length, 0);
});

test('nextCursor: avanza al mayor serverUpdatedAt visto, incluyendo diferidos', () => {
  const records = [{ serverUpdatedAt: '2026-01-01T00:00:00Z' }, { serverUpdatedAt: '2026-01-03T00:00:00Z' }, { serverUpdatedAt: '2026-01-02T00:00:00Z' }];
  assert.equal(nextCursor(null, records), '2026-01-03T00:00:00Z');
});

test('nextCursor: lote vacío conserva el cursor anterior', () => {
  assert.equal(nextCursor('2026-01-01T00:00:00Z', []), '2026-01-01T00:00:00Z');
});

test('upsertById: inserta si es nuevo, reemplaza si ya existe', () => {
  let list = [{ id: 'x', v: 1 }];
  list = upsertById(list, { id: 'y', v: 1 });
  assert.equal(list.length, 2);
  list = upsertById(list, { id: 'x', v: 2 });
  assert.equal(list.length, 2);
  assert.equal(list.find((r) => r.id === 'x').v, 2);
});

test('visible: nunca incluye tombstones (deletedAt)', () => {
  const list = [{ id: 'a' }, { id: 'b', deletedAt: '2026-01-01T00:00:00Z' }];
  assert.deepEqual(visible(list).map((r) => r.id), ['a']);
});

test('isSyncable: los registros de demo nunca se consideran sincronizables', () => {
  assert.equal(isSyncable({ id: '1', source: 'demo' }), false);
  assert.equal(isSyncable({ id: '1', source: null }), true);
  assert.equal(isSyncable(null), false);
});

// ---------------------------------------------------------------------------
// Simulación de dos dispositivos + una tabla "remota" compartida (un array).
// push = upsertById sobre el array remoto; pull = leer el array remoto y
// aplicar con partitionPulledRecords/upsertById sobre el array "local" de
// cada dispositivo. Modela exactamente lo que hace syncService.js contra
// Supabase, sin IndexedDB ni red.
// ---------------------------------------------------------------------------

function makeDevice() {
  return { purchases: [], settlements: [], people: [], cursor: null, pendingKeys: new Set() };
}

function push(remote, entity, record, tsCounter) {
  const stamped = { ...record, serverUpdatedAt: `t${tsCounter.n++}` };
  remote[entity] = upsertById(remote[entity], stamped);
  return stamped;
}

function pull(remote, device, entity) {
  const all = remote[entity];
  const pulled = device.cursor ? all.filter((r) => r.serverUpdatedAt > device.cursor) : all;
  const { toApply, deferred } = partitionPulledRecords(entity, pulled, device.pendingKeys);
  toApply.forEach((r) => { device[entity] = upsertById(device[entity], r); });
  device.cursor = nextCursor(device.cursor, [...toApply, ...deferred]);
}

test('dos dispositivos convergen a los mismos movimientos y balances (sum=0)', () => {
  const ts = { n: 1 };
  const remote = { people: [], purchases: [], settlements: [] };
  const felipe = makeDevice();
  const israel = makeDevice();

  const people = [
    { id: 'felipe', name: 'Felipe', active: true },
    { id: 'israel', name: 'Israel', active: true },
    { id: 'carlos', name: 'Carlos', active: true },
  ];
  people.forEach((p) => { push(remote, 'people', p, ts); });
  pull(remote, felipe, 'people');
  pull(remote, israel, 'people');

  // Felipe registra "Coca-Cola" Bs 55, paga él, participan los 3.
  const purchase1 = {
    id: 'pu1', payerId: 'felipe', participantIds: ['felipe', 'israel', 'carlos'],
    amountCents: 5500, shares: { felipe: 1834, israel: 1833, carlos: 1833 },
  };
  push(remote, 'purchases', purchase1, ts);
  pull(remote, felipe, 'purchases');

  // Israel registra "Café" Bs 30, paga él, participan los 3, ANTES de haber
  // sincronizado la compra de Felipe (offline-first: cada quien registra y
  // sube cuando puede).
  const purchase2 = {
    id: 'pu2', payerId: 'israel', participantIds: ['felipe', 'israel', 'carlos'],
    amountCents: 3000, shares: { felipe: 1000, israel: 1000, carlos: 1000 },
  };
  push(remote, 'purchases', purchase2, ts);

  // Ahora ambos dispositivos sincronizan (pull) y deben terminar iguales.
  pull(remote, felipe, 'purchases');
  pull(remote, israel, 'purchases');

  assert.deepEqual(felipe.purchases.map((p) => p.id).sort(), israel.purchases.map((p) => p.id).sort());

  const balancesFelipe = computeBalances(people, visible(felipe.purchases), visible(felipe.settlements));
  const balancesIsrael = computeBalances(people, visible(israel.purchases), visible(israel.settlements));
  assert.deepEqual(balancesFelipe, balancesIsrael);

  const sum = Object.values(balancesFelipe).reduce((acc, b) => acc + b.balanceCents, 0);
  assert.equal(sum, 0);
});

test('idempotencia: reintentar el push del mismo registro no lo duplica', () => {
  const ts = { n: 1 };
  const remote = { purchases: [] };
  const record = { id: 'pu1', amountCents: 1000 };
  push(remote, 'purchases', record, ts);
  push(remote, 'purchases', record, ts); // reintento tras un fallo de red simulado
  push(remote, 'purchases', record, ts);
  assert.equal(remote.purchases.length, 1);
});

test('tombstone: un dispositivo que borró offline no ve "resucitar" el registro al reconectar', () => {
  const ts = { n: 1 };
  const remote = { purchases: [] };
  const felipe = makeDevice();
  const israel = makeDevice();

  push(remote, 'purchases', { id: 'pu1', amountCents: 2000 }, ts);
  pull(remote, felipe, 'purchases');
  pull(remote, israel, 'purchases');
  assert.equal(visible(israel.purchases).length, 1);

  // Israel borra offline (tombstone local) y luego sube el borrado.
  israel.purchases = upsertById(israel.purchases, { id: 'pu1', amountCents: 2000, deletedAt: 'x' });
  push(remote, 'purchases', israel.purchases.find((p) => p.id === 'pu1'), ts);

  // Felipe, que todavía tenía la versión vieja, vuelve a pullear.
  pull(remote, felipe, 'purchases');
  assert.equal(visible(felipe.purchases).length, 0, 'el tombstone debe propagarse, no "resucitar" la compra');

  // Un pull posterior (p. ej. el pull periódico) no la trae de vuelta.
  pull(remote, felipe, 'purchases');
  assert.equal(visible(felipe.purchases).length, 0);
});

test('conflicto: dos ediciones casi simultáneas del mismo registro terminan en un único estado consistente', () => {
  const ts = { n: 1 };
  const remote = { purchases: [] };
  push(remote, 'purchases', { id: 'pu1', concept: 'original', amountCents: 1000 }, ts);

  // Felipe e Israel editan "casi" al mismo tiempo; el que llega segundo al
  // servidor gana la fila entera (last-write-wins por orden de llegada).
  push(remote, 'purchases', { id: 'pu1', concept: 'editado por Felipe', amountCents: 1200 }, ts);
  push(remote, 'purchases', { id: 'pu1', concept: 'editado por Israel', amountCents: 1500 }, ts);

  assert.equal(remote.purchases.length, 1, 'nunca se duplica el registro en conflicto');
  assert.equal(remote.purchases[0].concept, 'editado por Israel');
  assert.equal(remote.purchases[0].amountCents, 1500);

  const felipe = makeDevice();
  const israel = makeDevice();
  pull(remote, felipe, 'purchases');
  pull(remote, israel, 'purchases');
  assert.deepEqual(felipe.purchases, israel.purchases);
});

test('pull con edición local pendiente: no se pisa la edición propia antes de subirla', () => {
  const ts = { n: 1 };
  const remote = { purchases: [] };
  push(remote, 'purchases', { id: 'pu1', concept: 'original', amountCents: 1000 }, ts);

  const israel = makeDevice();
  pull(remote, israel, 'purchases');

  // Otro dispositivo edita la compra en el servidor...
  push(remote, 'purchases', { id: 'pu1', concept: 'editado por Felipe', amountCents: 1200 }, ts);

  // ...mientras Israel, offline, también la editó y todavía no subió (tiene
  // una entrada pendiente en su outbox para ese registro).
  israel.purchases = upsertById(israel.purchases, { id: 'pu1', concept: 'editado por Israel', amountCents: 1500 });
  israel.pendingKeys = new Set([outboxKeyFor('purchases', 'pu1')]);

  pull(remote, israel, 'purchases');
  assert.equal(israel.purchases.find((p) => p.id === 'pu1').concept, 'editado por Israel', 'el pull no debe pisar una edición local todavía no subida');

  // Israel sube su edición: ahora sí gana (llegó después al servidor).
  push(remote, 'purchases', israel.purchases.find((p) => p.id === 'pu1'), ts);
  israel.pendingKeys = new Set();
  assert.equal(remote.purchases.find((p) => p.id === 'pu1').concept, 'editado por Israel');
});

test('SYNCED_ENTITIES cubre las cinco entidades financieras/relacionales, nada más', () => {
  assert.deepEqual([...SYNCED_ENTITIES].sort(), ['categories', 'people', 'products', 'purchases', 'settlements']);
});
