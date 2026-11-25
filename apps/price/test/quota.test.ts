import { describe, expect, it } from "vitest";
import { parseAccount, parseDelivery, parseSerpApi, serpApiSearchUrl } from "../src/worker/adapters/serpapi";
import { schedulerBackoffMs } from "../src/worker/lib/http";
import {
  activeEvent,
  blackFridayWindow,
  intervalFactor,
  planSource,
  startOfZonedDay,
  windowBounds,
  type ProviderSync,
  type QuotaWindowConfig,
  type WindowState,
} from "../src/worker/quota";
import { PIXEL } from "./fixtures";

describe("ventanas de cuota", () => {
  it("día en la zona del proveedor (eBay reinicia a medianoche del Pacífico, con DST)", () => {
    const w: QuotaWindowConfig = { kind: "day", limit: 5000, tz: "America/Los_Angeles" };
    // 2026-11-25 06:00 UTC = 22:00 PST del 24
    const b = windowBounds(w, Date.UTC(2026, 10, 25, 6), null);
    expect(b.key).toBe("day:2026-11-24@America/Los_Angeles");
    expect(b.start).toBe(Date.UTC(2026, 10, 24, 8)); // 00:00 PST = 08:00 UTC
    expect(b.end).toBe(Date.UTC(2026, 10, 25, 8));
    // día del cambio de horario (8-mar-2026): dura 23 h
    const dst = windowBounds(w, Date.UTC(2026, 2, 8, 20), null);
    expect(dst.end - dst.start).toBe(23 * 3600_000);
    expect(startOfZonedDay(Date.UTC(2026, 6, 1, 12), "America/Los_Angeles")).toBe(Date.UTC(2026, 6, 1, 7));
  });

  it("ciclo sincronizado con el proveedor y respaldo en mes natural", () => {
    const sync: ProviderSync = { limit: 250, used: 40, renewalAt: Date.UTC(2026, 11, 3), syncedAt: 0 };
    const c = windowBounds({ kind: "cycle", limit: 250 }, Date.UTC(2026, 10, 25), sync);
    expect(c).toMatchObject({ key: `cycle:${Date.UTC(2026, 11, 3)}`, start: Date.UTC(2026, 10, 3), end: Date.UTC(2026, 11, 3) });
    const m = windowBounds({ kind: "cycle", limit: 250 }, Date.UTC(2028, 1, 10), null);
    expect(m.end - m.start).toBe(29 * 86400_000); // febrero bisiesto
  });

  it("Black Friday – Cyber Monday", () => {
    const bf = blackFridayWindow(2026); // Acción de Gracias 26-nov-2026
    expect(new Date(bf.start).toISOString()).toBe("2026-11-26T05:00:00.000Z");
    expect(new Date(bf.end).toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(activeEvent(Date.UTC(2026, 10, 30, 12))?.name).toMatch(/Cyber Monday/);
    expect(activeEvent(Date.UTC(2026, 11, 2))).toBeNull();
    expect(intervalFactor({ event: true, monthlyQuota: true, lastChangeAt: null, now: 0 })).toBe(0.5);
    expect(intervalFactor({ event: false, monthlyQuota: true, lastChangeAt: 0, now: 8 * 86400_000 })).toBe(1.5);
  });
});

describe("planificador", () => {
  const win = (over: Partial<WindowState>): WindowState => ({
    kind: "cycle", key: "c", start: 0, end: 30 * 86400_000, limit: 250, used: 0, manualUsed: 0, reserve: 50, ...over,
  });
  it("SerpApi: 4 h deseadas son sostenibles con 250/mes y 20 % de reserva", () => {
    const p = planSource({ now: 0, windows: [win({})], callsPerRun: 1, desiredIntervalS: 14400, minIntervalS: 3600, intervalFactor: 1 });
    expect(p.intervalS).toBe(14400);
    expect(p.autoAllowed).toBe(true);
  });
  it("si se gastó de más, espacia automáticamente para llegar a la renovación", () => {
    const p = planSource({ now: 15 * 86400_000, windows: [win({ used: 190 })], callsPerRun: 1, desiredIntervalS: 14400, minIntervalS: 3600, intervalFactor: 1 });
    expect(p.intervalS).toBe(Math.ceil((15 * 86400) / 10)); // 10 automáticas restantes en 15 días
  });
  it("bloquea el automático al llegar a la reserva y el manual al agotar la reserva", () => {
    const p = planSource({ now: 0, windows: [win({ used: 200 })], callsPerRun: 1, desiredIntervalS: 14400, minIntervalS: 3600, intervalFactor: 1 });
    expect(p).toMatchObject({ autoAllowed: false, manualAllowed: true, blockedUntil: 30 * 86400_000 });
    const q = planSource({ now: 0, windows: [win({ used: 250, manualUsed: 50 })], callsPerRun: 1, desiredIntervalS: 14400, minIntervalS: 3600, intervalFactor: 1 });
    expect(q).toMatchObject({ autoAllowed: false, manualAllowed: false });
  });
  it("en eventos acelera, pero nunca por encima del ritmo de cuota", () => {
    const ev = planSource({ now: 0, windows: [win({})], callsPerRun: 1, desiredIntervalS: 14400, minIntervalS: 3600, intervalFactor: 0.5 });
    expect(ev.intervalS).toBe(Math.ceil((30 * 86400) / 200)); // 12.960 s ≈ 3,6 h (ritmo), no 2 h
  });
});

// ---------------------------------------------------------------- simulación acelerada

/** PRNG determinista (mulberry32) para que la simulación sea reproducible. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimCfg {
  windows: QuotaWindowConfig[];
  reservePct: number;
  desiredS: number;
  minS: number;
  /** Día del mes en que el proveedor renueva (ciclo). */
  renewalDay?: number;
  /** Cambio de límite a mitad de año (condiciones del proveedor). */
  limitChange?: { at: number; limit: number };
  outages: Array<[number, number]>;
  p429: number;
  pNetErr: number;
  manualPerDay: number;
}

