// Traducción entre el modelo local (camelCase, IndexedDB) y las tablas de
// Supabase (snake_case, Postgres). Es la única capa que conoce los nombres
// de columna remotos — SyncService y el resto de la app solo hablan en
// términos de los registros locales de siempre.

import { getSupabaseClient, ensureAnonymousSession } from './supabaseClient.js';

const TABLE_MAPPERS = {
  people: {
    toRemote: (r) => ({
      id: r.id,
      group_id: r.groupId,
      name: r.name,
      color: r.color ?? null,
      active: r.active,
      source: r.source ?? null,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      deleted_at: r.deletedAt ?? null,
    }),
    fromRemote: (row) => ({
      id: row.id,
      groupId: row.group_id,
      name: row.name,
      color: row.color,
      active: row.active,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      serverUpdatedAt: row.server_updated_at,
    }),
  },
  categories: {
    toRemote: (r) => ({
      id: r.id,
      group_id: r.groupId,
      name: r.name,
      archived: r.archived,
      source: r.source ?? null,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      deleted_at: r.deletedAt ?? null,
    }),
    fromRemote: (row) => ({
      id: row.id,
      groupId: row.group_id,
      name: row.name,
      archived: row.archived,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      serverUpdatedAt: row.server_updated_at,
    }),
  },
  products: {
    toRemote: (r) => ({
      id: r.id,
      group_id: r.groupId,
      name: r.name,
      category_id: r.categoryId ?? null,
      archived: r.archived,
      use_count: r.useCount ?? 0,
      source: r.source ?? null,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      deleted_at: r.deletedAt ?? null,
    }),
    fromRemote: (row) => ({
      id: row.id,
      groupId: row.group_id,
      name: row.name,
      categoryId: row.category_id,
      archived: row.archived,
      useCount: row.use_count,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      serverUpdatedAt: row.server_updated_at,
    }),
  },
  purchases: {
    toRemote: (r) => ({
      id: r.id,
      group_id: r.groupId,
      datetime: r.datetime,
      concept: r.concept,
      category_id: r.categoryId ?? null,
      product_id: r.productId ?? null,
      amount_cents: r.amountCents,
      currency: r.currency,
      payer_id: r.payerId,
      participant_ids: r.participantIds,
      split_mode: r.splitMode,
      weights: r.weights ?? null,
      shares: r.shares,
      note: r.note ?? '',
      source: r.source ?? null,
      created_by_person_id: r.createdByPersonId ?? null,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      deleted_at: r.deletedAt ?? null,
    }),
    fromRemote: (row) => ({
      id: row.id,
      groupId: row.group_id,
      datetime: row.datetime,
      concept: row.concept,
      categoryId: row.category_id,
      productId: row.product_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      payerId: row.payer_id,
      participantIds: row.participant_ids,
      splitMode: row.split_mode,
      weights: row.weights,
      shares: row.shares,
      note: row.note,
      source: row.source,
      createdByPersonId: row.created_by_person_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      serverUpdatedAt: row.server_updated_at,
    }),
  },
  settlements: {
    toRemote: (r) => ({
      id: r.id,
      group_id: r.groupId,
      datetime: r.datetime,
      from_person_id: r.fromPersonId,
      to_person_id: r.toPersonId,
      amount_cents: r.amountCents,
      currency: r.currency,
      purchase_id: r.purchaseId ?? null,
      note: r.note ?? '',
      source: r.source ?? null,
      created_by_person_id: r.createdByPersonId ?? null,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      deleted_at: r.deletedAt ?? null,
    }),
    fromRemote: (row) => ({
      id: row.id,
      groupId: row.group_id,
      datetime: row.datetime,
      fromPersonId: row.from_person_id,
      toPersonId: row.to_person_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      purchaseId: row.purchase_id,
      note: row.note,
      source: row.source,
      createdByPersonId: row.created_by_person_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      serverUpdatedAt: row.server_updated_at,
    }),
  },
};

export function mapperFor(entity) {
  const mapper = TABLE_MAPPERS[entity];
  if (!mapper) throw new Error(`Entidad sin mapeo remoto: ${entity}`);
  return mapper;
}

async function requireClient() {
  const client = await getSupabaseClient();
  if (!client) throw new Error('sync no configurado');
  await ensureAnonymousSession();
  return client;
}

/** Sube (upsert) un único registro local a su tabla remota. */
export async function pushRecord(entity, localRecord) {
  const client = await requireClient();
  const { toRemote } = mapperFor(entity);
  const { error } = await client.from(entity).upsert(toRemote(localRecord), { onConflict: 'id' });
  if (error) throw error;
}

/**
 * Trae todo lo nuevo de una entidad para un grupo desde `cursor` (exclusive)
 * en adelante, ordenado por server_updated_at. `cursor` null trae todo
 * (primera sincronización / snapshot inicial tras unirse a un grupo).
 */
export async function pullEntity(entity, groupId, cursor) {
  const client = await requireClient();
  const { fromRemote } = mapperFor(entity);
  let query = client.from(entity).select('*').eq('group_id', groupId).order('server_updated_at', { ascending: true });
  if (cursor) query = query.gt('server_updated_at', cursor);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(fromRemote);
}

export async function rpcCreateGroup(name) {
  const client = await requireClient();
  const { data, error } = await client.rpc('create_group', { p_name: name });
  if (error) throw error;
  return data;
}

export async function rpcCreateInvite(groupId) {
  const client = await requireClient();
  const { data, error } = await client.rpc('create_invite', { p_group_id: groupId });
  if (error) throw error;
  return data;
}

export async function rpcPreviewInvite(token) {
  const client = await requireClient();
  const { data, error } = await client.rpc('preview_invite', { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { groupId: row.group_id, groupName: row.group_name };
}

export async function rpcRedeemInvite(token) {
  const client = await requireClient();
  const { data, error } = await client.rpc('redeem_invite', { p_token: token });
  if (error) throw error;
  return data;
}

export async function fetchGroup(groupId) {
  const client = await requireClient();
  const { data, error } = await client.from('groups').select('id, name').eq('id', groupId).single();
  if (error) throw error;
  return { id: data.id, name: data.name };
}

export async function renameGroup(groupId, name) {
  const client = await requireClient();
  const { error } = await client.from('groups').update({ name }).eq('id', groupId);
  if (error) throw error;
}

/** Señal de "algo cambió" vía Realtime — solo dispara un pull, nunca es la fuente de verdad. */
export async function subscribeToGroupChanges(groupId, onChange) {
  const client = await getSupabaseClient();
  if (!client) return () => {};
  const channel = client
    .channel(`group-${groupId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases', filter: `group_id=eq.${groupId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `group_id=eq.${groupId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'people', filter: `group_id=eq.${groupId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `group_id=eq.${groupId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `group_id=eq.${groupId}` }, onChange)
    .subscribe();
  return () => client.removeChannel(channel);
}
