import { fetchWithRetry, SourceError } from "../lib/http";
import { usdToCents } from "../lib/util";
import type { Observation, Product } from "../domain/types";
import type { AdapterContext, SourceAdapter } from "./types";

/**
 * eBay Browse API (oficial), token de aplicación OAuth (client credentials).
 * Docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
 * Cuota documentada: 5.000 llamadas/día (Browse) y 1.000 tokens/día → el token
 * (válido ~2 h) se cachea en D1.
 */

const TOKEN_KEY = "ebay_app_token";
const SCOPE = "https://api.ebay.com/oauth/api_scope";
/** Umbrales de confianza del vendedor (protección contra falsos positivos). */
const MIN_FEEDBACK_PCT = 98;
const MIN_FEEDBACK_SCORE = 100;

interface EbayItem {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  condition?: string;
  conditionId?: string;
  itemWebUrl: string;
  seller?: { username?: string; feedbackPercentage?: string; feedbackScore?: number };
  shippingOptions?: Array<{ shippingCostType?: string; shippingCost?: { value: string; currency: string } }>;
  buyingOptions?: string[];
  itemLocation?: { country?: string };
}

async function getToken(ctx: AdapterContext): Promise<string> {
  const cached = await ctx.db
    .prepare("SELECT value, expires_at FROM kv_internal WHERE key = ?")
    .bind(TOKEN_KEY)
    .first<{ value: string; expires_at: number | null }>();
  if (cached && (cached.expires_at ?? 0) > ctx.now + 60_000) return cached.value;

  const { EBAY_CLIENT_ID: id, EBAY_CLIENT_SECRET: secret } = ctx.env;
  if (!id || !secret) throw new SourceError("Credenciales de eBay no configuradas", null, null, true);
  const res = await fetchWithRetry(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
    },
    { onAttempt: ctx.countCall },
  );
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new SourceError("eBay no devolvió token", res.status, null, true);
  const exp = ctx.now + (json.expires_in ?? 7200) * 1000;
  await ctx.db
    .prepare("INSERT OR REPLACE INTO kv_internal (key, value, expires_at) VALUES (?, ?, ?)")
    .bind(TOKEN_KEY, json.access_token, exp)
    .run();
  return json.access_token;
}

export function ebaySearchUrl(product: Product): string {
  const s = product.spec;
  const filter = [
    "conditionIds:{1000}", // New: nuevo, sin usar, sin abrir, en su embalaje original (definición de eBay)
    "buyingOptions:{FIXED_PRICE}",
    `price:[${Math.floor(s.priceFloorCents / 100)}..${Math.ceil(s.priceCeilCents / 100)}]`,
    "priceCurrency:USD",
    "itemLocationCountry:US",
  ].join(",");
  const q = encodeURIComponent(s.searchQuery);
  return `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&filter=${encodeURIComponent(filter)}&sort=price&limit=50`;
}

export function parseEbay(json: unknown): Observation[] {
  const items = (json as { itemSummaries?: EbayItem[]; total?: number })?.itemSummaries;
  if (items === undefined) {
    if (json && typeof json === "object" && "total" in json) return []; // sin resultados
    throw new SourceError("Respuesta de eBay con formato inesperado");
  }
  return items.map((it): Observation => {
    const ship = it.shippingOptions?.[0];
    const shipCents =
      ship?.shippingCostType === "CALCULATED" ? null : usdToCents(ship?.shippingCost?.value ?? null);
    const pct = Number(it.seller?.feedbackPercentage ?? "0");
    const score = it.seller?.feedbackScore ?? 0;
    const trustIssue =
      pct < MIN_FEEDBACK_PCT || score < MIN_FEEDBACK_SCORE
        ? `Vendedor con reputación insuficiente (${pct}% · ${score})`
        : null;
    return {
      sourceId: "ebay",
      externalId: it.itemId,
      store: `eBay · ${it.seller?.username ?? "vendedor"}`,
      title: it.title,
      url: it.itemWebUrl,
      priceCents: it.price?.currency === "USD" ? usdToCents(it.price.value) : null,
      shippingCents: shipCents,
      inStock: true, // un listado activo de precio fijo está disponible
      verification: "verified",
      attrs: { condition: it.conditionId === "1000" ? "new" : (it.condition ?? null) },
      trustIssue,
    };
  });
}

export const ebayAdapter: SourceAdapter = {
  id: "ebay",
  callsPerRun: 1,
  isConfigured: (env) => Boolean(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET),
  async fetchOffers(product: Product, ctx: AdapterContext) {
    let calls = 0;
    const count = () => (calls++, ctx.countCall());
    const token = await getToken({ ...ctx, countCall: count });
    const res = await fetchWithRetry(
      ebaySearchUrl(product),
      {
        headers: {
          authorization: `Bearer ${token}`,
          "x-ebay-c-marketplace-id": "EBAY_US",
          "x-ebay-c-enduserctx": "contextualLocation=country%3DUS%2Czip%3D20110",
          accept: "application/json",
        },
      },
      { onAttempt: count },
    );
    return { observations: parseEbay(await res.json()), calls, httpStatus: res.status };
  },
};
