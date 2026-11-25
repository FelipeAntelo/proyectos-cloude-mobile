import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SourceAdapter } from "../src/worker/adapters/types";
import type { Observation } from "../src/worker/domain/types";
import { SourceError } from "../src/worker/lib/http";
import { acquireLock, runMonitor } from "../src/worker/monitor";

const PID = "pixel-11-pro-xl-256-obsidian-unlocked";
const T0 = Date.UTC(2026, 10, 25, 12, 0, 0);

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM offers"),
    env.DB.prepare("DELETE FROM price_points"),
    env.DB.prepare("DELETE FROM alerts"),
    env.DB.prepare("DELETE FROM checks"),
    env.DB.prepare("DELETE FROM rate_limits"),
    env.DB.prepare("DELETE FROM financing"),
    env.DB.prepare("DELETE FROM quota_usage"),
    env.DB.prepare("DELETE FROM kv_internal WHERE key LIKE 'lock:%' OR key LIKE 'quota_sync:%' OR key LIKE 'monitor:%'"),
    env.DB.prepare("UPDATE sources SET consecutive_failures = 0, backoff_until = NULL, next_check_at = 0, last_success_at = NULL, last_attempt_at = NULL, last_error = NULL, suspended_reason = NULL"),
  ]);
});

/** Adaptador SIMULADO para tests: devuelve observaciones marcadas como "simulated" salvo que se indique. */
function fakeAdapter(id: string, script: Array<Observation[] | Error>): SourceAdapter & { calls: number } {
  const a = {
    id,
    callsPerRun: 1,
    calls: 0,
    isConfigured: () => true,
    async fetchOffers(_p: unknown, ctx: { countCall: () => void }) {
      ctx.countCall();
      const step = script[Math.min(a.calls, script.length - 1)]!;
      a.calls++;
      if (step instanceof Error) throw step;
      return { observations: step, calls: 1, httpStatus: 200 };
    },
  };
  return a;
}

const obs = (price: number, over: Partial<Observation> = {}): Observation => ({
  sourceId: "bestbuy",
  externalId: "sku-1",
  store: "Best Buy",
  title: "Google - Pixel 11 Pro XL 256GB (Unlocked) - Obsidian",
  url: "https://www.bestbuy.com/site/1.p?skuId=1",
  priceCents: price,
  shippingCents: 0,
  inStock: true,
  // En los tests de flujo de alertas necesitamos "verified" para ejercitar la lógica;
  // estos valores NUNCA se escriben en la base de producción.
  verification: "verified",
  attrs: { color: "Obsidian", condition: "New" },
  ...over,
});

async function alertTypes() {
  const { results } = await env.DB.prepare("SELECT type FROM alerts ORDER BY id").all<{ type: string }>();
  return results.map((r) => r.type);
}

