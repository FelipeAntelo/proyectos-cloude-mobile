import { afterEach, describe, expect, it, vi } from "vitest";
import { bestBuySearchUrl, parseBestBuy } from "../src/worker/adapters/bestbuy";
import { ebaySearchUrl, parseEbay } from "../src/worker/adapters/ebay";
import { fetchWithRetry, parseRetryAfter, schedulerBackoffMs, SourceError } from "../src/worker/lib/http";
import { BESTBUY_FIXTURE, EBAY_FIXTURE, PIXEL } from "./fixtures";

describe("Best Buy adapter", () => {
  it("construye la consulta oficial sin filtrar la key fuera del query", () => {
    const url = bestBuySearchUrl(PIXEL, "KEY123");
    expect(url).toMatch(/^https:\/\/api\.bestbuy\.com\/v1\/products\(search=pixel&search=11&search=pro&search=xl&manufacturer=google\)\?/);
    expect(url).toContain("apiKey=KEY123");
  });
  it("normaliza la respuesta (fixture simulado)", () => {
    const obs = parseBestBuy(BESTBUY_FIXTURE);
    expect(obs).toHaveLength(3);
    expect(obs[0]).toMatchObject({
      sourceId: "bestbuy",
      externalId: "1000001",
      priceCents: 111111,
      shippingCents: 0,
      inStock: true,
      verification: "verified",
      url: "https://www.bestbuy.com/site/1000001.p?skuId=1000001",
    });
  });
  it("falla de forma explícita ante un formato inesperado", () => {
    expect(() => parseBestBuy({ error: "x" })).toThrow(SourceError);
  });
});

describe("eBay adapter", () => {
  it("filtra por nuevo, precio fijo, USD y EE. UU.", () => {
    const url = decodeURIComponent(ebaySearchUrl(PIXEL));
    expect(url).toContain("conditionIds:{1000}");
    expect(url).toContain("buyingOptions:{FIXED_PRICE}");
    expect(url).toContain("itemLocationCountry:US");
    expect(url).toContain("price:[300..2000]");
  });
  it("normaliza y marca vendedores poco fiables", () => {
    const obs = parseEbay(EBAY_FIXTURE);
    expect(obs[0]).toMatchObject({ priceCents: 105000, shippingCents: 0, trustIssue: null, attrs: { condition: "new" } });
    expect(obs[1]!.trustIssue).toMatch(/reputación/);
    expect(obs[2]!.shippingCents).toBeNull(); // envío calculado = desconocido, no 0
  });
  it("sin resultados devuelve lista vacía", () => {
    expect(parseEbay({ total: 0 })).toEqual([]);
  });
});

describe("fetchWithRetry", () => {
  afterEach(() => vi.restoreAllMocks());
  const noSleep = async () => {};

  it("reintenta errores transitorios con backoff y luego tiene éxito", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    let attempts = 0;
    const res = await fetchWithRetry("https://x.test", {}, { sleepFn: noSleep, onAttempt: () => attempts++ });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(attempts).toBe(3);
  });

  it("no reintenta 4xx y marca 401/403 como error de configuración", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 403 }));
    await expect(fetchWithRetry("https://x.test", {}, { sleepFn: noSleep })).rejects.toMatchObject({ status: 403, fatal: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("respeta Retry-After largo devolviendo el control al scheduler", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "600" } }));
    await expect(fetchWithRetry("https://x.test", {}, { sleepFn: noSleep })).rejects.toMatchObject({ status: 429, retryAfterMs: 600000 });
  });

  it("calcula backoff exponencial con tope", () => {
    expect(schedulerBackoffMs(1, 0.5)).toBe(300000);
    expect(schedulerBackoffMs(3, 0.5)).toBe(1200000);
    expect(schedulerBackoffMs(20, 0.5)).toBe(6 * 3600000);
    expect(parseRetryAfter("120")).toBe(120000);
    expect(parseRetryAfter(null)).toBeNull();
  });
});
