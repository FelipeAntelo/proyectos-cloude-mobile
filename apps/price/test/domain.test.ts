import { describe, expect, it } from "vitest";
import { applyCooldown, DEFAULT_PREFS, evaluateOffer, gatePrice, prioritize } from "../src/worker/domain/alerts";
import { amortizedMonthlyCents, computeFinancing, isBetterFinancing } from "../src/worker/domain/financing";
import { matchObservation, storageMentions } from "../src/worker/domain/matcher";
import { estimateTaxCents, totalWithTax } from "../src/worker/domain/tax";
import { formatUsd, usdToCents } from "../src/worker/lib/util";
import { PIXEL } from "./fixtures";

const m = (title: string, attrs = {}) => matchObservation(PIXEL.spec, { title, attrs });

describe("matcher", () => {
  it("acepta la variante exacta", () => {
    const r = m("Google Pixel 11 Pro XL 256GB Obsidian Factory Unlocked - Brand New Sealed", { condition: "new" });
    expect(r.status).toBe("match");
  });
  it("rechaza otro color", () => {
    expect(m("Google Pixel 11 Pro XL 256GB Unlocked - Olive", { condition: "new" }).status).toBe("mismatch");
    expect(m("Pixel 11 Pro XL 256GB Unlocked", { color: "Porcelain", condition: "New" }).status).toBe("mismatch");
  });
  it("rechaza otro almacenamiento pero ignora la RAM", () => {
    expect(m("Google Pixel 11 Pro XL 512GB Obsidian Unlocked", { condition: "new" }).status).toBe("mismatch");
    expect(m("Google Pixel 11 Pro XL 16GB RAM 256GB Obsidian Unlocked", { condition: "new" }).status).toBe("match");
    expect(storageMentions("16gb ram 256gb")).toEqual([256]);
  });
  it("rechaza Pixel 11 Pro (no XL) y accesorios", () => {
    expect(m("Google Pixel 11 Pro 256GB Obsidian Unlocked", { condition: "new" }).status).toBe("mismatch");
    expect(m("Case for Google Pixel 11 Pro XL Obsidian", { condition: "new" }).status).toBe("mismatch");
    expect(m("Tempered glass screen protector Pixel 11 Pro XL 256GB", { condition: "new" }).status).toBe("mismatch");
  });
  it("rechaza variantes de operador, usados y con trade-in", () => {
    expect(m("Google Pixel 11 Pro XL 256GB (Verizon) - Obsidian", { condition: "new" }).status).toBe("mismatch");
    expect(m("Google Pixel 11 Pro XL 256GB Obsidian Unlocked Renewed", { condition: "new" }).status).toBe("mismatch");
    expect(m("Google Pixel 11 Pro XL 256GB Obsidian Unlocked with trade-in", { condition: "new" }).status).toBe("mismatch");
    expect(m("Google Pixel 11 Pro XL 256GB Obsidian Unlocked", { condition: "Open Box" }).status).toBe("mismatch");
  });
  it("Unlocked que menciona compatibilidad con operadores sigue siendo válido", () => {
    expect(m("Google Pixel 11 Pro XL 256GB Obsidian Unlocked - Works with Verizon, AT&T, T-Mobile", { condition: "new" }).status).toBe("match");
  });
  it("si falta información, queda como parcial (nunca match)", () => {
    expect(m("Google Pixel 11 Pro XL 256GB Unlocked", { condition: "new" }).status).toBe("partial");
    expect(m("Google Pixel 11 Pro XL Obsidian 256GB").status).toBe("partial");
  });
});

