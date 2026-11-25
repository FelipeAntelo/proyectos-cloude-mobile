import { fetchWithRetry, SourceError } from "../lib/http";
import { usdToCents } from "../lib/util";
import type { Observation, Product } from "../domain/types";
import type { AdapterContext, SourceAdapter } from "./types";

/**
 * Best Buy Products API (oficial). Docs: https://developer.bestbuy.com/documentation/products-api
 * La API key va como query param (así lo documenta Best Buy) y solo vive en el Worker.
 */

const SHOW = [
  "sku",
  "name",
  "salePrice",
  "regularPrice",
  "onSale",
  "onlineAvailability",
  "orderable",
  "color",
  "condition",
  "manufacturer",
  "modelNumber",
  "shippingCost",
  "freeShipping",
].join(",");

interface BBProduct {
  sku: number;
  name: string;
  salePrice?: number;
  regularPrice?: number;
  onlineAvailability?: boolean;
  orderable?: string;
  color?: string | null;
  condition?: string | null;
  manufacturer?: string | null;
  shippingCost?: number | string | null;
  freeShipping?: boolean;
}

export function bestBuySearchUrl(product: Product, apiKey: string): string {
  const terms = product.spec.modelLabel
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `search=${encodeURIComponent(t)}`)
    .join("&");
  const q = `(${terms}&manufacturer=google)`;
  return `https://api.bestbuy.com/v1/products${q}?format=json&pageSize=25&show=${SHOW}&apiKey=${encodeURIComponent(apiKey)}`;
}

export function parseBestBuy(json: unknown): Observation[] {
  const products = (json as { products?: BBProduct[] })?.products;
  if (!Array.isArray(products)) throw new SourceError("Respuesta de Best Buy con formato inesperado");
  return products.map((p): Observation => {
    const ship = p.freeShipping ? 0 : usdToCents(p.shippingCost ?? null);
    return {
      sourceId: "bestbuy",
      externalId: String(p.sku),
      store: "Best Buy",
      title: p.name,
      url: `https://www.bestbuy.com/site/${p.sku}.p?skuId=${p.sku}`,
      priceCents: usdToCents(p.salePrice ?? null),
      shippingCents: ship,
      inStock: typeof p.onlineAvailability === "boolean" ? p.onlineAvailability : null,
      verification: "verified",
      attrs: { color: p.color ?? null, condition: p.condition ?? null },
    };
  });
}

export const bestBuyAdapter: SourceAdapter = {
  id: "bestbuy",
  callsPerRun: 1,
  isConfigured: (env) => Boolean(env.BESTBUY_API_KEY),
  async fetchOffers(product: Product, ctx: AdapterContext) {
    const key = ctx.env.BESTBUY_API_KEY;
    if (!key) throw new SourceError("BESTBUY_API_KEY no configurada", null, null, true);
    let calls = 0;
    const res = await fetchWithRetry(
      bestBuySearchUrl(product, key),
      { headers: { accept: "application/json" } },
      { onAttempt: () => (calls++, ctx.countCall()) },
    );
    return { observations: parseBestBuy(await res.json()), calls, httpStatus: res.status };
  },
};
