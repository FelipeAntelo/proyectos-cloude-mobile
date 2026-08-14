-- Habilita Realtime (postgres_changes) para las tablas que sincroniza el
-- cliente. Sin esto, `subscribeToGroupChanges()` en remoteRepository.js se
-- suscribe a un canal que nunca emite nada: la app igual converge porque el
-- pull periódico (cada 25s, ver PERIODIC_PULL_MS en syncService.js) hace de
-- red de seguridad, pero la sincronización deja de sentirse "instantánea"
-- entre dispositivos, que es el comportamiento esperado (ver
-- SUPABASE_SETUP.md). Agregar una tabla a una publicación que ya la
-- contiene no falla (Postgres devuelve error solo con ADD TABLE repetido),
-- así que se hace condicional para que el archivo siga siendo idempotente
-- como el resto de las migraciones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'people'
  ) then
    alter publication supabase_realtime add table public.people;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table public.categories;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'purchases'
  ) then
    alter publication supabase_realtime add table public.purchases;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settlements'
  ) then
    alter publication supabase_realtime add table public.settlements;
  end if;
end;
$$;