describe("gatePrice (protección contra alertas falsas)", () => {
  const g = (prev: number | null, next: number, pending: number | null = null, count = 0) =>
    gatePrice(PIXEL, { prevPriceCents: prev, pendingPriceCents: pending, pendingCount: count, newPriceCents: next });
  it("acepta variaciones normales", () => {
    // 1.299 → 899 (−31 %, la oferta de Black Friday 2026) no debe retrasarse
    expect(g(129900, 89900).kind).toBe("accept");
    expect(g(129900, 75000).kind).toBe("pending");
  });
  it("descarta precios fuera de rango", () => {
    expect(g(null, 1999).kind).toBe("reject");
  });
  it("exige confirmación para caídas anómalas", () => {
    const first = g(129900, 50000);
    expect(first.kind).toBe("pending");
    const second = g(129900, 50000, 50000, 1);
    expect(second.kind).toBe("accept");
    const different = g(129900, 45000, 50000, 1);
    expect(different).toMatchObject({ kind: "pending", pendingCount: 1 });
  });
});

describe("evaluateOffer", () => {
  const base = {
    product: PIXEL,
    offer: { id: "o1", store: "Best Buy", url: "https://x", verification: "verified" as const, matchStatus: "match" as const },
    isNew: false,
    bestOtherCents: null,
    bootstrap: false,
    prefs: DEFAULT_PREFS,
    now: Date.UTC(2026, 10, 25),
  };
  it("detecta bajada de precio respecto del último verificado (no solo el objetivo)", () => {
    const a = evaluateOffer({ ...base, prev: { priceCents: 129900, inStock: true }, next: { priceCents: 119900, inStock: true }, bestOtherCents: 110000 });
    expect(a.map((x) => x.type)).toEqual(["price_drop"]);
  });
  it("ignora bajadas por debajo del umbral mínimo", () => {
    const a = evaluateOffer({ ...base, prev: { priceCents: 129900, inStock: true }, next: { priceCents: 129700, inStock: true }, bestOtherCents: 100000 });
    expect(a).toEqual([]);
  });
  it("precio objetivo solo al cruzar el umbral", () => {
    const cross = evaluateOffer({ ...base, prev: { priceCents: 89900, inStock: true }, next: { priceCents: 79900, inStock: true } });
    expect(cross.map((x) => x.type)).toContain("target_reached");
    const stay = evaluateOffer({ ...base, prev: { priceCents: 79900, inStock: true }, next: { priceCents: 78900, inStock: true }, bestOtherCents: 70000 });
    expect(stay.map((x) => x.type)).not.toContain("target_reached");
  });
  it("vuelta a stock", () => {
    const a = evaluateOffer({ ...base, prev: { priceCents: 89900, inStock: false }, next: { priceCents: 89900, inStock: true }, bestOtherCents: 80000 });
    expect(a.map((x) => x.type)).toEqual(["back_in_stock"]);
  });
  it("nueva oferta relevante, pero no en la carga inicial", () => {
    const a = evaluateOffer({ ...base, isNew: true, prev: null, next: { priceCents: 119900, inStock: true }, bestOtherCents: 100000 });
    expect(a.map((x) => x.type)).toEqual(["new_offer"]);
    const boot = evaluateOffer({ ...base, isNew: true, bootstrap: true, prev: null, next: { priceCents: 119900, inStock: true }, bestOtherCents: 100000 });
    expect(boot).toEqual([]);
  });
  it("nunca alerta con variantes parciales o datos simulados", () => {
    expect(evaluateOffer({ ...base, offer: { ...base.offer, matchStatus: "partial" }, prev: { priceCents: 129900, inStock: true }, next: { priceCents: 70000, inStock: true } })).toEqual([]);
    expect(evaluateOffer({ ...base, offer: { ...base.offer, verification: "simulated" }, prev: { priceCents: 129900, inStock: true }, next: { priceCents: 70000, inStock: true } })).toEqual([]);
  });
  it("etiqueta las ofertas descubiertas como no verificadas", () => {
    const a = evaluateOffer({ ...base, offer: { ...base.offer, verification: "discovered" }, prev: { priceCents: 129900, inStock: true }, next: { priceCents: 119900, inStock: true }, bestOtherCents: 100000 });
    expect(a[0]!.title).toContain("sin verificar");
  });
  it("prioriza objetivo > mejor precio > bajada", () => {
    const a = evaluateOffer({ ...base, prev: { priceCents: 89900, inStock: true }, next: { priceCents: 79000, inStock: true } });
    expect(prioritize(a).map((x) => x.type)).toEqual(["target_reached", "new_best", "price_drop"]);
  });
});

