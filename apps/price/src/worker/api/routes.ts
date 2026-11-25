import { ADAPTERS } from "../adapters/registry";
import { evaluateOffer, type AlertCandidate } from "../domain/alerts";
import { computeFinancing, isBetterFinancing, type FinancingComputed } from "../domain/financing";
import { totalWithTax } from "../domain/tax";
import type { Env } from "../env";
import { sha256Hex, safeJsonParse } from "../lib/util";
import { deliverAlerts, runMonitor } from "../monitor";
import { getOrCreateVapid, pushToAll } from "../notifier";
import { isAllowedPushEndpoint } from "../push/webpush";
import {
  deliveredCents,
  getOffers,
  getProduct,
  getProducts,
  getSettings,
  getSources,
  setSetting,
  sourceFreshness,
  type OfferRow,
} from "../repo";
import { claim, rateLimit, requireSession, revokeSession } from "./auth";
import { bool, dateMs, errorResponse, HttpError, httpsUrl, int, json, readJson, str } from "./http";

export const APP_VERSION = "0.1.0";

type Handler = (ctx: { req: Request; env: Env; now: number; params: Record<string, string>; session: string }) => Promise<Response>;

interface Route {
  method: string;
  pattern: URLPattern;
  auth: boolean;
  handler: Handler;
}

const routes: Route[] = [];
function route(method: string, path: string, handler: Handler, auth = true) {
  routes.push({ method, pattern: new URLPattern({ pathname: path }), auth, handler });
}

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const now = Date.now();
  try {
    const url = new URL(req.url);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.pattern.exec({ pathname: url.pathname });
      if (!m) continue;
      let session = "";
      if (r.auth) {
        session = await requireSession(req, env, now);
        await rememberOrigin(env, url.origin);
      }
      if (req.method !== "GET" && r.auth) {
        // Defensa CSRF adicional: las escrituras deben venir del mismo origen.
        const origin = req.headers.get("origin");
        if (origin && origin !== url.origin) throw new HttpError(403, "Origen no permitido");
      }
      const params = Object.fromEntries(
        Object.entries(m.pathname.groups).filter((e): e is [string, string] => typeof e[1] === "string"),
      );
      return await r.handler({ req, env, now, params, session });
    }
    return json({ error: "No encontrado" }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}

let originRemembered = false;
async function rememberOrigin(env: Env, origin: string) {
  if (originRemembered || !origin.startsWith("https://")) return;
  await setSetting(env.DB, "app_origin", origin);
  originRemembered = true;
}

// ------------------------------------------------------------------ públicas

route(
  "GET",
  "/api/health",
  async ({ env, now }) => {
    const sources = await getSources(env.DB);
    return json({
      ok: true,
      version: APP_VERSION,
      time: now,
      sources: sources.map((s) => ({
        id: s.id,
        lastSuccessAt: s.last_success_at,
        configured: s.kind === "manual" || Boolean(ADAPTERS[s.id]?.isConfigured(env)),
      })),
    });
  },
  false,
);

route(
  "POST",
  "/api/auth/claim",
  async ({ req, env, now }) => {
    const body = await readJson(req);
    const code = str(body, "code", 200)!;
    const label = str(body, "label", 60, { optional: true });
    return json(await claim(req, env, code, label, now));
  },
  false,
);

route("POST", "/api/auth/logout", async ({ env, session }) => {
  await revokeSession(env, session);
  return json({ ok: true });
});

// ------------------------------------------------------------------ panel

function offerView(o: OfferRow, taxRate: number) {
  const delivered = deliveredCents(o);
  const t = o.price_cents != null ? totalWithTax(o.price_cents, o.shipping_cents, taxRate) : null;
  return {
    id: o.id,
    source: o.source_id,
    store: o.store,
    title: o.title,
    url: o.url,
    verification: o.verification,
    match: o.match_status,
    checks: safeJsonParse(o.match_checks, {}),
    priceCents: o.price_cents,
    shippingCents: o.shipping_cents,
    deliveredCents: delivered,
    taxCents: t?.taxCents ?? null,
    totalCents: t?.totalCents ?? null,
    inStock: o.in_stock == null ? null : o.in_stock === 1,
    pendingPriceCents: o.pending_price_cents,
    lastSeenAt: o.last_seen_at,
    lastChangedAt: o.last_changed_at,
    active: o.active === 1,
  };
}

