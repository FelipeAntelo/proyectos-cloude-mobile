import { ADAPTERS } from "./adapters/registry";
import type { SourceAdapter } from "./adapters/types";
import {
  applyCooldown,
  evaluateOffer,
  gatePrice,
  prioritize,
  type AlertCandidate,
  type RecentAlert,
} from "./domain/alerts";
import { matchObservation } from "./domain/matcher";
import type { Observation, Product, SourceRow } from "./domain/types";
import type { Env } from "./env";
import { schedulerBackoffMs, SourceError } from "./lib/http";
import { sha256Hex, utcDay } from "./lib/util";
import { createPushSender, MAX_PUSHES_PER_RUN } from "./notifier";
import { deliveredCents, getOffers, getProducts, getSettings, getSources, type AppSettings, type OfferRow } from "./repo";

/** Máximo de ofertas persistidas por fuente/producto y ejecución (control de escrituras D1). */
export const MAX_OFFERS_PER_RUN = 15;
/** Tolerancia para que el cron de 5 min no "salte" una ventana por milisegundos. */
const DUE_TOLERANCE_MS = 30_000;
/** Si una oferta no cambia, se refresca `last_seen_at` como mucho cada hora. */
const SEEN_REFRESH_MS = 3600_000;

export interface RunOptions {
  now?: number;
  trigger: "cron" | "manual";
  force?: boolean;
  adapters?: Record<string, SourceAdapter>;
}

export interface SourceRunSummary {
  source: string;
  status: "ok" | "error" | "skipped";
  reason?: string;
  offers?: number;
  alerts?: number;
}

export interface RunSummary {
  startedAt: number;
  sources: SourceRunSummary[];
  alertsCreated: number;
  pushes: { sent: number; failed: number };
}

/** Intervalo efectivo: respeta el piso de la fuente y el presupuesto diario de llamadas. */
export function effectiveIntervalS(s: SourceRow, callsPerRun: number): number {
  const runsAllowed = Math.max(1, Math.floor(s.daily_budget / Math.max(1, callsPerRun)));
  return Math.max(s.min_interval_s, s.interval_s, Math.ceil(86400 / runsAllowed));
}

function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export async function runMonitor(env: Env, opts: RunOptions): Promise<RunSummary> {
  const now = opts.now ?? Date.now();
  const db = env.DB;
  const adapters = opts.adapters ?? ADAPTERS;
  const [sources, products, settings] = await Promise.all([getSources(db), getProducts(db, true), getSettings(db)]);
  const summary: RunSummary = { startedAt: now, sources: [], alertsCreated: 0, pushes: { sent: 0, failed: 0 } };
  const newAlerts: AlertCandidate[] = [];

  for (const src of sources) {
    const adapter = adapters[src.id];
    if (!adapter || !src.enabled) continue;
    if (!adapter.isConfigured(env)) {
      summary.sources.push({ source: src.id, status: "skipped", reason: "sin credenciales" });
      continue;
    }
    const today = utcDay(now);
    const callsToday = src.budget_day === today ? src.calls_today : 0;
    const needed = adapter.callsPerRun * products.length;

    if (src.backoff_until && src.backoff_until > now) {
      summary.sources.push({ source: src.id, status: "skipped", reason: "backoff" });
      continue;
    }
    if (!opts.force && now < src.next_check_at - DUE_TOLERANCE_MS) {
      summary.sources.push({ source: src.id, status: "skipped", reason: "no toca" });
      continue;
    }
    if (callsToday + needed > src.daily_budget) {
      await db
        .prepare("UPDATE sources SET next_check_at = ?, last_error = ?, last_error_at = ?, calls_today = ?, budget_day = ? WHERE id = ?")
        .bind(nextUtcMidnight(now), "Presupuesto diario de llamadas agotado", now, callsToday, today, src.id)
        .run();
      summary.sources.push({ source: src.id, status: "skipped", reason: "presupuesto agotado" });
      continue;
    }

    let calls = 0;
    const ctx = { env, db, now, countCall: () => void calls++ };
    let failure: SourceError | null = null;
    let offersSeen = 0;
    let alertsHere = 0;

    for (const product of products) {
      const started = Date.now();
      try {
        const res = await adapter.fetchOffers(product, ctx);
        const r = await persistObservations(env, product, src.id, res.observations, settings, now);
        offersSeen += r.persisted;
        alertsHere += r.alerts.length;
        newAlerts.push(...r.alerts);
        await db
          .prepare("INSERT INTO checks (source_id, product_id, started_at, duration_ms, ok, http_status, offers_found, calls, trigger) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)")
          .bind(src.id, product.id, now, Date.now() - started, res.httpStatus ?? null, r.persisted, res.calls, opts.trigger)
          .run();
      } catch (e) {
        failure = e instanceof SourceError ? e : new SourceError((e as Error).message);
        await db
          .prepare("INSERT INTO checks (source_id, product_id, started_at, duration_ms, ok, http_status, error, calls, trigger) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)")
          .bind(src.id, product.id, now, Date.now() - started, failure.status, failure.message.slice(0, 500), calls, opts.trigger)
          .run();
        break;
      }
    }

    const interval = effectiveIntervalS(src, adapter.callsPerRun);
    if (!failure) {
      await db
        .prepare(
          `UPDATE sources SET consecutive_failures = 0, backoff_until = NULL, last_attempt_at = ?, last_success_at = ?,
             next_check_at = ?, calls_today = ?, budget_day = ? WHERE id = ?`,
        )
        .bind(now, now, now + interval * 1000, callsToday + calls, today, src.id)
        .run();
      summary.sources.push({ source: src.id, status: "ok", offers: offersSeen, alerts: alertsHere });
    } else {
      const failures = src.consecutive_failures + 1;
      const wait = failure.fatal
        ? 6 * 3600_000
        : Math.max(schedulerBackoffMs(failures), failure.retryAfterMs ?? 0);
      await db
        .prepare(
          `UPDATE sources SET consecutive_failures = ?, backoff_until = ?, last_attempt_at = ?, last_error = ?,
             last_error_at = ?, next_check_at = ?, calls_today = ?, budget_day = ? WHERE id = ?`,
        )
        .bind(failures, now + wait, now, failure.message.slice(0, 500), now, now + wait, callsToday + calls, today, src.id)
        .run();
      summary.sources.push({ source: src.id, status: "error", reason: failure.message });
    }
  }

  summary.alertsCreated = newAlerts.length;
  if (newAlerts.length) summary.pushes = await deliverAlerts(env, newAlerts, now);
  return summary;
}

