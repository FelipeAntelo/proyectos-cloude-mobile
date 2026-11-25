import { DEFAULT_PREFS, type NotificationPrefs } from "./domain/alerts";
import { DEFAULT_TAX, type TaxSettings } from "./domain/tax";
import type { Product, ProductSpec, SourceRow } from "./domain/types";
import { safeJsonParse } from "./lib/util";

interface ProductRow {
  id: string;
  name: string;
  spec: string;
  msrp_cents: number | null;
  msrp_status: string;
  target_cents: number | null;
  active: number;
}

export function rowToProduct(r: ProductRow): Product {
  return {
    id: r.id,
    name: r.name,
    spec: safeJsonParse<ProductSpec>(r.spec, {} as ProductSpec),
    msrpCents: r.msrp_cents,
    msrpStatus: r.msrp_status === "verified" ? "verified" : "provisional",
    targetCents: r.target_cents,
    active: r.active === 1,
  };
}

export async function getProducts(db: D1Database, activeOnly = false): Promise<Product[]> {
  const sql = `SELECT * FROM products ${activeOnly ? "WHERE active = 1" : ""} ORDER BY created_at`;
  const { results } = await db.prepare(sql).all<ProductRow>();
  return results.map(rowToProduct);
}

export async function getProduct(db: D1Database, id: string): Promise<Product | null> {
  const r = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<ProductRow>();
  return r ? rowToProduct(r) : null;
}

export async function getSources(db: D1Database): Promise<SourceRow[]> {
  const { results } = await db.prepare("SELECT * FROM sources ORDER BY id").all<SourceRow>();
  return results;
}

export interface AppSettings {
  notifications: NotificationPrefs;
  tax: TaxSettings;
  staleness: { staleAfterIntervals: number };
  appOrigin: string | null;
}

export async function getSettings(db: D1Database): Promise<AppSettings> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const m = new Map(results.map((r) => [r.key, r.value]));
  return {
    notifications: { ...DEFAULT_PREFS, ...safeJsonParse(m.get("notifications"), {}) },
    tax: { ...DEFAULT_TAX, ...safeJsonParse(m.get("tax"), {}) },
    staleness: { staleAfterIntervals: 3, ...safeJsonParse(m.get("staleness"), {}) },
    appOrigin: safeJsonParse<string | null>(m.get("app_origin"), null),
  };
}

export async function setSetting(db: D1Database, key: string, value: unknown): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, JSON.stringify(value))
    .run();
}

export interface OfferRow {
  id: string;
  product_id: string;
  source_id: string;
  store: string;
  external_id: string;
  title: string;
  url: string;
  verification: string;
  match_status: string;
  match_checks: string;
  price_cents: number | null;
  shipping_cents: number | null;
  in_stock: number | null;
  pending_price_cents: number | null;
  pending_count: number;
  first_seen_at: number;
  last_seen_at: number;
  last_changed_at: number;
  active: number;
}

export async function getOffers(db: D1Database, productId: string, activeOnly = true): Promise<OfferRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM offers WHERE product_id = ? ${activeOnly ? "AND active = 1" : ""}`)
    .bind(productId)
    .all<OfferRow>();
  return results;
}

/** Precio comparable = precio + envío (si se conoce). */
export function deliveredCents(o: { price_cents: number | null; shipping_cents: number | null }): number | null {
  return o.price_cents == null ? null : o.price_cents + (o.shipping_cents ?? 0);
}

export type Freshness = "verified" | "stale" | "unavailable" | "not_configured" | "disabled" | "manual";

export function sourceFreshness(
  s: SourceRow,
  configured: boolean,
  now: number,
  staleAfterIntervals: number,
): Freshness {
  if (s.kind === "manual") return "manual";
  if (!s.enabled) return "disabled";
  if (!configured) return "not_configured";
  if (!s.last_success_at) return "unavailable";
  const interval = Math.max(s.interval_s, s.min_interval_s) * 1000;
  return now - s.last_success_at <= interval * staleAfterIntervals + 60_000 ? "verified" : "stale";
}