interface FinancingRow {
  id: number;
  product_id: string;
  offer_id: string | null;
  store: string;
  provider: string | null;
  apr_bps: number | null;
  months: number | null;
  monthly_cents: number | null;
  down_cents: number | null;
  total_cents: number | null;
  cash_price_cents: number | null;
  eligibility: string | null;
  conditions: string | null;
  url: string | null;
  origin: string;
  origin_note: string | null;
  observed_at: number;
  expires_at: number | null;
}

function financingView(f: FinancingRow, now: number) {
  const c = computeFinancing({
    cashPriceCents: f.cash_price_cents,
    aprBps: f.apr_bps,
    months: f.months,
    monthlyCents: f.monthly_cents,
    downCents: f.down_cents,
    totalCents: f.total_cents,
  });
  return {
    id: f.id,
    store: f.store,
    offerId: f.offer_id,
    provider: f.provider,
    ...c,
    eligibility: f.eligibility,
    conditions: f.conditions,
    url: f.url,
    origin: f.origin,
    originNote: f.origin_note,
    observedAt: f.observed_at,
    expiresAt: f.expires_at,
    expired: f.expires_at != null && f.expires_at < now,
  };
}

async function activeFinancing(db: D1Database, productId: string, now: number) {
  const { results } = await db
    .prepare("SELECT * FROM financing WHERE product_id = ? ORDER BY observed_at DESC LIMIT 50")
    .bind(productId)
    .all<FinancingRow>();
  return results.map((f) => financingView(f, now));
}

route("GET", "/api/dashboard", async ({ env, now }) => {
  const db = env.DB;
  const [products, sources, settings] = await Promise.all([getProducts(db), getSources(db), getSettings(db)]);
  const rate = settings.tax.ratePct;
  const items = [];
  for (const p of products) {
    const offers = (await getOffers(db, p.id, true)).map((o) => offerView(o, rate));
    const ranked = offers
      .filter((o) => o.deliveredCents != null)
      .sort((a, b) => a.deliveredCents! - b.deliveredCents!);
    const verifiedMatches = ranked.filter((o) => o.match === "match" && o.verification === "verified");
    const best = verifiedMatches[0] ?? null;
    const bestAny = ranked.find((o) => o.match === "match" || o.match === "user_asserted") ?? null;
    const fin = (await activeFinancing(db, p.id, now)).filter((f) => !f.expired);
    items.push({
      product: p,
      best,
      bestAny,
      offers: ranked,
      financing: fin,
      bestFinancing: fin.reduce<(typeof fin)[number] | null>((m, f) => (isBetterFinancing(m, f) ? f : m), null),
    });
  }
  const { results: alerts } = await db.prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 20").all();
  return json({
    now,
    tax: settings.tax,
    products: items,
    sources: sources.map((s) => sourceView(s, env, now, settings.staleness.staleAfterIntervals)),
    alerts,
  });
});

function sourceView(s: Awaited<ReturnType<typeof getSources>>[number], env: Env, now: number, staleAfter: number) {
  const configured = s.kind === "manual" || Boolean(ADAPTERS[s.id]?.isConfigured(env));
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    enabled: s.enabled === 1,
    configured,
    freshness: sourceFreshness(s, configured, now, staleAfter),
    intervalS: s.interval_s,
    minIntervalS: s.min_interval_s,
    dailyBudget: s.daily_budget,
    callsToday: s.budget_day === new Date(now).toISOString().slice(0, 10) ? s.calls_today : 0,
    lastSuccessAt: s.last_success_at,
    lastAttemptAt: s.last_attempt_at,
    lastError: s.last_error,
    lastErrorAt: s.last_error_at,
    consecutiveFailures: s.consecutive_failures,
    nextCheckAt: s.next_check_at,
    backoffUntil: s.backoff_until,
  };
}

route("GET", "/api/sources", async ({ env, now }) => {
  const [sources, settings] = await Promise.all([getSources(env.DB), getSettings(env.DB)]);
  const { results: checks } = await env.DB
    .prepare("SELECT * FROM checks ORDER BY started_at DESC LIMIT 50")
    .all();
  return json({ sources: sources.map((s) => sourceView(s, env, now, settings.staleness.staleAfterIntervals)), checks });
});

