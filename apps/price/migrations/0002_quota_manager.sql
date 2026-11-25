-- PRICE — gestor de cuotas persistente, estado de proveedores y nuevas preferencias.

-- Configuración de cuota por proveedor (JSON QuotaConfig, ver src/worker/quota.ts).
ALTER TABLE sources ADD COLUMN quota TEXT NOT NULL DEFAULT '{"windows":[],"reservePct":20}';
-- Último cambio observado en alguna oferta de la fuente (para frecuencia adaptativa).
ALTER TABLE sources ADD COLUMN last_change_at INTEGER;
-- Suspensión explícita (p. ej. el proveedor dejó de ser gratuito). Requiere acción del usuario.
ALTER TABLE sources ADD COLUMN suspended_reason TEXT;

-- El presupuesto diario simple se sustituye por ventanas de cuota.
ALTER TABLE sources DROP COLUMN daily_budget;
ALTER TABLE sources DROP COLUMN calls_today;
ALTER TABLE sources DROP COLUMN budget_day;

-- Contadores persistentes de llamadas REALES por ventana (incluye reintentos,
-- paginación y llamadas auxiliares como tokens OAuth).
CREATE TABLE quota_usage (
  source_id    TEXT NOT NULL,
  window_key   TEXT NOT NULL,           -- p.ej. day:2026-11-25@America/Los_Angeles | cycle:1796342400000 | hour:2026-11-25T06
  used         INTEGER NOT NULL DEFAULT 0,
  manual_used  INTEGER NOT NULL DEFAULT 0,
  window_end   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (source_id, window_key)
);

-- Límites documentados. "verified": confirmado en documentación oficial del proveedor.
UPDATE sources SET quota = '{"windows":[{"kind":"day","limit":5000,"tz":"UTC"}],"reservePct":20,"verified":false,"note":"Tope autoimpuesto. Terceros reportan 50.000/día y 5/s; pendiente de confirmar en el portal de Best Buy al obtener la key."}'
  WHERE id = 'bestbuy';
UPDATE sources SET quota = '{"windows":[{"kind":"day","limit":5000,"tz":"America/Los_Angeles"}],"reservePct":20,"verified":true,"note":"Browse API: 5.000 llamadas/día por aplicación (developer.ebay.com/develop/api/buy/api_call_limits). Los tokens OAuth (1.000/día) se cuentan en la misma ventana."}'
  WHERE id = 'ebay';
UPDATE sources SET quota = '{"windows":[{"kind":"cycle","limit":250},{"kind":"hour","limit":50,"tz":"UTC"}],"reservePct":20,"verified":true,"syncFromProvider":true,"note":"Plan Free: 250 búsquedas/mes, 50/h (serpapi.com/pricing). El ciclo y el consumo real se sincronizan con la Account API (gratuita)."}',
  interval_s = 14400, min_interval_s = 3600
  WHERE id = 'serpapi';

-- Nuevas preferencias de notificación (se fusionan con las existentes al leer).
UPDATE settings SET value = json_patch(value, '{"allTimeLow":true,"newStore":true,"opportunities":true,"priceIncrease":false,"system":true}')
  WHERE key = 'notifications';

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('events', '[]'),
  ('retention', '{"checksDays":30,"alertsDays":365,"inactiveOffersDays":180}');

CREATE INDEX IF NOT EXISTS alerts_type ON alerts(type, created_at);