// ------------------------------------------------------------------ persistencia

export async function persistObservations(
  env: Env,
  product: Product,
  sourceId: string,
  observations: Observation[],
  settings: AppSettings,
  now: number,
): Promise<{ persisted: number; alerts: AlertCandidate[] }> {
  const db = env.DB;
  const all = await getOffers(db, product.id, false);
  const byId = new Map(all.map((o) => [o.id, o]));
  const bootstrap = !all.some((o) => o.source_id === sourceId);

  // Mejor precio verificado (match) antes de esta actualización, por oferta.
  const matchable = all.filter((o) => o.active && (o.match_status === "match" || o.match_status === "user_asserted"));

  // 1) Verificación de variante y descarte de lo que no es el producto.
  const candidates = [] as Array<{ obs: Observation; id: string; status: ReturnType<typeof matchObservation> }>;
  for (const obs of observations) {
    const status = matchObservation(product.spec, obs);
    if (status.status === "mismatch") continue;
    if (obs.trustIssue) {
      status.checks.notes.push(obs.trustIssue);
      if (status.status === "match") status.status = "partial";
    }
    candidates.push({ obs, id: await sha256Hex(`${obs.sourceId}|${obs.externalId}`), status });
  }
  candidates.sort((a, b) => (a.obs.priceCents ?? Infinity) - (b.obs.priceCents ?? Infinity));
  const kept = candidates.slice(0, MAX_OFFERS_PER_RUN);

  const recent = await recentAlerts(db, product.id, now);
  const stmts: D1PreparedStatement[] = [];
  const alerts: AlertCandidate[] = [];
  const seen = new Set<string>();

  for (const { obs, id, status } of kept) {
    seen.add(id);
    const prev = byId.get(id) ?? null;
    const gate = gatePrice(product, {
      prevPriceCents: prev?.price_cents ?? null,
      pendingPriceCents: prev?.pending_price_cents ?? null,
      pendingCount: prev?.pending_count ?? 0,
      newPriceCents: obs.priceCents,
    });
    if (gate.kind === "reject") continue;
    const accepted = gate.kind === "accept";
    const price = accepted ? obs.priceCents : (prev?.price_cents ?? null);
    const inStock = obs.inStock === null ? null : obs.inStock ? 1 : 0;
    const changed =
      !prev || prev.price_cents !== price || prev.in_stock !== inStock || prev.shipping_cents !== obs.shippingCents || !prev.active;
    const pendingPrice = gate.kind === "pending" ? gate.pendingPriceCents : null;
    const pendingCount = gate.kind === "pending" ? gate.pendingCount : 0;

    if (!prev || changed || prev.pending_price_cents !== pendingPrice || now - prev.last_seen_at > SEEN_REFRESH_MS || prev.match_status !== status.status) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO offers (id, product_id, source_id, store, external_id, title, url, verification, match_status, match_checks,
               price_cents, shipping_cents, in_stock, pending_price_cents, pending_count, first_seen_at, last_seen_at, last_changed_at, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET store = excluded.store, title = excluded.title, url = excluded.url,
               verification = excluded.verification, match_status = excluded.match_status, match_checks = excluded.match_checks,
               price_cents = excluded.price_cents, shipping_cents = excluded.shipping_cents, in_stock = excluded.in_stock,
               pending_price_cents = excluded.pending_price_cents, pending_count = excluded.pending_count,
               last_seen_at = excluded.last_seen_at,
               last_changed_at = CASE WHEN ? THEN excluded.last_changed_at ELSE offers.last_changed_at END,
               active = 1`,
          )
          .bind(
            id, product.id, sourceId, obs.store, obs.externalId, obs.title.slice(0, 300), obs.url, obs.verification,
            status.status, JSON.stringify(status.checks), price, obs.shippingCents, inStock, pendingPrice, pendingCount,
            now, now, now, changed ? 1 : 0,
          ),
      );
    }
    if (accepted && changed) {
      stmts.push(
        db
          .prepare("INSERT INTO price_points (offer_id, product_id, price_cents, in_stock, verification, observed_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(id, product.id, price == null ? null : price + (obs.shippingCents ?? 0), inStock, obs.verification, now),
      );
    }
    if (!accepted) continue;

    const nextDelivered = price == null ? null : price + (obs.shippingCents ?? 0);
    const prevDelivered = prev && prev.active ? deliveredCents(prev) : null;
    const bestOther = matchable
      .filter((o) => o.id !== id)
      .map(deliveredCents)
      .filter((x): x is number => x != null)
      .reduce<number | null>((m, x) => (m == null || x < m ? x : m), null);
    alerts.push(
      ...evaluateOffer({
        product,
        offer: { id, store: obs.store, url: obs.url, verification: obs.verification, matchStatus: status.status },
        isNew: !prev,
        prev: prev ? { priceCents: prevDelivered, inStock: prev.active ? (prev.in_stock == null ? null : prev.in_stock === 1) : false } : null,
        next: { priceCents: nextDelivered, inStock: obs.inStock },
        bestOtherCents: bestOther,
        bootstrap,
        prefs: settings.notifications,
        now,
      }),
    );
  }

  // Ofertas de esta fuente que ya no aparecen → inactivas (solo si la consulta fue exitosa).
  for (const o of all) {
    if (o.source_id === sourceId && o.active && !seen.has(o.id)) {
      stmts.push(db.prepare("UPDATE offers SET active = 0, last_changed_at = ? WHERE id = ?").bind(now, o.id));
      stmts.push(
        db
          .prepare("INSERT INTO price_points (offer_id, product_id, price_cents, in_stock, verification, observed_at) VALUES (?, ?, NULL, 0, ?, ?)")
          .bind(o.id, product.id, o.verification, now),
      );
    }
  }

  const filtered = applyCooldown(alerts, recent, settings.notifications.cooldownMinutes * 60_000, now);
  const inserted = await insertAlerts(db, filtered, now, stmts);
  return { persisted: kept.length, alerts: inserted };
}

async function recentAlerts(db: D1Database, productId: string, now: number): Promise<RecentAlert[]> {
  const { results } = await db
    .prepare("SELECT type, offer_id, price_cents, created_at FROM alerts WHERE product_id = ? AND created_at > ?")
    .bind(productId, now - 7 * 86400_000)
    .all<{ type: string; offer_id: string | null; price_cents: number | null; created_at: number }>();
  return results.map((r) => ({ type: r.type, offerId: r.offer_id, priceCents: r.price_cents, createdAt: r.created_at }));
}

/** Inserta (deduplicando por dedupe_key) en el mismo batch que el resto de escrituras. */
async function insertAlerts(
  db: D1Database,
  cands: AlertCandidate[],
  now: number,
  stmts: D1PreparedStatement[],
): Promise<AlertCandidate[]> {
  const offset = stmts.length;
  for (const c of cands) {
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO alerts (product_id, offer_id, type, dedupe_key, title, body, url, price_cents, prev_cents, verification, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(c.productId, c.offerId, c.type, c.dedupeKey, c.title, c.body, c.url, c.priceCents, c.prevCents, c.verification, now),
    );
  }
  if (!stmts.length) return [];
  const results = await db.batch(stmts);
  return cands.filter((_, i) => (results[offset + i]?.meta.changes ?? 0) > 0);
}

// ------------------------------------------------------------------ entrega

export async function deliverAlerts(env: Env, alerts: AlertCandidate[], now: number) {
  // Una notificación por oferta (la de mayor prioridad), con tope por ejecución.
  const perOffer = new Map<string, AlertCandidate>();
  for (const a of prioritize(alerts)) {
    const k = a.offerId ?? a.dedupeKey;
    if (!perOffer.has(k)) perOffer.set(k, a);
  }
  const toSend = prioritize([...perOffer.values()]).slice(0, MAX_PUSHES_PER_RUN);
  const totals = { sent: 0, failed: 0 };
  const sender = await createPushSender(env);
  const updates: D1PreparedStatement[] = [];
  for (const a of toSend) {
    const r = await sender.send({ title: a.title, body: a.body, url: a.url, tag: a.type });
    totals.sent += r.sent;
    totals.failed += r.failed;
    updates.push(
      env.DB
        .prepare("UPDATE alerts SET pushed_at = ?, push_result = ? WHERE dedupe_key = ?")
        .bind(now, JSON.stringify({ sent: r.sent, failed: r.failed, errors: r.errors.slice(0, 3) }), a.dedupeKey),
    );
  }
  await sender.flush(updates);
  return totals;
}

// ------------------------------------------------------------------ mantenimiento

export async function maintenance(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM checks WHERE started_at < ?").bind(now - 30 * 86400_000),
    db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - 86400_000),
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
  ]);
}