describe("applyCooldown", () => {
  const now = 1_000_000_000;
  const cand = { type: "price_drop" as const, productId: "p", offerId: "o1", dedupeKey: "k", title: "", body: "", url: null, prevCents: null, verification: "verified" as const };
  it("bloquea repetición dentro de la ventana salvo mejora real", () => {
    const recent = [{ type: "price_drop", offerId: "o1", priceCents: 100000, createdAt: now - 60_000 }];
    expect(applyCooldown([{ ...cand, priceCents: 100000 }], recent, 3600_000, now)).toHaveLength(0);
    expect(applyCooldown([{ ...cand, priceCents: 99000 }], recent, 3600_000, now)).toHaveLength(1);
    expect(applyCooldown([{ ...cand, priceCents: 100000 }], recent, 30_000, now)).toHaveLength(1);
  });
});

describe("financiación", () => {
  it("cuota amortizada y 0 % APR", () => {
    expect(amortizedMonthlyCents(120000, 0, 24)).toBe(5000);
    // 1.000 USD al 12 % APR en 12 meses ≈ 88,85 USD/mes
    expect(amortizedMonthlyCents(100000, 1200, 12)).toBe(8885);
  });
  it("marca lo derivado y calcula intereses", () => {
    const c = computeFinancing({ cashPriceCents: 100000, aprBps: 1200, months: 12, monthlyCents: null, downCents: 0, totalCents: null });
    expect(c.derived).toEqual(["monthlyCents", "totalCents"]);
    expect(c.totalCents).toBe(106620);
    expect(c.interestCents).toBe(6620);
  });
  it("no inventa: sin datos suficientes queda null", () => {
    const c = computeFinancing({ cashPriceCents: null, aprBps: null, months: 24, monthlyCents: null, downCents: null, totalCents: null });
    expect(c.monthlyCents).toBeNull();
    expect(c.totalCents).toBeNull();
  });
  it("compara condiciones", () => {
    const a = computeFinancing({ cashPriceCents: 89900, aprBps: 0, months: 12, monthlyCents: null, downCents: 0, totalCents: null });
    const b = computeFinancing({ cashPriceCents: 89900, aprBps: 0, months: 24, monthlyCents: null, downCents: 0, totalCents: null });
    const c = computeFinancing({ cashPriceCents: 89900, aprBps: 1500, months: 24, monthlyCents: null, downCents: 0, totalCents: null });
    expect(isBetterFinancing(a, b)).toBe(true); // mismo total y 0 % APR: más plazo es mejor
    expect(isBetterFinancing(b, a)).toBe(false);
    expect(isBetterFinancing(c, a)).toBe(true);
    expect(isBetterFinancing(null, a)).toBe(true);
  });
});

describe("impuestos y dinero", () => {
  it("estima impuesto de Manassas (tasa configurable)", () => {
    expect(estimateTaxCents(89900, 6)).toBe(5394);
    expect(totalWithTax(89900, 0, 6)).toEqual({ taxCents: 5394, totalCents: 95294 });
    expect(estimateTaxCents(99999, 5.3)).toBe(5300);
  });
  it("convierte importes sin errores de coma flotante", () => {
    expect(usdToCents("1,299.99")).toBe(129999);
    expect(usdToCents("$899")).toBe(89900);
    expect(usdToCents("899.9")).toBe(89990);
    expect(usdToCents(1111.11)).toBe(111111);
    expect(usdToCents("abc")).toBeNull();
    expect(usdToCents(-1)).toBeNull();
    expect(formatUsd(129900)).toBe("$1,299.00");
  });
});