route("PATCH", "/api/sources/:id", async ({ req, env, params }) => {
  const body = await readJson(req);
  const src = (await getSources(env.DB)).find((s) => s.id === params.id);
  if (!src) throw new HttpError(404, "Fuente no encontrada");
  const enabled = bool(body, "enabled", { optional: true });
  const interval = int(body, "intervalS", src.min_interval_s, 86400, { optional: true });
  const budget = int(body, "dailyBudget", 0, 50000, { optional: true });
  await env.DB
    .prepare("UPDATE sources SET enabled = COALESCE(?, enabled), interval_s = COALESCE(?, interval_s), daily_budget = COALESCE(?, daily_budget) WHERE id = ?")
    .bind(enabled == null ? null : enabled ? 1 : 0, interval ?? null, budget ?? null, src.id)
    .run();
  return json({ ok: true });
});

// ------------------------------------------------------------------ productos

route("GET", "/api/products", async ({ env }) => json({ products: await getProducts(env.DB) }));

route("PATCH", "/api/products/:id", async ({ req, env, params, now }) => {
  const p = await getProduct(env.DB, params.id!);
  if (!p) throw new HttpError(404, "Producto no encontrado");
  const body = await readJson(req);
  const target = int(body, "targetCents", 1000, 10_000_000, { optional: true });
  const msrp = int(body, "msrpCents", 1000, 10_000_000, { optional: true });
  const msrpStatus = str(body, "msrpStatus", 20, { optional: true });
  if (msrpStatus && msrpStatus !== "provisional" && msrpStatus !== "verified") throw new HttpError(400, "msrpStatus inválido");
  const active = bool(body, "active", { optional: true });
  await env.DB
    .prepare(
      `UPDATE products SET target_cents = COALESCE(?, target_cents), msrp_cents = COALESCE(?, msrp_cents),
         msrp_status = COALESCE(?, msrp_status), active = COALESCE(?, active), updated_at = ? WHERE id = ?`,
    )
    .bind(target ?? null, msrp ?? null, msrpStatus ?? null, active == null ? null : active ? 1 : 0, now, p.id)
    .run();
  return json({ product: await getProduct(env.DB, p.id) });
});

route("POST", "/api/products", async ({ req, env, now }) => {
  const body = await readJson(req);
  const name = str(body, "name", 120)!;
  const spec = body.spec as Record<string, unknown> | undefined;
  if (!spec || typeof spec !== "object") throw new HttpError(400, "Falta spec");
  const modelLabel = str(spec, "modelLabel", 80)!;
  const storageGb = int(spec, "storageGb", 1, 4096)!;
  const color = str(spec, "color", 40)!;
  const unlocked = bool(spec, "unlocked")!;
  const target = int(body, "targetCents", 1000, 10_000_000, { optional: true });
  const msrp = int(body, "msrpCents", 1000, 10_000_000, { optional: true });
  const escaped = modelLabel.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  const fullSpec = {
    brand: str(spec, "brand", 40) ?? "",
    modelPattern: escaped,
    modelLabel,
    storageGb,
    color: color.toLowerCase(),
    colorAliases: [color.toLowerCase()],
    condition: "new",
    unlocked,
    searchQuery: `${modelLabel} ${storageGb}GB ${color}${unlocked ? " Unlocked" : ""}`,
    priceFloorCents: int(spec, "priceFloorCents", 100, 10_000_000, { optional: true }) ?? 5000,
    priceCeilCents: int(spec, "priceCeilCents", 100, 10_000_000, { optional: true }) ?? 1_000_000,
  };
  const id = (await sha256Hex(`${name}|${now}`)).slice(0, 16);
  await env.DB
    .prepare("INSERT INTO products (id, name, spec, msrp_cents, msrp_status, target_cents, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'provisional', ?, 1, ?, ?)")
    .bind(id, name, JSON.stringify(fullSpec), msrp ?? null, target ?? null, now, now)
    .run();
  return json({ product: await getProduct(env.DB, id) }, 201);
});

route("GET", "/api/products/:id/history", async ({ req, env, params, now }) => {
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 30) || 30));
  const { results } = await env.DB
    .prepare(
      `SELECT pp.offer_id, pp.price_cents, pp.in_stock, pp.verification, pp.observed_at, o.store, o.source_id
       FROM price_points pp JOIN offers o ON o.id = pp.offer_id
       WHERE pp.product_id = ? AND pp.observed_at > ? AND o.match_status IN ('match','user_asserted')
       ORDER BY pp.observed_at`,
    )
    .bind(params.id, now - days * 86400_000)
    .all();
  return json({ points: results });
});