describe("monitor programado", () => {
  it("persiste precios, historial y última comprobación exitosa", async () => {
    const bb = fakeAdapter("bestbuy", [[obs(129900)]]);
    const s = await runMonitor(env, { now: T0, trigger: "cron", adapters: { bestbuy: bb } });
    expect(s.sources[0]).toMatchObject({ source: "bestbuy", status: "ok", offers: 1 });
    const offer = await env.DB.prepare("SELECT * FROM offers").first<{ price_cents: number; match_status: string }>();
    expect(offer).toMatchObject({ price_cents: 129900, match_status: "match" });
    const pts = await env.DB.prepare("SELECT COUNT(*) n FROM price_points").first<{ n: number }>();
    expect(pts!.n).toBe(1);
    const src = await env.DB.prepare("SELECT last_success_at, next_check_at FROM sources WHERE id='bestbuy'").first();
    expect(src).toMatchObject({ last_success_at: T0, next_check_at: T0 + 300_000 });
    const q = await env.DB.prepare("SELECT used, manual_used FROM quota_usage WHERE source_id='bestbuy'").first();
    expect(q).toMatchObject({ used: 1, manual_used: 0 });
    // carga inicial: no hay avalancha de "nueva oferta"
    expect(await alertTypes()).toEqual(["new_best"]);
  });

  it("respeta el intervalo y no consulta antes de tiempo", async () => {
    const bb = fakeAdapter("bestbuy", [[obs(129900)]]);
    await runMonitor(env, { now: T0, trigger: "cron", adapters: { bestbuy: bb } });
    const s2 = await runMonitor(env, { now: T0 + 60_000, trigger: "cron", adapters: { bestbuy: bb } });
    expect(s2.sources[0]).toMatchObject({ status: "skipped", reason: "no toca" });
    // 5 min menos unos ms (jitter del cron) sí cuenta como "toca"
    const s3 = await runMonitor(env, { now: T0 + 299_000, trigger: "cron", adapters: { bestbuy: bb } });
    expect(s3.sources[0]!.status).toBe("ok");
  });

  it("detecta bajada respecto del último precio verificado y deduplica", async () => {
    const bb = fakeAdapter("bestbuy", [[obs(129900)], [obs(119900)], [obs(119900)], [obs(119900)]]);
    for (let i = 0; i < 4; i++) await runMonitor(env, { now: T0 + i * 300_000, trigger: "cron", adapters: { bestbuy: bb } });
    const types = await alertTypes();
    expect(types.filter((t) => t === "price_drop")).toHaveLength(1);
    const pts = await env.DB.prepare("SELECT COUNT(*) n FROM price_points").first<{ n: number }>();
    expect(pts!.n).toBe(2); // solo se registra historial cuando cambia
  });

  it("no acepta una caída anómala hasta confirmarla", async () => {
    const bb = fakeAdapter("bestbuy", [[obs(129900)], [obs(49900)], [obs(49900)]]);
    await runMonitor(env, { now: T0, trigger: "cron", adapters: { bestbuy: bb } });
    await runMonitor(env, { now: T0 + 300_000, trigger: "cron", adapters: { bestbuy: bb } });
    let o = await env.DB.prepare("SELECT price_cents, pending_price_cents FROM offers").first();
    expect(o).toMatchObject({ price_cents: 129900, pending_price_cents: 49900 });
    expect(await alertTypes()).toEqual(["new_best"]);
    await runMonitor(env, { now: T0 + 600_000, trigger: "cron", adapters: { bestbuy: bb } });
    o = await env.DB.prepare("SELECT price_cents, pending_price_cents FROM offers").first();
    expect(o).toMatchObject({ price_cents: 49900, pending_price_cents: null });
    expect(await alertTypes()).toEqual(expect.arrayContaining(["target_reached", "price_drop"]));
  });

  it("descarta variantes incorrectas y no alerta con parciales", async () => {
    const bb = fakeAdapter("bestbuy", [[
      obs(80000, { externalId: "olive", title: "Google - Pixel 11 Pro XL 256GB (Unlocked) - Olive", attrs: { color: "Olive", condition: "New" } }),
      obs(70000, { externalId: "nocolor", title: "Google - Pixel 11 Pro XL 256GB (Unlocked)", attrs: { condition: "New" } }),
    ]]);
    await runMonitor(env, { now: T0, trigger: "cron", adapters: { bestbuy: bb } });
    const { results } = await env.DB.prepare("SELECT external_id, match_status FROM offers").all();
    expect(results).toEqual([{ external_id: "nocolor", match_status: "partial" }]);
    expect(await alertTypes()).toEqual([]);
  });

  it("aplica backoff exponencial tras errores y registra el error por fuente", async () => {
    const bb = fakeAdapter("bestbuy", [new SourceError("HTTP 503", 503)]);
    const s = await runMonitor(env, { now: T0, trigger: "cron", adapters: { bestbuy: bb } });
    expect(s.sources[0]).toMatchObject({ status: "error" });
    const src = await env.DB.prepare("SELECT consecutive_failures, backoff_until, last_error FROM sources WHERE id='bestbuy'").first<{ consecutive_failures: number; backoff_until: number; last_error: string }>();
    expect(src!.consecutive_failures).toBe(1);
    expect(src!.backoff_until).toBeGreaterThan(T0 + 200_000);
    expect(src!.last_error).toBe("HTTP 503");
    const s2 = await runMonitor(env, { now: T0 + 60_000, trigger: "manual", force: true, adapters: { bestbuy: bb } });
    expect(s2.sources[0]).toMatchObject({ status: "skipped", reason: "circuito abierto (backoff)" });
    const chk = await env.DB.prepare("SELECT ok, error FROM checks").first();
    expect(chk).toMatchObject({ ok: 0, error: "HTTP 503" });
  });

  it("cuota: el automático nunca entra en la reserva y el manual solo usa la reserva", async () => {
    // 10 llamadas/día, reserva 20 % → 8 automáticas + 2 manuales
    await env.DB.prepare(`UPDATE sources SET quota = '{"windows":[{"kind":"day","limit":10,"tz":"UTC"}],"reservePct":20}' WHERE id='bestbuy'`).run();
    const bb = fakeAdapter("bestbuy", [[obs(129900)]]);
    const t = (i: number) => T0 + i * 300_000;
    for (let i = 0; i < 12; i++) await runMonitor(env, { now: t(i), trigger: "cron", force: true, adapters: { bestbuy: bb } });
    expect(bb.calls).toBe(8);
    const m1 = await runMonitor(env, { now: t(13), trigger: "manual", force: true, adapters: { bestbuy: bb } });
    const m2 = await runMonitor(env, { now: t(14), trigger: "manual", force: true, adapters: { bestbuy: bb } });
    const m3 = await runMonitor(env, { now: t(15), trigger: "manual", force: true, adapters: { bestbuy: bb } });
    expect([m1, m2, m3].map((m) => m.sources[0]!.status)).toEqual(["ok", "ok", "skipped"]);
    expect(m3.sources[0]!.reason).toMatch(/reserva/);
    const q = await env.DB.prepare("SELECT used, manual_used FROM quota_usage WHERE source_id='bestbuy'").first();
    expect(q).toMatchObject({ used: 10, manual_used: 2 });
    // al día siguiente (UTC) la cuota se renueva sola
    const next = await runMonitor(env, { now: T0 + 86400_000, trigger: "cron", force: true, adapters: { bestbuy: bb } });
    expect(next.sources[0]!.status).toBe("ok");
    await env.DB.prepare(`UPDATE sources SET quota = '{"windows":[{"kind":"day","limit":5000,"tz":"UTC"}],"reservePct":20}' WHERE id='bestbuy'`).run();
  });

  it("cuenta reintentos y llamadas fallidas en la cuota", async () => {
    const flaky: SourceAdapter = {
      id: "bestbuy",
      callsPerRun: 1,
      isConfigured: () => true,
      async fetchOffers(_p, ctx) {
        ctx.countCall();
        ctx.countCall();
        ctx.countCall(); // 3 intentos
        throw new SourceError("HTTP 503", 503);
      },
    };
    await runMonitor(env, { now: T0, trigger: "cron", adapters: { bestbuy: flaky } });
    const q = await env.DB.prepare("SELECT used FROM quota_usage WHERE source_id='bestbuy'").first();
    expect(q).toMatchObject({ used: 3 });
  });

  it("aislamiento: si una fuente falla o se agota, las demás siguen", async () => {
    await env.DB.prepare(`UPDATE sources SET quota = '{"windows":[{"kind":"day","limit":1,"tz":"UTC"}],"reservePct":0}' WHERE id='bestbuy'`).run();
    const bb = fakeAdapter("bestbuy", [[obs(129900)]]);
    const eb = fakeAdapter("ebay", [new SourceError("HTTP 500", 500), [obs(105000, { sourceId: "ebay", externalId: "e1", store: "eBay · x" })]]);
    const s1 = await runMonitor(env, { now: T0, trigger: "cron", adapters: { bestbuy: bb, ebay: eb } });
    expect(s1.sources.map((s) => s.status)).toEqual(["ok", "error"]);
    const s2 = await runMonitor(env, { now: T0 + 3600_000, trigger: "cron", adapters: { bestbuy: bb, ebay: eb } });
    expect(s2.sources.find((s) => s.source === "bestbuy")).toMatchObject({ status: "skipped" });
    expect(s2.sources.find((s) => s.source === "ebay")).toMatchObject({ status: "ok" });
    await env.DB.prepare(`UPDATE sources SET quota = '{"windows":[{"kind":"day","limit":5000,"tz":"UTC"}],"reservePct":20}' WHERE id='bestbuy'`).run();
  });

  it("exclusión mutua: dos ejecuciones simultáneas no se solapan", async () => {
    const slow: SourceAdapter & { calls: number } = {
      id: "bestbuy",
      callsPerRun: 1,
      calls: 0,
      isConfigured: () => true,
      async fetchOffers(_p, ctx) {
        ctx.countCall();
        slow.calls++;
        await new Promise((r) => setTimeout(r, 50));
        return { observations: [obs(129900)], calls: 1 };
      },
    };
    const [a, b] = await Promise.all([
      runMonitor(env, { now: T0, trigger: "cron", force: true, adapters: { bestbuy: slow } }),
      runMonitor(env, { now: T0, trigger: "cron", force: true, adapters: { bestbuy: slow } }),
    ]);
    expect([a.locked, b.locked].filter(Boolean)).toHaveLength(1);
    expect(slow.calls).toBe(1);
    // un bloqueo huérfano (ejecución que murió) caduca solo
    expect(await acquireLock(env.DB, "x", "dead", T0, 1000)).toBe(true);
    expect(await acquireLock(env.DB, "x", "other", T0 + 500)).toBe(false);
    expect(await acquireLock(env.DB, "x", "other", T0 + 2000)).toBe(true);
  });

  it("alerta de fallo prolongado (una vez al día) y de oportunidad parcial", async () => {
    const bad = fakeAdapter("bestbuy", [new SourceError("HTTP 500", 500)]);
    for (let i = 0; i < 5; i++) {
      await env.DB.prepare("UPDATE sources SET backoff_until = NULL WHERE id='bestbuy'").run();
      await runMonitor(env, { now: T0 + i * 60_000, trigger: "cron", force: true, adapters: { bestbuy: bad } });
    }
    const types = await alertTypes();
    expect(types.filter((t) => t === "source_failure")).toHaveLength(1);

    await env.DB.prepare("UPDATE sources SET backoff_until = NULL, consecutive_failures = 0 WHERE id='bestbuy'").run();
    const ok = fakeAdapter("bestbuy", [[obs(129900)], [obs(129900), obs(99900, { externalId: "p", title: "Google Pixel 11 Pro XL 256GB Unlocked", attrs: { condition: "New" } })]]);
    await runMonitor(env, { now: T0 + 86400_000, trigger: "cron", force: true, adapters: { bestbuy: ok } });
    await runMonitor(env, { now: T0 + 86400_000 + 300_000, trigger: "cron", force: true, adapters: { bestbuy: ok } });
    const opp = await env.DB.prepare("SELECT title, body FROM alerts WHERE type='opportunity'").first<{ title: string; body: string }>();
    expect(opp?.title).toBe("Oportunidad pendiente de verificación");
    expect(opp?.body).toContain("color");
  });

  it("marca como inactivas las ofertas que desaparecen", async () => {
    const eb = fakeAdapter("ebay", [[obs(105000, { sourceId: "ebay", externalId: "a", store: "eBay · x" })], []]);
    await runMonitor(env, { now: T0, trigger: "cron", adapters: { ebay: eb } });
    await runMonitor(env, { now: T0 + 300_000, trigger: "cron", adapters: { ebay: eb } });
    const o = await env.DB.prepare("SELECT active FROM offers").first();
    expect(o).toMatchObject({ active: 0 });
  });
});

