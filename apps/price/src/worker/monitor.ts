import { ADAPTERS } from "./adapters/registry";
import type { SourceAdapter } from "./adapters/types";
import {
  applyCooldown,
  evaluateOffer,
  evaluateOpportunity,
  gatePrice,
  prioritize,
  type AlertCandidate,
  type RecentAlert,
} from "./domain/alerts";
import { matchObservation } from "./domain/matcher";
import type { Observation, Product, SourceRow } from "./domain/types";
import type { Env } from "./env";
import { redact, schedulerBackoffMs, SourceError } from "./lib/http";
import { sha256Hex, utcDay } from "./lib/util";
import { createPushSender, MAX_PUSHES_PER_RUN } from "./notifier";
import {
  activeEvent,
  getProviderSync,
  intervalFactor,
  loadWindowStates,
  parseQuota,
  planSource,
  recordUsageStatements,
  saveProviderSync,
  type CommercialEvent,
  type Plan,
  type ProviderSync,
  type WindowState,
} from "./quota";
import { deliveredCents, getOffers, getProducts, getSettings, getSources, type AppSettings } from "./repo";

/** Máximo de ofertas persistidas por fuente/producto y ejecución (control de escrituras D1). */
export const MAX_OFFERS_PER_RUN = 15;
/** Tolerancia para que el cron de 5 min no "salte" una ventana por milisegundos. */
const DUE_TOLERANCE_MS = 30_000;
/** Si una oferta no cambia, se refresca `last_seen_at` como mucho cada hora. */
const SEEN_REFRESH_MS = 3600_000;
/** Sincronización de cuota con el proveedor (llamada gratuita). */
const QUOTA_SYNC_EVERY_MS = 6 * 3600_000;
/** Duración del bloqueo de exclusión mutua del monitor. */
const LOCK_TTL_MS = 10 * 60_000;
/** Umbral de alerta de cuota. */
export const QUOTA_WARN_PCT = 80;
/** Fallo prolongado: N fallos seguidos o sin éxito durante este tiempo. */
const FAILURE_ALERT_COUNT = 4;
const FAILURE_ALERT_MS = 6 * 3600_000;

export interface RunOptions {
  now?: number;
  trigger: "cron" | "manual";
  force?: boolean;
  /** Solo estas fuentes (consulta manual). */
  only?: string[];
  adapters?: Record<string, SourceAdapter>;
}

export interface SourceRunSummary {
  source: string;
  status: "ok" | "error" | "skipped";
  reason?: string;
  offers?: number;
  alerts?: number;
  calls?: number;
  intervalS?: number;
}

export interface RunSummary {
  startedAt: number;
  finishedAt?: number;
  locked?: boolean;
  event?: string | null;
  sources: SourceRunSummary[];
  alertsCreated: number;
  pushes: { sent: number; failed: number };
}

// ------------------------------------------------------------------ exclusión mutua

export async function acquireLock(db: D1Database, name: string, owner: string, now: number, ttl = LOCK_TTL_MS) {
  const r = await db
    .prepare(
      `INSERT INTO kv_internal (key, value, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
         WHERE kv_internal.expires_at IS NULL OR kv_internal.expires_at < ?
       RETURNING value`,
    )
    .bind(`lock:${name}`, owner, now + ttl, now)
    .first<{ value: string }>();
  return r?.value === owner;
}

export async function releaseLock(db: D1Database, name: string, owner: string) {
  await db.prepare("DELETE FROM kv_internal WHERE key = ? AND value = ?").bind(`lock:${name}`, owner).run();
}

// ------------------------------------------------------------------ monitor

export async function runMonitor(env: Env, opts: RunOptions): Promise<RunSummary> {
  const now = opts.now ?? Date.now();
  const db = env.DB;
  const owner = crypto.randomUUID();
  const summary: RunSummary = { startedAt: now, sources: [], alertsCreated: 0, pushes: { sent: 0, failed: 0 } };
  if (!(await acquireLock(db, "monitor", owner, now))) {
    summary.locked = true;
    return summary;
  }
  try {
    await runLocked(env, opts, now, summary);
  } finally {
    await releaseLock(db, "monitor", owner);
  }
  summary.finishedAt = Date.now();
  await db
    .prepare("INSERT OR REPLACE INTO kv_internal (key, value, expires_at) VALUES (?, ?, NULL)")
    .bind(`monitor:last_${opts.trigger}`, JSON.stringify(summary))
    .run();
  return summary;
}