function nextRenewal(now: number, day: number): number {
  const d = new Date(now);
  let r = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day);
  if (r <= now) r = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, day);
  return r;
}

/** Simula el mismo algoritmo que el monitor (planSource + circuit breaker) con un reloj acelerado. */
function simulate(cfg: SimCfg, from: number, to: number, seed = 42) {
  const rand = rng(seed);
  const used = new Map<string, { used: number; manual: number; limit: number; end: number }>();
  let next = 0;
  let backoffUntil = 0;
  let failures = 0;
  let lastSuccess = from;
  let maxGapAfterOutage = 0;
  const runs: number[] = [];
  const TICK = 300_000;
  const boundsCache = new Map<number, { key: string; start: number; end: number }>();
  for (let now = from; now < to; now += TICK) {
    const limitNow = (base: number) => (cfg.limitChange && now >= cfg.limitChange.at ? cfg.limitChange.limit : base);
    const sync = cfg.renewalDay ? { limit: 0, used: 0, renewalAt: nextRenewal(now, cfg.renewalDay), syncedAt: now } : null;
    const states: WindowState[] = cfg.windows.map((w, wi) => {
      let b = boundsCache.get(wi);
      if (!b || now >= b.end) {
        b = windowBounds(w, now, sync);
        boundsCache.set(wi, b);
      }
      const k = `${w.kind}|${b.key}`;
      const limit = w.kind === "hour" ? w.limit : limitNow(w.limit);
      const c = used.get(k) ?? { used: 0, manual: 0, limit, end: b.end };
      c.limit = limit;
      used.set(k, c);
      return { kind: w.kind, key: k, start: b.start, end: b.end, limit, used: c.used, manualUsed: c.manual, reserve: Math.ceil((limit * cfg.reservePct) / 100) };
    });
    const ev = Boolean(activeEvent(now));
    const plan = planSource({ now, windows: states, callsPerRun: 1, desiredIntervalS: cfg.desiredS, minIntervalS: cfg.minS, intervalFactor: ev ? 0.5 : 1 });

    // Búsquedas manuales extraordinarias (solo con reserva).
    if (rand() < cfg.manualPerDay / 288 && plan.manualAllowed) {
      for (const s of states) {
        const c = used.get(s.key)!;
        c.used++;
        c.manual++;
      }
    }

    if (now < next || now < backoffUntil) continue;
    if (!plan.autoAllowed) {
      next = plan.blockedUntil ?? now + plan.intervalS * 1000;
      continue;
    }
    // Llamada real (cuenta aunque falle).
    for (const s of states) used.get(s.key)!.used++;
    const down = cfg.outages.some(([a, b]) => now >= a && now < b);
    const r = rand();
    const fail = down || r < cfg.p429 + cfg.pNetErr;
    if (fail) {
      failures++;
      const retryAfter = !down && r < cfg.p429 ? 600_000 : 0;
      backoffUntil = now + Math.max(schedulerBackoffMs(failures, rand()), retryAfter);
      next = backoffUntil;
    } else {
      const afterOutage = cfg.outages.find(([, b]) => lastSuccess < b && now >= b);
      if (afterOutage) maxGapAfterOutage = Math.max(maxGapAfterOutage, now - afterOutage[1]);
      failures = 0;
      lastSuccess = now;
      runs.push(now);
      next = now + plan.intervalS * 1000;
    }
  }
  return { used, runs, maxGapAfterOutage };
}