// ------------------------------------------------------------------ API

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body) headers.set("content-type", "application/json");
  return SELF.fetch(`https://price.test${path}`, { ...init, headers });
}

async function login(): Promise<string> {
  const r = await api("/api/auth/claim", { method: "POST", body: JSON.stringify({ code: "test-setup-code-123456", label: "iPhone" }) });
  expect(r.status).toBe(200);
  return ((await r.json()) as { token: string }).token;
}

describe("API", () => {
  it("health es público y no expone secretos", async () => {
    const r = await api("/api/health");
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toMatch(/test-setup-code|apiKey|private/i);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("exige autenticación en endpoints privados", async () => {
    for (const p of ["/api/dashboard", "/api/sources", "/api/settings", "/api/push/vapid-public-key"]) {
      expect((await api(p)).status).toBe(401);
    }
    expect((await api("/api/dashboard", { token: "x".repeat(43) })).status).toBe(401);
  });

  it("rechaza códigos incorrectos y limita intentos", async () => {
    const bad = () => api("/api/auth/claim", { method: "POST", body: JSON.stringify({ code: "wrong-code-wrong" }) });
    for (let i = 0; i < 5; i++) expect((await bad()).status).toBe(401);
    expect((await bad()).status).toBe(429);
  });

  it("panel con producto semilla, MSRP provisional y fuentes sin credenciales", async () => {
    const token = await login();
    const r = await api("/api/dashboard", { token });
    expect(r.status).toBe(200);
    const d = (await r.json()) as any;
    expect(d.products[0].product).toMatchObject({ id: PID, msrpCents: 129900, msrpStatus: "provisional", targetCents: 79900 });
    expect(d.products[0].best).toBeNull(); // sin datos reales → nada inventado
    const bb = d.sources.find((s: any) => s.id === "bestbuy");
    expect(bb).toMatchObject({ configured: false, freshness: "not_configured" });
    expect(d.tax).toMatchObject({ ratePct: 6, status: "unverified" });
  });

  it("carga manual de oferta y financiación con procedencia", async () => {
    const token = await login();
    const r = await api("/api/offers/manual", {
      method: "POST",
      token,
      body: JSON.stringify({ productId: PID, store: "Google Store", url: "https://store.google.com/product/pixel_11_pro", priceCents: 89900, inStock: true, note: "Visto en la web" }),
    });
    expect(r.status).toBe(201);
    const f = await api("/api/financing/manual", {
      method: "POST",
      token,
      body: JSON.stringify({ productId: PID, store: "Google Store", provider: "Synchrony Bank", aprBps: 0, months: 24, cashPriceCents: 89900, url: "https://store.google.com/magazine/financing", originNote: "Página de financiación de Google Store", observedAt: new Date(Date.now() - 3600_000).toISOString() }),
    });
    expect(f.status).toBe(201);
    const fj = (await f.json()) as any;
    expect(fj.computed).toMatchObject({ monthlyCents: 3746, totalCents: 89904, derived: ["monthlyCents", "totalCents"] });
    // procedencia obligatoria
    const noOrigin = await api("/api/financing/manual", { method: "POST", token, body: JSON.stringify({ productId: PID, store: "X", monthlyCents: 100, url: "https://x.com", observedAt: T0 }) });
    expect(noOrigin.status).toBe(400);
    const d = (await (await api("/api/dashboard", { token })).json()) as any;
    expect(d.products[0].best).toBeNull(); // lo manual no se presenta como verificado
    expect(d.products[0].bestAny).toMatchObject({ store: "Google Store", verification: "manual", deliveredCents: 89900, taxCents: 5394 });
  });

  it("valida entradas", async () => {
    const token = await login();
    const bad = await api("/api/offers/manual", { method: "POST", token, body: JSON.stringify({ productId: PID, store: "X", url: "javascript:alert(1)", priceCents: 100 }) });
    expect(bad.status).toBe(400);
    const sub = await api("/api/push/subscribe", { method: "POST", token, body: JSON.stringify({ endpoint: "https://evil.example.com/x", keys: { p256dh: "a", auth: "b" } }) });
    expect(sub.status).toBe(400);
    const cross = await api("/api/settings", { method: "PATCH", token, headers: { origin: "https://evil.example.com" }, body: JSON.stringify({}) });
    expect(cross.status).toBe(403);
  });

  it("expone solo la clave pública VAPID y es estable", async () => {
    const token = await login();
    const a = (await (await api("/api/push/vapid-public-key", { token })).json()) as any;
    const b = (await (await api("/api/push/vapid-public-key", { token })).json()) as any;
    expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toContain('"d"');
  });

  it("panel de salud y sesiones", async () => {
    const token = await login();
    const other = await login();
    const sys = (await (await api("/api/system", { token })).json()) as any;
    expect(sys.cost.monthlyUsd).toBe(0);
    expect(sys.cloudflareUsage.available).toBe(false); // no se inventan métricas
    const serp = sys.sources.find((s: any) => s.id === "serpapi");
    expect(serp).toMatchObject({ enabled: false, quotaVerified: true });
    expect(serp.quotas[0]).toMatchObject({ kind: "cycle", limit: 250, reserve: 50 });
    const r = (await (await api("/api/sessions/revoke-others", { method: "POST", token })).json()) as any;
    expect(r.revoked).toBeGreaterThanOrEqual(1);
    expect((await api("/api/dashboard", { token: other })).status).toBe(401);
    expect((await api("/api/dashboard", { token })).status).toBe(200);
  });

  it("cabeceras de seguridad en la API", async () => {
    const r = await api("/api/health");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });

  it("consulta manual con límite de frecuencia", async () => {
    const token = await login();
    expect((await api("/api/check-now", { method: "POST", token })).status).toBe(200);
    expect((await api("/api/check-now", { method: "POST", token })).status).toBe(429);
  });
});