async function runLocked(env: Env, opts: RunOptions, now: number, summary: RunSummary) {
  const db = env.DB;
  const adapters = opts.adapters ?? ADAPTERS;
  const manual = opts.trigger === "manual";
  const [sources, products, settings] = await Promise.all([getSources(db), getProducts(db, true), getSettings(db)]);
  const event = activeEvent(now, settings.events);
  summary.event = event?.name ?? null;
  const newAlerts: AlertCandidate[] = [];
  const systemAlerts: AlertCandidate[] = [];

  // 1) Fuentes elegibles + sincronización gratuita de cuota con el proveedor.
  const eligible: Array<{ src: SourceRow; adapter: SourceAdapter; quota: ReturnType<typeof parseQuota>; sync: ProviderSync | null }> = [];
  for (const src of sources) {
    const adapter = adapters[src.id];
    if (!adapter || !src.enabled) continue;
    if (opts.only && !opts.only.includes(src.id)) continue;
    if (src.suspended_reason) {
      summary.sources.push({ source: src.id, status: "skipped", reason: `suspendida: ${src.suspended_reason}` });
      continue;
    }
    if (!adapter.isConfigured(env)) {
      summary.sources.push({ source: src.id, status: "skipped", reason: "sin credenciales" });
      continue;
    }
    const quota = parseQuota(src.quota);
    let sync = quota.syncFromProvider ? await getProviderSync(db, src.id) : null;
    if (quota.syncFromProvider && adapter.syncQuota && (!sync || now - sync.syncedAt > QUOTA_SYNC_EVERY_MS || sync.renewalAt <= now)) {
      try {
        const r = await adapter.syncQuota({ env, db, now, countCall: () => {} });
        const declared = quota.windows.find((w) => w.kind === "cycle")?.limit;
        if (declared != null && r.limit !== declared) {
          systemAlerts.push(systemAlert("provider_change", `${src.id}:limit:${r.limit}`, `${src.name}: cambiaron las condiciones`,
            `Cuota del plan: ${declared} → ${r.limit} búsquedas por ciclo. Se usa el valor real del proveedor.`));
        }
        if (r.renewalAt != null) {
          sync = { limit: r.limit, used: r.used, renewalAt: r.renewalAt, syncedAt: now };
          await saveProviderSync(db, src.id, sync);
        }
      } catch (e) {
        console.log(JSON.stringify({ event: "quota_sync_error", source: src.id, error: redact((e as Error).message) }));
      }
    }
    eligible.push({ src, adapter, quota, sync });
  }

  // 2) Estado de cuotas (una consulta para todas las fuentes).
  const windowsBySource = await loadWindowStates(
    db,
    eligible.map((e) => ({ id: e.src.id, quota: e.quota, sync: e.sync })),
    now,
  );

  // 3) Cada fuente aislada: el fallo o agotamiento de una no afecta a las demás.
  for (const { src, adapter, quota } of eligible) {
    const windows = windowsBySource.get(src.id) ?? [];
    const callsNeeded = adapter.callsPerRun * Math.max(1, products.length);
    const monthly = quota.windows.some((w) => w.kind === "cycle" || w.kind === "month");
    const plan = planSource({
      now,
      windows,
      callsPerRun: callsNeeded,
      desiredIntervalS: src.interval_s,
      minIntervalS: src.min_interval_s,
      intervalFactor: intervalFactor({ event: Boolean(event), monthlyQuota: monthly, lastChangeAt: src.last_change_at, now }),
    });
    for (const w of windows) {
      if (w.limit > 0 && (w.used / w.limit) * 100 >= QUOTA_WARN_PCT) {
        systemAlerts.push(systemAlert("quota_warning", `${src.id}:${w.key}`, `${src.name}: cuota al ${Math.round((w.used / w.limit) * 100)} %`,
          `Usadas ${w.used} de ${w.limit} (${w.kind}). Renovación: ${new Date(w.end).toISOString().slice(0, 16).replace("T", " ")} UTC. La frecuencia se ajusta sola.`));
      }
    }
    try {
      const r = await runSource(env, { src, adapter, windows, plan, products, settings, now, manual, force: Boolean(opts.force), trigger: opts.trigger });
      summary.sources.push(r.summary);
      newAlerts.push(...r.alerts);
    } catch (e) {
      // Error inesperado (bug, D1): aislado a esta fuente.
      console.log(JSON.stringify({ event: "source_crash", source: src.id, error: redact((e as Error).message) }));
      summary.sources.push({ source: src.id, status: "error", reason: "error interno" });
    }
  }

  // 4) Alertas del sistema: fallos prolongados.
  const fresh = await getSources(db);
  for (const s of fresh) {
    const a = adapters[s.id];
    if (!a || !s.enabled || !a.isConfigured(env)) continue;
    const longSilence = s.last_attempt_at != null && (s.last_success_at == null ? false : now - s.last_success_at > FAILURE_ALERT_MS);
    if (s.consecutive_failures >= FAILURE_ALERT_COUNT || (longSilence && s.consecutive_failures > 0)) {
      systemAlerts.push(systemAlert("source_failure", `${s.id}:${utcDay(now)}`, `${s.name}: fallo prolongado`,
        `${s.consecutive_failures} fallos seguidos. Último error: ${s.last_error ?? "—"}. Se reintenta automáticamente; las demás fuentes siguen activas.`));
    }
  }
  if (systemAlerts.length && settings.notifications.system) {
    const inserted = await insertAlerts(db, systemAlerts, now, []);
    newAlerts.push(...inserted);
  }

  summary.alertsCreated = newAlerts.length;
  if (newAlerts.length) summary.pushes = await deliverAlerts(env, newAlerts, now);
}

