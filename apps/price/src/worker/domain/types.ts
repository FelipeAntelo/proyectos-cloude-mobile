export interface ProductSpec {
  brand: string;
  /** Regex (string) que debe aparecer en el título normalizado. */
  modelPattern: string;
  modelLabel: string;
  storageGb: number;
  color: string;
  colorAliases: string[];
  condition: "new";
  unlocked: boolean;
  searchQuery: string;
  /** Rango de cordura para descartar accesorios/errores (centavos). */
  priceFloorCents: number;
  priceCeilCents: number;
}

export interface Product {
  id: string;
  name: string;
  spec: ProductSpec;
  msrpCents: number | null;
  msrpStatus: "provisional" | "verified";
  targetCents: number | null;
  active: boolean;
}

export type Verification = "verified" | "discovered" | "manual" | "simulated";
export type CheckResult = "ok" | "fail" | "unknown";
export type MatchStatus = "match" | "partial" | "mismatch" | "user_asserted";

export interface MatchChecks {
  model: CheckResult;
  storage: CheckResult;
  color: CheckResult;
  condition: CheckResult;
  unlocked: CheckResult;
  noStrings: CheckResult; // sin contrato / activación / trade-in obligatorio
  notes: string[];
}

/** Una observación normalizada que devuelve un adaptador. */
export interface Observation {
  sourceId: string;
  externalId: string;
  store: string;
  title: string;
  url: string;
  priceCents: number | null;
  shippingCents: number | null;
  inStock: boolean | null;
  verification: Verification;
  /** Atributos estructurados cuando la fuente los da. */
  attrs: {
    color?: string | null;
    condition?: string | null;
    storageGb?: number | null;
  };
  /** Motivo por el que la fuente no es fiable para esta oferta (p.ej. vendedor con poca reputación). */
  trustIssue?: string | null;
}

export interface FetchResult {
  observations: Observation[];
  calls: number;
  httpStatus?: number;
}

export interface SourceRow {
  id: string;
  name: string;
  kind: string;
  enabled: number;
  interval_s: number;
  min_interval_s: number;
  daily_budget: number;
  calls_today: number;
  budget_day: string | null;
  consecutive_failures: number;
  backoff_until: number | null;
  next_check_at: number;
  last_attempt_at: number | null;
  last_success_at: number | null;
  last_error: string | null;
  last_error_at: number | null;
}