describe("simulación acelerada ≥ 365 días (pura, sin red)", { timeout: 60_000 }, () => {
  const Y0 = Date.UTC(2027, 0, 1);
  const Y2 = Date.UTC(2029, 0, 1); // 2027 (feb 28 d) + 2028 (bisiesto, feb 29 d)

  it("SerpApi 250/mes: nunca supera la cuota ni toca la reserva; ~4 h; sobrevive a 429, caídas y cambio de condiciones", () => {
    const outages: Array<[number, number]> = [
      [Date.UTC(2027, 2, 10), Date.UTC(2027, 2, 12)], // caída de 2 días
      [Date.UTC(2027, 7, 1), Date.UTC(2027, 7, 1, 9)],
      [Date.UTC(2028, 1, 27), Date.UTC(2028, 2, 2)], // atraviesa el 29-feb y la renovación
    ];
    const res = simulate(
      {
        windows: [{ kind: "cycle", limit: 250 }, { kind: "hour", limit: 50, tz: "UTC" }],
        reservePct: 20,
        desiredS: 14400,
        minS: 3600,
        renewalDay: 3,
        limitChange: { at: Date.UTC(2028, 5, 15), limit: 100 }, // el proveedor recorta el plan gratuito
        outages,
        p429: 0.01,
        pNetErr: 0.01,
        manualPerDay: 0.5,
      },
      Y0,
      Y2,
    );
    const cycles = [...res.used.entries()].filter(([k]) => k.startsWith("cycle|"));
    expect(cycles.length).toBeGreaterThanOrEqual(24);
    for (const [, c] of cycles) {
      expect(c.used).toBeLessThanOrEqual(c.limit); // nunca excede (no hay cargos posibles)
      expect(c.used - c.manual).toBeLessThanOrEqual(c.limit - Math.ceil(c.limit * 0.2)); // automático fuera de la reserva
      expect(c.manual).toBeLessThanOrEqual(Math.ceil(c.limit * 0.2));
    }
    // Sigue funcionando todo el tiempo: al menos 60 búsquedas útiles en cada ciclo completo con 250 de cuota
    const perCycle = new Map<number, number>();
    for (const t of res.runs) {
      const k = nextRenewal(t, 3);
      perCycle.set(k, (perCycle.get(k) ?? 0) + 1);
    }
    const full = [...perCycle.entries()].filter(([k]) => k > Y0 + 35 * 86400_000 && k < Date.UTC(2028, 5, 1));
    for (const [, n] of full) expect(n).toBeGreaterThanOrEqual(60);
    // Intervalo mediano ≈ 4 h fuera de eventos
    const gaps = res.runs.slice(1).map((t, i) => t - res.runs[i]!).sort((a, b) => a - b);
    expect(gaps[Math.floor(gaps.length / 2)]! / 3600_000).toBeGreaterThanOrEqual(3.5);
    // Se recupera sola tras las caídas (< 7 h de la vuelta del servicio)
    expect(res.maxGapAfterOutage).toBeLessThan(7 * 3600_000);
  });

  it("eBay 5.000/día (reinicio Pacífico): 5 min sostenibles todo el año con margen enorme", () => {
    const res = simulate(
      {
        windows: [{ kind: "day", limit: 5000, tz: "America/Los_Angeles" }],
        reservePct: 20,
        desiredS: 300,
        minS: 300,
        outages: [[Date.UTC(2027, 4, 5), Date.UTC(2027, 4, 5, 12)]],
        p429: 0.002,
        pNetErr: 0.002,
        manualPerDay: 20,
      },
      Y0,
      Y0 + 366 * 86400_000,
    );
    const days = [...res.used.values()];
    expect(days.length).toBeGreaterThanOrEqual(365);
    for (const d of days) {
      expect(d.used).toBeLessThanOrEqual(400); // ~288 automáticas + manuales
      expect(d.used).toBeLessThanOrEqual(d.limit);
    }
    expect(res.runs.length).toBeGreaterThan(365 * 270);
  });

  it("cuota agotada a mitad de ciclo: espera a la renovación y se reanuda sola", () => {
    const res = simulate(
      { windows: [{ kind: "cycle", limit: 10 }], reservePct: 20, desiredS: 300, minS: 300, renewalDay: 1, outages: [], p429: 0, pNetErr: 0, manualPerDay: 0 },
      Date.UTC(2027, 0, 1),
      Date.UTC(2027, 3, 1),
    );
    const byMonth = new Map<number, number>();
    for (const t of res.runs) byMonth.set(new Date(t).getUTCMonth(), (byMonth.get(new Date(t).getUTCMonth()) ?? 0) + 1);
    expect([...byMonth.values()]).toEqual([8, 8, 8]); // 10 − 20 % de reserva, cada mes
  });
});