function systemAlert(type: "source_failure" | "quota_warning" | "provider_change", key: string, title: string, body: string): AlertCandidate {
  return { type, productId: "system", offerId: null, dedupeKey: `${type}:${key}`, title, body, url: null, priceCents: null, prevCents: null, verification: "verified" };
}

interface SourceRunInput {
  src: SourceRow;
  adapter: SourceAdapter;
  windows: WindowState[];
  plan: Plan;
  products: Product[];
  settings: AppSettings;
  now: number;
  manual: boolean;
  force: boolean;
  trigger: "cron" | "manual";
}

async function runSource(env: Env, i: SourceRunInput): Promise<{ summary: SourceRunSummary; alerts: AlertCandidate[] }> {
  const { src, adapter, windows, plan, products, settings, now } = i;
  const db = env.DB;

  if (src.backoff_until && src.backoff_until > now) {
    return { summary: { source: src.id, status: "skipped", reason: "circuito abierto (backoff)" }, alerts: [] };
  }
  if (!i.force && now < src.next_check_at - DUE_TOLERANCE_MS) {
    return { summary: { source: src.id, status: "skipped", reason: "no toca" }, alerts: [] };
  }
  const allowed = i.manual ? plan.manualAllowed : plan.autoAllowed;
  if (!allowed) {
    const reason = i.manual ? "sin reserva para consultas manuales" : plan.reason;
    if (!i.manual) {
      await db
        .prepare("UPDATE sources SET next_check_at = ? WHERE id = ?")
        .bind(plan.blockedUntil ?? now + plan.intervalS * 1000, src.id)
        .run();
    }
    return { summary: { source: src.id, status: "skipped", reason }, alerts: [] };
  }

  let calls = 0;
  const ctx = { env, db, now, countCall: () => void calls++ };
  let failure: SourceError | null = null;
  let offersSeen = 0;
  let changed = false;
  const alerts: AlertCandidate[] = [];
  const tail: D1PreparedStatement[] = [];

  for (const product of products) {
    const started = Date.now();
    try {
      const res = await adapter.fetchOffers(product, ctx);
      const checkStmt = db
        .prepare("INSERT INTO checks (source_id, product_id, started_at, duration_ms, ok, http_status, offers_found, calls, trigger) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)")
        .bind(src.id, product.id, now, Date.now() - started, res.httpStatus ?? null, res.observations.length, res.calls, i.trigger);
      const r = await persistObservations(env, product, src.id, res.observations, settings, now, [checkStmt]);
      offersSeen += r.persisted;
      changed ||= r.changed;
      alerts.push(...r.alerts);
    } catch (e) {
      failure = e instanceof SourceError ? e : new SourceError((e as Error).message);
      tail.push(
        db
          .prepare("INSERT INTO checks (source_id, product_id, started_at, duration_ms, ok, http_status, error, calls, trigger) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)")
          .bind(src.id, product.id, now, Date.now() - started, failure.status, redact(failure.message).slice(0, 500), calls, i.trigger),
      );
      break;
    }
  }

  // Contabilidad de cuota: TODAS las llamadas reales, también las fallidas.
  tail.push(...recordUsageStatements(db, src.id, windows, calls, i.manual, now));

  if (!failure) {
    // Tras consumir, el próximo turno respeta el ritmo (consultas manuales no adelantan el automático).
    const next = i.manual ? Math.max(src.next_check_at, now) : now + i.plan.intervalS * 1000;
    tail.push(
      db
        .prepare(
          `UPDATE sources SET consecutive_failures = 0, backoff_until = NULL, last_attempt_at = ?, last_success_at = ?,
             next_check_at = ?, last_change_at = CASE WHEN ? THEN ? ELSE last_change_at END WHERE id = ?`,
        )
        .bind(now, now, next, changed ? 1 : 0, now, src.id),
    );
    await db.batch(tail);
    return { summary: { source: src.id, status: "ok", offers: offersSeen, alerts: alerts.length, calls, intervalS: plan.intervalS }, alerts };
  }

  const failures = src.consecutive_failures + 1;
  // Circuit breaker: credencial inválida → 6 h; 403 repetido (posible bloqueo o cuota) → escalado normal;
  // Retry-After del proveedor siempre se respeta.
  const wait = failure.fatal ? 6 * 3600_000 : Math.max(schedulerBackoffMs(failures), failure.retryAfterMs ?? 0);
  const msg = redact(failure.message).slice(0, 500);
  tail.push(
    db
      .prepare(
        `UPDATE sources SET consecutive_failures = ?, backoff_until = ?, last_attempt_at = ?, last_error = ?,
           last_error_at = ?, next_check_at = ? WHERE id = ?`,
      )
      .bind(failures, now + wait, now, msg, now, now + wait, src.id),
  );
  await db.batch(tail);
  return { summary: { source: src.id, status: "error", reason: msg, calls }, alerts };
}

