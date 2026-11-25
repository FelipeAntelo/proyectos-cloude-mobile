import { fetchWithRetry, SourceError } from "../lib/http";
import { usdToCents } from "../lib/util";
import type { Observation, Product } from "../domain/types";
import type { AdapterContext, QuotaSyncResult, SourceAdapter } from "./types";

/**
 * Descubrimiento indirecto vía SerpApi (resultados de Google Shopping).
 *
 * - Todo lo que entra se marca `verification = "discovered"`: nunca es una
 *   confirmación comercial. Sirve para detectar tiendas sin API propia.
 * - Advertencia legal: Google no autoriza este acceso (litigio Google v.
 *   SerpApi, 2025-2026). Integración experimental, desactivada por defecto.
 * - Cuota: la Account API es gratuita y no consume búsquedas; se usa como
 *   fuente de verdad del consumo y la fecha de renovación.
 *   https://serpapi.com/account-api · https://serpapi.com/google-shopping-api
 */

interface ShoppingResult {
  title?: string;
  product_id?: string;
  product_link?: string;
  link?: string;
  source?: string;
  extracted_price?: number;
  price?: string;
  second_hand_condition?: string;
  delivery?: string;
}

function httpsOrNull(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** "Free delivery" → 0; "$5.99 delivery" → 599; otro → desconocido. */
export function parseDelivery(s: string | undefined): number | null {
  if (!s) return null;
  if (/free/i.test(s)) return 0;
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(s);
  return m ? usdToCents(m[1]!) : null;
}

export function serpApiSearchUrl(product: Product, apiKey: string): string {
  const p = new URLSearchParams({
    engine: "google_shopping",
    q: product.spec.searchQuery,
    location: "Manassas,Virginia,United States",
    google_domain: "google.com",
    gl: "us",
    hl: "en",
    api_key: apiKey,
  });
  return `https://serpapi.com/search.json?${p}`;
}

export function parseSerpApi(json: unknown): Observation[] {
  const j = json as { shopping_results?: ShoppingResult[]; error?: string; search_metadata?: unknown };
  if (j?.error) {
    if (/hasn't returned any results/i.test(j.error)) return [];
    throw new SourceError(`SerpApi: ${j.error.slice(0, 120)}`);
  }
  if (!j || (!Array.isArray(j.shopping_results) && !j.search_metadata)) {
    throw new SourceError("Respuesta de SerpApi con formato inesperado");
  }
  const out: Observation[] = [];
  for (const r of j.shopping_results ?? []) {
    const url = httpsOrNull(r.link) ?? httpsOrNull(r.product_link);
    if (!r.title || !url || !r.source) continue;
    const price =
      typeof r.extracted_price === "number" ? usdToCents(r.extracted_price) : usdToCents(r.price ?? null);
    out.push({
      sourceId: "serpapi",
      externalId: `${r.product_id ?? r.title}|${r.source}`.slice(0, 200),
      store: r.source.slice(0, 60),
      title: r.title,
      url,
      priceCents: price,
      shippingCents: parseDelivery(r.delivery),
      inStock: null, // Google Shopping no confirma stock en la tienda
      verification: "discovered",
      attrs: { condition: r.second_hand_condition ? r.second_hand_condition : null },
    });
  }
  return out;
}

export function parseAccount(json: unknown, now: number): QuotaSyncResult {
  const a = json as {
    searches_per_month?: number;
    plan_searches_left?: number;
    this_month_usage?: number;
    plan_renewal_date?: string;
    plan_id?: string;
    plan_name?: string;
    account_rate_limit_per_hour?: number;
  };
  if (typeof a?.searches_per_month !== "number") throw new SourceError("Account API de SerpApi con formato inesperado");
  const renewal = a.plan_renewal_date ? Date.parse(a.plan_renewal_date) : NaN;
  const used =
    typeof a.this_month_usage === "number"
      ? a.this_month_usage
      : Math.max(0, a.searches_per_month - (a.plan_searches_left ?? 0));
  return {
    limit: a.searches_per_month,
    used,
    renewalAt: Number.isFinite(renewal) && renewal > now ? renewal : null,
    plan: a.plan_id ?? a.plan_name ?? null,
    perHour: a.account_rate_limit_per_hour ?? null,
  };
}

export const serpApiAdapter: SourceAdapter = {
  id: "serpapi",
  callsPerRun: 1,
  isConfigured: (env) => Boolean(env.SERPAPI_KEY),
  async fetchOffers(product: Product, ctx: AdapterContext) {
    const key = ctx.env.SERPAPI_KEY;
    if (!key) throw new SourceError("SERPAPI_KEY no configurada", 401, null, true);
    let calls = 0;
    // Sin reintentos automáticos: cada intento podría consumir una búsqueda de la cuota mensual.
    const res = await fetchWithRetry(serpApiSearchUrl(product, key), {}, { retries: 0, timeoutMs: 30000, onAttempt: () => (calls++, ctx.countCall()) });
    return { observations: parseSerpApi(await res.json()), calls, httpStatus: res.status };
  },
  async syncQuota(ctx: AdapterContext) {
    const key = ctx.env.SERPAPI_KEY;
    if (!key) throw new SourceError("SERPAPI_KEY no configurada", 401, null, true);
    // Gratuita: no se cuenta como llamada de cuota.
    const res = await fetchWithRetry(`https://serpapi.com/account.json?api_key=${encodeURIComponent(key)}`, {}, { retries: 1 });
    return parseAccount(await res.json(), ctx.now);
  },
};
