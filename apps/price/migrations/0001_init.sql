-- PRICE — esquema inicial (Cloudflare D1 / SQLite)
-- Convenciones: dinero en centavos (INTEGER), tiempos en epoch ms (INTEGER),
-- JSON en TEXT.

CREATE TABLE products (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  spec          TEXT NOT NULL,              -- JSON ProductSpec (variante exacta)
  msrp_cents    INTEGER,
  msrp_status   TEXT NOT NULL DEFAULT 'provisional', -- provisional | verified
  target_cents  INTEGER,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE sources (
  id                    TEXT PRIMARY KEY,   -- bestbuy | ebay | serpapi | manual
  name                  TEXT NOT NULL,
  kind                  TEXT NOT NULL,      -- store_api | marketplace_api | discovery | manual
  enabled               INTEGER NOT NULL DEFAULT 1,
  interval_s            INTEGER NOT NULL,   -- intervalo deseado
  min_interval_s        INTEGER NOT NULL,   -- piso permitido por la fuente
  daily_budget          INTEGER NOT NULL,   -- tope de llamadas/día (protección de cuota/coste)
  calls_today           INTEGER NOT NULL DEFAULT 0,
  budget_day            TEXT,               -- YYYY-MM-DD (UTC) del contador
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  backoff_until         INTEGER,
  next_check_at         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at       INTEGER,
  last_success_at       INTEGER,
  last_error            TEXT,
  last_error_at         INTEGER
);

CREATE TABLE offers (
  id                 TEXT PRIMARY KEY,      -- sha256(source|external_id)
  product_id         TEXT NOT NULL REFERENCES products(id),
  source_id          TEXT NOT NULL,
  store              TEXT NOT NULL,         -- tienda que vende (p.ej. "Best Buy", vendedor eBay)
  external_id        TEXT NOT NULL,
  title              TEXT NOT NULL,
  url                TEXT NOT NULL,
  verification       TEXT NOT NULL,         -- verified | discovered | manual | simulated
  match_status       TEXT NOT NULL,         -- match | partial | mismatch | user_asserted
  match_checks       TEXT NOT NULL,         -- JSON
  price_cents        INTEGER,               -- último precio ACEPTADO
  shipping_cents     INTEGER,
  in_stock           INTEGER,               -- 1 | 0 | NULL (desconocido)
  pending_price_cents INTEGER,              -- precio anómalo esperando confirmación
  pending_count      INTEGER NOT NULL DEFAULT 0,
  first_seen_at      INTEGER NOT NULL,
  last_seen_at       INTEGER NOT NULL,
  last_changed_at    INTEGER NOT NULL,
  active             INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX offers_product ON offers(product_id, active);

CREATE TABLE price_points (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id     TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  price_cents  INTEGER,
  in_stock     INTEGER,
  verification TEXT NOT NULL,
  observed_at  INTEGER NOT NULL
);
CREATE INDEX price_points_product ON price_points(product_id, observed_at);
CREATE INDEX price_points_offer ON price_points(offer_id, observed_at);

CREATE TABLE financing (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      TEXT NOT NULL,
  offer_id        TEXT,
  store           TEXT NOT NULL,
  provider        TEXT,                    -- entidad financiera
  apr_bps         INTEGER,                 -- APR en puntos básicos (0 = 0%)
  months          INTEGER,
  monthly_cents   INTEGER,
  down_cents      INTEGER,
  total_cents     INTEGER,
  cash_price_cents INTEGER,
  eligibility     TEXT,
  conditions      TEXT,
  url             TEXT,
  origin          TEXT NOT NULL,           -- api | manual
  origin_note     TEXT,                    -- procedencia declarada
  observed_at     INTEGER NOT NULL,
  expires_at      INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX financing_product ON financing(product_id, observed_at);

CREATE TABLE checks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     TEXT NOT NULL,
  product_id    TEXT,
  started_at    INTEGER NOT NULL,
  duration_ms   INTEGER,
  ok            INTEGER NOT NULL,
  http_status   INTEGER,
  error         TEXT,
  offers_found  INTEGER NOT NULL DEFAULT 0,
  calls         INTEGER NOT NULL DEFAULT 0,
  trigger       TEXT NOT NULL            -- cron | manual
);
CREATE INDEX checks_source ON checks(source_id, started_at);

CREATE TABLE alerts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   TEXT NOT NULL,
  offer_id     TEXT,
  type         TEXT NOT NULL,
  dedupe_key   TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  url          TEXT,
  price_cents  INTEGER,
  prev_cents   INTEGER,
  verification TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  pushed_at    INTEGER,
  push_result  TEXT
);
CREATE INDEX alerts_created ON alerts(created_at);

CREATE TABLE push_subscriptions (
  id          TEXT PRIMARY KEY,            -- sha256(endpoint)
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  last_ok_at  INTEGER,
  failures    INTEGER NOT NULL DEFAULT 0,
  revoked     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  label        TEXT,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Material interno del servidor (claves VAPID, token OAuth cacheado).
-- Nunca se expone por la API, salvo la clave pública VAPID.
CREATE TABLE kv_internal (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at INTEGER
);

-- ---------------------------------------------------------------- semillas
INSERT INTO products (id, name, spec, msrp_cents, msrp_status, target_cents, active, created_at, updated_at)
VALUES (
  'pixel-11-pro-xl-256-obsidian-unlocked',
  'Google Pixel 11 Pro XL · 256 GB · Obsidian · Unlocked',
  '{"brand":"google","modelPattern":"pixel\\s*11\\s*pro\\s*xl","modelLabel":"Pixel 11 Pro XL","storageGb":256,"color":"obsidian","colorAliases":["obsidian"],"condition":"new","unlocked":true,"searchQuery":"Google Pixel 11 Pro XL 256GB Obsidian Unlocked","priceFloorCents":30000,"priceCeilCents":200000}',
  129900, 'provisional', 79900, 1,
  CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
);

-- Intervalos iniciales: 5 min donde la fuente lo permite. Presupuestos
-- diarios por debajo de las cuotas gratuitas documentadas.
INSERT INTO sources (id, name, kind, enabled, interval_s, min_interval_s, daily_budget) VALUES
  ('bestbuy', 'Best Buy',          'store_api',       1, 300,   300,  2000),
  ('ebay',    'eBay',              'marketplace_api', 1, 300,   300,  1500),
  ('serpapi', 'Google Shopping (SerpApi)', 'discovery', 0, 14400, 10800, 8),
  ('manual',  'Carga manual',      'manual',          1, 0,     0,    0);

INSERT INTO settings (key, value) VALUES
  ('notifications', '{"priceDrop":true,"targetReached":true,"newOffer":true,"newBest":true,"backInStock":true,"financing":true,"discovered":true,"minDropCents":500,"minDropPct":1,"cooldownMinutes":360,"quietHours":null}'),
  ('tax', '{"zip":"20110","place":"Manassas, VA","ratePct":6.0,"status":"unverified","note":"4.3% estatal + 0.7% regional NoVA + 1.0% local — pendiente de confirmar con Virginia Tax"}'),
  ('staleness', '{"staleAfterIntervals":3}');
