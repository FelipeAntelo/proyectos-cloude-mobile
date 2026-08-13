-- Equilibra v1.3 — esquema remoto de "grupo compartido".
--
-- Decisión de diseño (ver SUPABASE_SETUP.md para el detalle): se usa una tabla
-- por entidad, con las mismas columnas que ya existen en IndexedDB (más
-- group_id / server_updated_at / deleted_at), en lugar de una tabla genérica
-- JSONB de "registros de sync". Con solo 5 entidades y un esquema local que ya
-- está estable, una tabla por entidad da RLS simple y directo por fila y
-- consultas de sync (`group_id, server_updated_at`) index-friendly, sin la
-- complejidad extra de versionar un blob JSONB genérico.
--
-- Aplicar este archivo completo en el SQL Editor de Supabase (o vía
-- `supabase db push` si tenés el CLI enlazado al proyecto). Es idempotente:
-- puede correrse más de una vez sin romper nada (todo con IF NOT EXISTS /
-- CREATE OR REPLACE).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

-- El token nunca se guarda en texto plano: solo su hash SHA-256. El valor
-- crudo se genera en create_invite(), se devuelve una única vez al que invita,
-- y viaja en la URL de invitación. Sin panel de invitaciones: la fila queda
-- como historial, pero toda la interacción pasa por las funciones de abajo.
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.people (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  color text,
  active boolean not null default true,
  source text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.categories (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  source text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.products (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  category_id uuid references public.categories(id),
  archived boolean not null default false,
  use_count integer not null default 0,
  source text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.purchases (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  datetime timestamptz not null,
  concept text not null,
  category_id uuid references public.categories(id),
  product_id uuid references public.products(id),
  amount_cents bigint not null,
  currency text not null default 'BOB',
  payer_id uuid not null references public.people(id),
  participant_ids jsonb not null,
  split_mode text not null,
  weights jsonb,
  shares jsonb not null,
  note text not null default '',
  source text,
  -- `created_by` lo pone Postgres solo (default auth.uid()) en el INSERT; el
  -- cliente nunca lo manda, así no se puede falsear. En un UPDATE posterior
  -- el default no vuelve a aplicar, así que queda fijo en quien CREÓ el
  -- registro, no en quien lo editó por última vez.
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_person_id uuid references public.people(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.settlements (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  datetime timestamptz not null,
  from_person_id uuid not null references public.people(id),
  to_person_id uuid not null references public.people(id),
  amount_cents bigint not null,
  currency text not null default 'BOB',
  purchase_id uuid references public.purchases(id),
  note text not null default '',
  source text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_person_id uuid references public.people(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Índices para el cursor de sync incremental (pull: "todo lo de mi grupo con
-- server_updated_at > mi cursor local").
-- ---------------------------------------------------------------------------

create index if not exists idx_people_sync on public.people (group_id, server_updated_at);
create index if not exists idx_categories_sync on public.categories (group_id, server_updated_at);
create index if not exists idx_products_sync on public.products (group_id, server_updated_at);
create index if not exists idx_purchases_sync on public.purchases (group_id, server_updated_at);
create index if not exists idx_settlements_sync on public.settlements (group_id, server_updated_at);
create index if not exists idx_memberships_user on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- server_updated_at: lo pone SIEMPRE el servidor, nunca el cliente. Es la
-- única fuente de verdad para ordenar cambios y para el cursor de sync — así
-- el reloj de cada teléfono (que puede estar mal puesto) nunca decide qué
-- versión de un registro "gana". La resolución de conflictos es, en los
-- hechos, last-write-wins por orden de llegada al servidor: dos upserts
-- concurrentes al mismo id se aplican en el orden en que Postgres los procesa
-- y el último sobrescribe la fila entera. Documentado también en
-- SUPABASE_SETUP.md.
-- ---------------------------------------------------------------------------

create or replace function public.set_server_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['people', 'categories', 'products', 'purchases', 'settlements'] loop
    execute format(
      'drop trigger if exists trg_%1$s_server_updated_at on public.%1$s;
       create trigger trg_%1$s_server_updated_at
       before insert or update on public.%1$s
       for each row execute function public.set_server_updated_at();',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.people enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.purchases enable row level security;
alter table public.settlements enable row level security;

-- Helper: ¿el usuario autenticado (anónimo o no) pertenece a este grupo?
-- SECURITY DEFINER para poder leer memberships sin recursión de RLS.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = p_group_id and m.user_id = auth.uid()
  );
$$;

-- groups: solo lectura/edición (nombre) para miembros. La creación pasa
-- siempre por create_group() (ver abajo) — no hay policy de INSERT directa.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select
  using (public.is_group_member(id));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update
  using (public.is_group_member(id))
  with check (public.is_group_member(id));

-- memberships: cada quien ve solo sus propias filas. Nunca se insertan a
-- mano desde el cliente: siempre vía create_group() o redeem_invite().
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select
  using (user_id = auth.uid());

-- invitations: sin policies de cliente. Todo el acceso (crear, previsualizar,
-- canjear) pasa por las funciones SECURITY DEFINER de abajo, que validan el
-- token en vez de confiar en que el group_id sea difícil de adivinar.

-- Entidades sincronizables: cualquier miembro del grupo puede leer y
-- escribir (crear/editar/soft-delete vía UPDATE deleted_at). No hay roles
-- distintos dentro del grupo — ver CLAUDE.md de la app, sección "sin roles".
do $$
declare
  t text;
begin
  foreach t in array array['people', 'categories', 'products', 'purchases', 'settlements'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format(
      'create policy %1$s_select on public.%1$s for select using (public.is_group_member(group_id));',
      t
    );
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert with check (public.is_group_member(group_id));',
      t
    );
    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER): únicas puertas de entrada para crear grupos,
-- generar/canjear invitaciones. Todas validan auth.uid() y membresía a mano
-- porque, al correr con privilegios elevados, se saltean RLS.
-- ---------------------------------------------------------------------------

create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'auth requerida';
  end if;
  if v_name = '' then
    raise exception 'el grupo necesita un nombre';
  end if;

  insert into public.groups (name, created_by) values (v_name, auth.uid())
    returning id into v_group_id;
  insert into public.memberships (group_id, user_id) values (v_group_id, auth.uid());

  return v_group_id;
end;
$$;

-- Genera un token nuevo y revoca cualquier invitación anterior aún activa de
-- ese grupo (no hace falta un panel: "Generar nuevo enlace" es, en los
-- hechos, volver a llamar a esta función). Devuelve el token EN CRUDO — es la
-- única vez que existe en texto plano; la tabla solo guarda su hash.
create or replace function public.create_invite(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'no sos parte de este grupo';
  end if;

  update public.invitations set revoked_at = now()
    where group_id = p_group_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.invitations (group_id, token_hash, created_by)
    values (p_group_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid());

  return v_token;
end;
$$;

-- Previsualiza una invitación (nombre del grupo) sin crear membresía todavía
-- — así la pantalla puede mostrar "Te invitaron a: Oficina" antes de que el
-- usuario confirme "Entrar al grupo".
create or replace function public.preview_invite(p_token text)
returns table (group_id uuid, group_name text)
language sql
security definer
set search_path = public, extensions
as $$
  select g.id, g.name
  from public.invitations i
  join public.groups g on g.id = i.group_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and i.revoked_at is null
    and (i.expires_at is null or i.expires_at > now())
  limit 1;
$$;

-- Canjea la invitación: crea la membresía del usuario autenticado (anónimo)
-- si todavía no existe, e informa el group_id para que el cliente arranque
-- el pull inicial. Idempotente: reintentarla no duplica la membresía.
create or replace function public.redeem_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth requerida';
  end if;

  select i.group_id into v_group_id
    from public.invitations i
    where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and i.revoked_at is null
      and (i.expires_at is null or i.expires_at > now())
    limit 1;

  if v_group_id is null then
    raise exception 'invitación inválida o vencida';
  end if;

  insert into public.memberships (group_id, user_id)
    values (v_group_id, auth.uid())
    on conflict (group_id, user_id) do nothing;

  return v_group_id;
end;
$$;

grant execute on function public.create_group(text) to authenticated, anon;
grant execute on function public.create_invite(uuid) to authenticated, anon;
grant execute on function public.preview_invite(text) to authenticated, anon;
grant execute on function public.redeem_invite(text) to authenticated, anon;