// ------------------------------------------------------------------ carga manual

route("POST", "/api/offers/manual", async ({ req, env, now }) => {
  const body = await readJson(req);
  const product = await getProduct(env.DB, str(body, "productId", 64)!);
  if (!product) throw new HttpError(404, "Producto no encontrado");
  const store = str(body, "store", 60)!;
  const url = httpsUrl(body, "url")!;
  const price = int(body, "priceCents", 100, 10_000_000)!;
  const shipping = int(body, "shippingCents", 0, 100_000, { optional: true }) ?? null;
  const inStock = bool(body, "inStock", { optional: true });
  const observedAt = dateMs(body, "observedAt", now, { optional: true }) ?? now;
  const note = str(body, "note", 300, { optional: true });
  const id = await sha256Hex(`manual|${store.toLowerCase()}|${url}`);
  const prev = (await getOffers(env.DB, product.id, false)).find((o) => o.id === id) ?? null;
  const all = await getOffers(env.DB, product.id, true);
  const stockVal = inStock == null ? null : inStock ? 1 : 0;
  const checks = { notes: ["Declarado por el usuario", ...(note ? [note] : [])] };
  const stmts = [
    env.DB
      .prepare(
        `INSERT INTO offers (id, product_id, source_id, store, external_id, title, url, verification, match_status, match_checks,
           price_cents, shipping_cents, in_stock, pending_count, first_seen_at, last_seen_at, last_changed_at, active)
         VALUES (?, ?, 'manual', ?, ?, ?, ?, 'manual', 'user_asserted', ?, ?, ?, ?, 0, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET price_cents = excluded.price_cents, shipping_cents = excluded.shipping_cents,
           in_stock = excluded.in_stock, match_checks = excluded.match_checks, last_seen_at = excluded.last_seen_at,
           last_changed_at = excluded.last_changed_at, active = 1`,
      )
      .bind(id, product.id, store, url, `${product.name} — ${store}`, url, JSON.stringify(checks), price, shipping, stockVal, observedAt, observedAt, observedAt),
    env.DB
      .prepare("INSERT INTO price_points (offer_id, product_id, price_cents, in_stock, verification, observed_at) VALUES (?, ?, ?, ?, 'manual', ?)")
      .bind(id, product.id, price + (shipping ?? 0), stockVal, observedAt),
  ];
  await env.DB.batch(stmts);

  const settings = await getSettings(env.DB);
  const bestOther = all
    .filter((o) => o.id !== id && (o.match_status === "match" || o.match_status === "user_asserted"))
    .map(deliveredCents)
    .filter((x): x is number => x != null)
    .reduce<number | null>((m, x) => (m == null || x < m ? x : m), null);
  const cands = evaluateOffer({
    product,
    offer: { id, store, url, verification: "manual", matchStatus: "user_asserted" },
    isNew: !prev,
    prev: prev ? { priceCents: deliveredCents(prev), inStock: prev.in_stock == null ? null : prev.in_stock === 1 } : null,
    next: { priceCents: price + (shipping ?? 0), inStock: inStock ?? null },
    bestOtherCents: bestOther,
    bootstrap: false,
    prefs: settings.notifications,
    now,
  });
  const created = await insertAlertsDirect(env, cands, now);
  if (created.length) await deliverAlerts(env, created, now);
  return json({ offerId: id, alerts: created.length }, 201);
});

