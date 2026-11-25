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

export interface OfferView {
  id: string;
  source: string;
  store: string;
  title: string;
  url: string;
  verification: Verification;
  match: "match" | "partial" | "mismatch" | "user_asserted";
  checks: { notes?: string[] } & Record<string, unknown>;
  priceCents: number | null;
  shippingCents: number | null;
  deliveredCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  inStock: boolean | null;
  pendingPriceCents: number | null;
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

export interface SourceView {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  configured: boolean;
  freshness: "verified" | "stale" | "unavailable" | "not_configured" | "disabled" | "manual";
  intervalS: number;
  dailyBudget: number;
  callsToday: number;
  lastSuccessAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  nextCheckAt: number;
}

export interface Product {
  id: string;
  name: string;
  spec: { modelLabel: string; storageGb: number; color: string; unlocked: boolean };
  msrpCents: number | null;
  msrpStatus: "provisional" | "verified";
  targetCents: number | null;
}

export interface AlertRow {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string | null;
  verification: Verification;
  created_at: number;
  pushed_at: number | null;
}

export interface Dashboard {
  now: number;
  tax: { zip: string; place: string; ratePct: number; status: string };
  products: Array<{
    product: Product;
    best: OfferView | null;
    bestAny: OfferView | null;
    offers: OfferView[];
    financing: FinancingView[];
    bestFinancing: FinancingView | null;
  }>;
  sources: SourceView[];
  alerts: AlertRow[];
}

export function usd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
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
