# Equilibra — grupo compartido (Supabase)

Este documento es el mínimo necesario para levantar el backend de sincronización
de Equilibra v1.3. Si no te interesa la sincronización, ignoralo: la app sigue
funcionando 100% local (IndexedDB) sin ninguna de estas credenciales.

## 1. Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com), creá una cuenta si hace falta
   y creá un proyecto nuevo (plan gratuito, cualquier región).
2. En **Authentication → Sign In / Providers → Anonymous**, activá
   "Allow anonymous sign-ins". Es un toggle del dashboard, no forma parte de
   las migraciones SQL. Es la única "cuenta" que usa Equilibra: no hay
   email/password ni pantallas de login — cada instalación de la app obtiene
   una identidad anónima estable la primera vez que abre, y Supabase la
   recuerda sola (queda guardada en el storage del navegador).

## 2. Aplicar el esquema

El archivo [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
contiene TODO lo necesario: tablas, índices, triggers, RLS y las funciones
RPC (`create_group`, `create_invite`, `preview_invite`, `redeem_invite`). Es
idempotente, podés correrlo más de una vez sin romper nada.

**Opción A — SQL Editor (más simple, no requiere CLI):**
Copiá el contenido completo del archivo y pegalo en
**SQL Editor → New query** del dashboard de Supabase, y ejecutalo.

**Opción B — Supabase CLI**, si lo tenés instalado y logueado:

```bash
supabase login
supabase link --project-ref <tu-project-ref>
supabase db push
```

Después, aplicá también
[`supabase/migrations/0002_realtime.sql`](supabase/migrations/0002_realtime.sql)
(mismo procedimiento, Opción A o B). Agrega las tablas sincronizadas a la
publicación `supabase_realtime`, así los cambios se ven casi instantáneos
entre dispositivos en vez de depender solo del pull periódico (cada 25s). Es
opcional: sin esto la app sigue sincronizando igual, solo que un poco más
lento — pero se recomienda aplicarla. También es idempotente.

## 3. Credenciales públicas

Necesitás dos valores del dashboard (**Project Settings → API**):

- **Project URL** (`https://xxxxx.supabase.co`)
- **anon / publishable key**

Ambos son seguros de exponer en el frontend — son las credenciales
*públicas* de un cliente, diseñadas para eso. La seguridad real la da RLS
(cada tabla solo es visible/editable para quien tiene membresía en ese
grupo — ver la sección de RLS en la migración). **El `service_role` key
nunca debe usarse acá**: tiene permisos de administrador y saltea RLS por
completo.

## 4. Configurar la app (sin build)

Equilibra sigue siendo HTML/CSS/JS puro sin paso de build, así que estas
credenciales públicas se cargan en runtime, no en tiempo de compilación.
Editá `apps/equilibra/src/remote/config.js`:

```js
export const SUPABASE_URL = 'https://xxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```

Si `SUPABASE_URL` queda vacío (valor por defecto en el repo), Equilibra
simplemente no intenta sincronizar: funciona exactamente como v1.2, 100%
local. Así el repo no necesita "secretos" para funcionar — cualquiera puede
clonarlo y usarlo local-only, y quien quiera grupo compartido pega sus
propias credenciales públicas en ese archivo antes de desplegar su propio
fork/Pages.

## 5. Deploy (GitHub Pages)

No cambia nada del flujo existente: se sigue sirviendo estático desde
`/apps/equilibra/`. Los links de invitación (`?invite=TOKEN`) funcionan bajo
el mismo base path, ver `src/ui/router.js`.

## 6. Cliente Supabase vendorizado

El repo no importa `@supabase/supabase-js` desde un CDN en runtime — se
vendoriza un bundle único y autocontenido en
`apps/equilibra/vendor/supabase-js.js` (generado una vez con esbuild a partir
del paquete oficial de npm, sin más dependencias). Motivo: evitar que la
app dependa en tiempo de ejecución de la disponibilidad de un CDN externo
para una funcionalidad que, para la mayoría de instalaciones, es opcional.
Si Supabase publica una versión nueva relevante, se regenera con:

```bash
cd apps/equilibra
npm install --no-save @supabase/supabase-js@2 esbuild
npx esbuild --bundle --format=esm --platform=browser \
  --outfile=vendor/supabase-js.js \
  scripts/supabase-entry.js
rm -rf node_modules package-lock.json
```

## 7. Probar que sincroniza de verdad

`apps/equilibra/e2e/shared-group.mjs` simula el escenario completo (dos
navegadores — iPhone y Android —, invitación, compras cruzadas,
transferencias, balances idénticos entre dispositivos con invariante
`sum(balance)=0`, offline/reconexión) contra un proyecto real. Con la app
servida en local y las credenciales ya configuradas:

```bash
cd apps/equilibra && python3 -m http.server 8080 &
node e2e/shared-group.mjs http://localhost:8080/index.html
```

El proyecto gratuito de Supabase limita los sign-ins anónimos a un ritmo muy
bajo (en la práctica, ~1 por minuto). Cada corrida del script gasta al menos
2 (uno por dispositivo simulado), así que si lo corrés varias veces seguidas
podés ver `429 over_request_rate_limit` en la consola del navegador — no es
un bug de la app, hay que esperar un minuto o dos entre corridas.

## 8. Decisiones de diseño (resumen técnico)

- **Tabla por entidad**, no un blob JSONB genérico de "registros de sync".
  Con 5 entidades y un esquema local ya estable, esto da RLS por fila simple
  y consultas de cursor de sync (`group_id, server_updated_at`) directas.
- **`server_updated_at`** lo pone siempre un trigger de Postgres, nunca el
  cliente. El cursor de sync se basa en esa columna — así el reloj de cada
  teléfono nunca decide el orden de los cambios.
- **Conflictos**: last-write-wins determinado por el servidor. Dos upserts
  concurrentes al mismo `id` se aplican en el orden en que Postgres los
  procesa; el último sobrescribe la fila entera. No hay merge de campos ni
  panel de resolución de conflictos — para un grupo de amigos chico, es
  suficiente y mantiene `sum(balance) = 0` siempre.
- **Eliminaciones = tombstones** (`deleted_at`). Nunca se hace `DELETE` real
  desde el cliente, así un dispositivo que todavía no sincronizó no puede
  "resucitar" un registro borrado por otro.
- **Invitaciones**: el token nunca se guarda en texto plano (se guarda su
  hash SHA-256), y el `group_id` nunca es, por sí solo, un mecanismo de
  acceso — todo pasa por las funciones `create_invite` / `redeem_invite`
  (`SECURITY DEFINER`), no por policies de INSERT directas sobre
  `memberships`.
- **Identidad**: auth anónima de Supabase (`signInAnonymously`). No hay
  email, password, ni perfiles — es una identidad técnica por instalación,
  invisible para el usuario. La persona elegida en "¿Quién sos?" es un dato
  aparte, guardado localmente.