async function insertAlertsDirect(env: Env, cands: AlertCandidate[], now: number) {
  if (!cands.length) return [];
  const res = await env.DB.batch(
    cands.map((c) =>
      env.DB
        .prepare(
          `INSERT OR IGNORE INTO alerts (product_id, offer_id, type, dedupe_key, title, body, url, price_cents, prev_cents, verification, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(c.productId, c.offerId, c.type, c.dedupeKey, c.title, c.body, c.url, c.priceCents, c.prevCents, c.verification, now),
    ),
  );
  return cands.filter((_, i) => (res[i]?.meta.changes ?? 0) > 0);
}

route("DELETE", "/api/offers/:id", async ({ env, params, now }) => {
  const r = await env.DB
    .prepare("UPDATE offers SET active = 0, last_changed_at = ? WHERE id = ? AND source_id = 'manual'")
    .bind(now, params.id)
    .run();
  if (!r.meta.changes) throw new HttpError(404, "Solo se pueden retirar ofertas manuales");
  return json({ ok: true });
});

// ------------------------------------------------------------------ financiación

route("GET", "/api/products/:id/financing", async ({ env, params, now }) => {
  return json({ financing: await activeFinancing(env.DB, params.id!, now) });
});

route("POST", "/api/financing/manual", async ({ req, env, now }) => {
  const body = await readJson(req);
  const product = await getProduct(env.DB, str(body, "productId", 64)!);
  if (!product) throw new HttpError(404, "Producto no encontrado");
  const rec = {
    store: str(body, "store", 60)!,
    offerId: str(body, "offerId", 64, { optional: true }) ?? null,
    provider: str(body, "provider", 80, { optional: true }) ?? null,
    aprBps: int(body, "aprBps", 0, 10000, { optional: true }) ?? null,
    months: int(body, "months", 1, 120, { optional: true }) ?? null,
    monthlyCents: int(body, "monthlyCents", 1, 10_000_000, { optional: true }) ?? null,
    downCents: int(body, "downCents", 0, 10_000_000, { optional: true }) ?? null,
    totalCents: int(body, "totalCents", 1, 20_000_000, { optional: true }) ?? null,
    cashPriceCents: int(body, "cashPriceCents", 1, 10_000_000, { optional: true }) ?? null,
    eligibility: str(body, "eligibility", 500, { optional: true }) ?? null,
    conditions: str(body, "conditions", 1000, { optional: true }) ?? null,
    url: httpsUrl(body, "url")!,
    originNote: str(body, "originNote", 300)!, // procedencia obligatoria
    observedAt: dateMs(body, "observedAt", now)!,
    expiresAt: dateMs(body, "expiresAt", Number.MAX_SAFE_INTEGER, { optional: true }) ?? null,
  };
  if (rec.monthlyCents == null && (rec.aprBps == null || rec.months == null || rec.cashPriceCents == null)) {
    throw new HttpError(400, "Indica la cuota mensual, o bien APR + plazo + precio al contado");
  }
  const before = (await activeFinancing(env.DB, product.id, now)).filter((f) => !f.expired);
  const prevBest = before.reduce<FinancingComputed | null>((m, f) => (isBetterFinancing(m, f) ? f : m), null);
  const r = await env.DB
    .prepare(
      `INSERT INTO financing (product_id, offer_id, store, provider, apr_bps, months, monthly_cents, down_cents, total_cents,
         cash_price_cents, eligibility, conditions, url, origin, origin_note, observed_at, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      product.id, rec.offerId, rec.store, rec.provider, rec.aprBps, rec.months, rec.monthlyCents, rec.downCents, rec.totalCents,
      rec.cashPriceCents, rec.eligibility, rec.conditions, rec.url, rec.originNote, rec.observedAt, rec.expiresAt, now,
    )
    .first<{ id: number }>();
  const computed = computeFinancing(rec);
  const settings = await getSettings(env.DB);
  if (settings.notifications.financing && isBetterFinancing(prevBest, computed) && before.length > 0) {
    const created = await insertAlertsDirect(
      env,
      [
        {
          type: "financing_better",
          productId: product.id,
          offerId: rec.offerId,
          dedupeKey: `financing_better:${product.id}:${r?.id}`,
          title: `Mejor financiación en ${rec.store} (carga manual)`,
          body: `${rec.months ?? "?"} cuotas${rec.aprBps != null ? ` · APR ${(rec.aprBps / 100).toFixed(2)} %` : ""}${
            computed.totalCents != null ? ` · total ${(computed.totalCents / 100).toFixed(2)} USD` : ""
          }`,
          url: rec.url,
          priceCents: computed.totalCents,
          prevCents: prevBest?.totalCents ?? null,
          verification: "manual",
        },
      ],
      now,
    );
    if (created.length) await deliverAlerts(env, created, now);
  }
  return json({ id: r?.id, computed }, 201);
});

// ------------------------------------------------------------------ monitor bajo demanda

route("POST", "/api/check-now", async ({ env, now }) => {
  if (!(await rateLimit(env.DB, "check-now", 1, 120_000, now))) {
    throw new HttpError(429, "Espera 2 minutos entre consultas manuales");
  }
  const summary = await runMonitor(env, { now, trigger: "manual", force: true });
  return json(summary);
});

// ------------------------------------------------------------------ alertas y ajustes

route("GET", "/api/alerts", async ({ env }) => {
  const { results } = await env.DB.prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100").all();
  return json({ alerts: results });
});

route("GET", "/api/settings", async ({ env }) => {
  const s = await getSettings(env.DB);
  return json({ notifications: s.notifications, tax: s.tax, staleness: s.staleness });
});

route("PATCH", "/api/settings", async ({ req, env }) => {
  const body = await readJson(req);
  const s = await getSettings(env.DB);
  const n = body.notifications as Record<string, unknown> | undefined;
  if (n) {
    const next = { ...s.notifications };
    for (const k of ["priceDrop", "targetReached", "newOffer", "newBest", "backInStock", "financing", "discovered"] as const) {
      const v = bool(n, k, { optional: true });
      if (v != null) next[k] = v;
    }
    next.minDropCents = int(n, "minDropCents", 0, 100_000, { optional: true }) ?? next.minDropCents;
    next.minDropPct = int(n, "minDropPct", 0, 50, { optional: true }) ?? next.minDropPct;
    next.cooldownMinutes = int(n, "cooldownMinutes", 0, 10_080, { optional: true }) ?? next.cooldownMinutes;
    await setSetting(env.DB, "notifications", next);
  }
  const t = body.tax as Record<string, unknown> | undefined;
  if (t) {
    const rate = t.ratePct;
    if (rate !== undefined && (typeof rate !== "number" || rate < 0 || rate > 15)) throw new HttpError(400, "ratePct inválido");
    const zip = str(t, "zip", 10, { optional: true });
    if (zip && !/^\d{5}$/.test(zip)) throw new HttpError(400, "zip inválido");
    await setSetting(env.DB, "tax", {
      ...s.tax,
      ...(rate !== undefined ? { ratePct: rate } : {}),
      ...(zip ? { zip } : {}),
      ...(str(t, "place", 60, { optional: true }) ? { place: str(t, "place", 60) } : {}),
      ...(t.status === "verified" || t.status === "unverified" ? { status: t.status } : {}),
    });
  }
  const fresh = await getSettings(env.DB);
  return json({ notifications: fresh.notifications, tax: fresh.tax });
});

// ------------------------------------------------------------------ push

route("GET", "/api/push/vapid-public-key", async ({ env }) => {
  const keys = await getOrCreateVapid(env.DB);
  return json({ publicKey: keys.publicKey });
});

route("POST", "/api/push/subscribe", async ({ req, env, now }) => {
  const body = await readJson(req);
  const endpoint = str(body, "endpoint", 1000)!;
  if (!isAllowedPushEndpoint(endpoint)) throw new HttpError(400, "Servicio push no permitido");
  const keys = body.keys as Record<string, unknown> | undefined;
  if (!keys) throw new HttpError(400, "Faltan keys");
  const p256dh = str(keys, "p256dh", 200)!;
  const auth = str(keys, "auth", 100)!;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,30}$/.test(auth)) {
    throw new HttpError(400, "Claves de suscripción inválidas");
  }
  const id = await sha256Hex(endpoint);
  await env.DB
    .prepare(
      `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, revoked = 0, failures = 0`,
    )
    .bind(id, endpoint, p256dh, auth, now)
    .run();
  return json({ ok: true, id: id.slice(0, 8) }, 201);
});

route("POST", "/api/push/unsubscribe", async ({ req, env }) => {
  const body = await readJson(req);
  const endpoint = str(body, "endpoint", 1000)!;
  await env.DB.prepare("UPDATE push_subscriptions SET revoked = 1 WHERE id = ?").bind(await sha256Hex(endpoint)).run();
  return json({ ok: true });
});

route("GET", "/api/push/status", async ({ env }) => {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS n, MAX(last_ok_at) AS last FROM push_subscriptions WHERE revoked = 0")
    .first<{ n: number; last: number | null }>();
  return json({ subscriptions: row?.n ?? 0, lastDeliveredAt: row?.last ?? null });
});

route("POST", "/api/push/test", async ({ env, now }) => {
  if (!(await rateLimit(env.DB, "push-test", 3, 600_000, now))) throw new HttpError(429, "Máximo 3 pruebas cada 10 minutos");
  const r = await pushToAll(env, {
    title: "PRICE · Notificación de prueba",
    body: "Si ves esto, las notificaciones push funcionan en este dispositivo.",
    url: "/",
    tag: "test",
  });
  return json(r);
});