// ------------------------------------------------------------------ persistencia

function isHttps(u: string): boolean {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

export async function persistObservations(
  env: Env,
  product: Product,
  sourceId: string,
  observations: Observation[],
  settings: AppSettings,
  now: number,
  extra: D1PreparedStatement[] = [],
): Promise<{ persisted: number; alerts: AlertCandidate[]; changed: boolean }> {
  const db = env.DB;
  const [all, recent, hmin] = await Promise.all([
    getOffers(db, product.id, false),
    recentAlerts(db, product.id, now),
    db
      .prepare(
        `SELECT MIN(pp.price_cents) AS m FROM price_points pp JOIN offers o ON o.id = pp.offer_id
         WHERE pp.product_id = ? AND pp.price_cents IS NOT NULL AND o.match_status IN ('match','user_asserted')
           AND pp.verification != 'simulated'`,
      )
      .bind(product.id)
      .first<{ m: number | null }>(),
  ]);
  const byId = new Map(all.map((o) => [o.id, o]));
  const bootstrap = !all.some((o) => o.source_id === sourceId);
  const matchable = all.filter((o) => o.active && (o.match_status === "match" || o.match_status === "user_asserted"));
  const knownStores = new Set(
    all.filter((o) => o.match_status === "match" || o.match_status === "user_asserted").map((o) => o.store.toLowerCase()),
  );
  const bestVerified = matchable
    .filter((o) => o.verification === "verified")
    .map(deliveredCents)
    .filter((x): x is number => x != null)
    .reduce<number | null>((m, x) => (m == null || x < m ? x : m), null);

  // 1) Verificación de variante; lo que no es el producto se descarta.
  const candidates = [] as Array<{ obs: Observation; id: string; status: ReturnType<typeof matchObservation> }>;
  for (const obs of observations) {
    if (!isHttps(obs.url)) continue; // enlaces externos: solo https
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

  const stmts: D1PreparedStatement[] = [...extra];
  const alerts: AlertCandidate[] = [];
  const seen = new Set<string>();
  let anyChange = false;

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
    anyChange ||= changed;
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
    const offerEval = { id, store: obs.store, url: obs.url, verification: obs.verification, matchStatus: status.status };

    if (status.status === "partial") {
      if (!prev || prev.price_cents !== price) {
        const missing = Object.entries(status.checks)
          .filter(([k, v]) => k !== "notes" && v === "unknown")
          .map(([k]) => ({ model: "modelo", storage: "almacenamiento", color: "color", condition: "condición", unlocked: "desbloqueo", noStrings: "condiciones" })[k] ?? k);
        const opp = evaluateOpportunity({
          product, offer: offerEval, priceCents: nextDelivered, bestKnownCents: bestVerified, missing, prefs: settings.notifications, bootstrap,
        });
        if (opp) alerts.push(opp);
      }
      continue;
    }

    const prevDelivered = prev && prev.active ? deliveredCents(prev) : null;
    const bestOther = matchable
      .filter((o) => o.id !== id)
      .map(deliveredCents)
      .filter((x): x is number => x != null)
      .reduce<number | null>((m, x) => (m == null || x < m ? x : m), null);
    alerts.push(
      ...evaluateOffer({
        product,
        offer: offerEval,
        isNew: !prev,
        prev: prev ? { priceCents: prevDelivered, inStock: prev.active ? (prev.in_stock == null ? null : prev.in_stock === 1) : false } : null,
        next: { priceCents: nextDelivered, inStock: obs.inStock },
        bestOtherCents: bestOther,
        historicalMinCents: hmin?.m ?? null,
        knownStore: knownStores.has(obs.store.toLowerCase()),
        bootstrap,
        prefs: settings.notifications,
        now,
      }),
    );
  }

  // Ofertas de esta fuente que ya no aparecen → inactivas (solo si la consulta fue exitosa).
  for (const o of all) {
    if (o.source_id === sourceId && o.active && !seen.has(o.id)) {
      anyChange = true;
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
  return { persisted: kept.length, alerts: inserted, changed: anyChange };
}

async function recentAlerts(db: D1Database, productId: string, now: number): Promise<RecentAlert[]> {
  const { results } = await db
    .prepare("SELECT type, offer_id, price_cents, created_at FROM alerts WHERE product_id = ? AND created_at > ?")
    .bind(productId, now - 7 * 86400_000)
    .all<{ type: string; offer_id: string | null; price_cents: number | null; created_at: number }>();
  return results.map((r) => ({ type: r.type, offerId: r.offer_id, priceCents: r.price_cents, createdAt: r.created_at }));
}

/** Inserta (deduplicando por dedupe_key) en el mismo batch que el resto de escrituras. */
export async function insertAlerts(
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
        .bind(now, JSON.stringify({ sent: r.sent, failed: r.failed, errors: r.errors.slice(0, 3).map(redact) }), a.dedupeKey),
    );
  }
  await sender.flush(updates);
  return totals;
}

// ------------------------------------------------------------------ mantenimiento y retención

export async function maintenance(db: D1Database, now: number, settings?: AppSettings): Promise<void> {
  const r = settings?.retention ?? { checksDays: 30, alertsDays: 365, inactiveOffersDays: 180 };
  const day = 86400_000;
  await db.batch([
    db.prepare("DELETE FROM checks WHERE started_at < ?").bind(now - r.checksDays * day),
    db.prepare("DELETE FROM alerts WHERE created_at < ?").bind(now - r.alertsDays * day),
    db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(now - day),
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    db.prepare("DELETE FROM quota_usage WHERE window_end < ?").bind(now - 90 * day),
    // Ofertas parciales o descubiertas inactivas hace tiempo: no aportan historial relevante.
    db
      .prepare(
        "DELETE FROM price_points WHERE offer_id IN (SELECT id FROM offers WHERE active = 0 AND match_status = 'partial' AND last_changed_at < ?)",
      )
      .bind(now - r.inactiveOffersDays * day),
    db
      .prepare("DELETE FROM offers WHERE active = 0 AND match_status = 'partial' AND last_changed_at < ?")
      .bind(now - r.inactiveOffersDays * day),
  ]);
}

export type { CommercialEvent };