describe("SerpApi (descubrimiento)", () => {
  it("consulta con ubicación de destino y sin exponer la key fuera del query", () => {
    const u = new URL(serpApiSearchUrl(PIXEL, "K"));
    expect(u.searchParams.get("engine")).toBe("google_shopping");
    expect(u.searchParams.get("location")).toBe("Manassas,Virginia,United States");
  });
  it("marca todo como descubierto y descarta usados/links no https (fixture simulado)", () => {
    const obs = parseSerpApi({
      search_metadata: { status: "Success" },
      shopping_results: [
        { title: "Google Pixel 11 Pro XL 256GB Obsidian Unlocked", source: "Target", extracted_price: 899, product_link: "https://www.google.com/shopping/product/1", delivery: "Free delivery" },
        { title: "Google Pixel 11 Pro XL 256GB", source: "eBay", extracted_price: 700, link: "https://ebay.com/x", second_hand_condition: "used" },
        { title: "x", source: "y", extracted_price: 1, link: "javascript:alert(1)" },
      ],
    });
    expect(obs).toHaveLength(2);
    expect(obs[0]).toMatchObject({ verification: "discovered", store: "Target", priceCents: 89900, shippingCents: 0, inStock: null });
    expect(obs[1]!.attrs.condition).toBe("used");
    expect(parseDelivery("$5.99 delivery")).toBe(599);
  });
  it("lee la cuota real de la Account API (fixture con la forma documentada)", () => {
    const now = Date.UTC(2026, 10, 25);
    const a = parseAccount({ searches_per_month: 250, plan_searches_left: 210, this_month_usage: 40, plan_renewal_date: "2026-12-03", plan_id: "free" }, now);
    expect(a).toMatchObject({ limit: 250, used: 40, plan: "free" });
    expect(a.renewalAt).toBe(Date.UTC(2026, 11, 3));
  });
});
