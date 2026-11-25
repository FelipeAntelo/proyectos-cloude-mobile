const TOKEN_KEY = "pwa-lab:price:token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/auth/claim") setToken(null);
    throw new ApiError(res.status, data.error ?? `Error ${res.status}`);
  }
  return data as T;
}

// ------------------------------------------------------------------ tipos de la API

export type Verification = "verified" | "discovered" | "manual" | "simulated";
export type DataState = "verified" | "partial" | "discovered" | "stale" | "unavailable" | "manual" | "simulated";

export interface OfferView {
  id: string;
  source: string;
  store: string;
  title: string;
  url: string;
  verification: Verification;
  match: "match" | "partial" | "mismatch" | "user_asserted";
  state: DataState;
  checks: { notes?: string[] } & Record<string, unknown>;
  priceCents: number | null;
  shippingCents: number | null;
  deliveredCents: number | null;
  discountPct: number | null;
  taxCents: number | null;
  totalCents: number | null;
  inStock: boolean | null;
  pendingPriceCents: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
  lastChangedAt: number;
}

export interface FinancingView {
  id: number;
  store: string;
  provider: string | null;
  aprBps: number | null;
  months: number | null;
  monthlyCents: number | null;
  downCents: number | null;
  totalCents: number | null;
  cashPriceCents: number | null;
  interestCents: number | null;
  derived: string[];
  eligibility: string | null;
  conditions: string | null;
  url: string | null;
  origin: "api" | "manual";
  originNote: string | null;
  observedAt: number;
}

export interface QuotaView {
  kind: "hour" | "day" | "month" | "cycle";
  limit: number;
  used: number;
  manualUsed: number;
  reserve: number;
  remaining: number;
  usagePct: number;
  resetsAt: number;
}

export interface SourceView {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  configured: boolean;
  freshness: "verified" | "stale" | "unavailable" | "not_configured" | "disabled" | "manual" | "suspended" | "backoff";
  suspendedReason: string | null;
  desiredIntervalS: number;
  effectiveIntervalS: number | null;
  autoAllowed: boolean | null;
  quotaVerified: boolean;
  quotaNote: string | null;
  quotas: QuotaView[];
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  consecutiveFailures: number;
  nextCheckAt: number;
  backoffUntil: number | null;
}

export interface Product {
  id: string;
  name: string;
  spec: { modelLabel: string; storageGb: number; color: string; unlocked: boolean };
  msrpCents: number | null;
  msrpStatus: "provisional" | "verified";
  targetCents: number | null;
  active: boolean;
}

export interface AlertRow {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string | null;
  verification: Verification;
  price_cents: number | null;
  prev_cents: number | null;
  created_at: number;
  pushed_at: number | null;
  push_result: string | null;
}

export interface ProductItem {
  product: Product;
  best: OfferView | null;
  bestAny: OfferView | null;
  offers: OfferView[];
  opportunities: OfferView[];
  financing: FinancingView[];
  bestFinancing: FinancingView | null;
}

export interface Dashboard {
  now: number;
  tax: { zip: string; place: string; ratePct: number; status: string; note?: string };
  products: ProductItem[];
  sources: SourceView[];
  alerts: AlertRow[];
}

export interface SystemView {
  now: number;
  overall: string;
  event: string | null;
  monitor: { lastCron: { startedAt: number; finishedAt?: number } | null; nextCronAt: number; cronExpression: string };
  sources: SourceView[];
  push: { subscriptions: number; lastDeliveredAt: number | null };
  storage: Record<string, number>;
  sessions: number;
  cost: { monthlyUsd: number; basis: string };
  cloudflareUsage: { available: boolean; note: string };
}

export interface NotificationPrefs {
  priceDrop: boolean;
  targetReached: boolean;
  newOffer: boolean;
  newBest: boolean;
  backInStock: boolean;
  financing: boolean;
  discovered: boolean;
  allTimeLow: boolean;
  newStore: boolean;
  opportunities: boolean;
  priceIncrease: boolean;
  system: boolean;
  minDropCents: number;
  minDropPct: number;
  cooldownMinutes: number;
}

/** Solo enlaces https externos se renderizan como enlace. */
export function safeHref(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u, location.origin);
    return url.protocol === "https:" || url.origin === location.origin ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function duration(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = s / 3600;
  return h < 48 ? `${h % 1 === 0 ? h : h.toFixed(1)} h` : `${Math.round(h / 24)} d`;
}

export function usd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function until(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "—";
  const s = Math.round((ms - now) / 1000);
  if (s <= 0) return "ahora";
  return `en ${duration(s)}`;
}

export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "nunca";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "hace segundos";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
