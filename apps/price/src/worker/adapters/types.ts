import type { Env } from "../env";
import type { FetchResult, Product } from "../domain/types";

export interface AdapterContext {
  env: Env;
  db: D1Database;
  now: number;
  /** Cuenta cada llamada HTTP real a la fuente (reintentos y auxiliares incluidos). */
  countCall: () => void;
}

export interface QuotaSyncResult {
  limit: number;
  used: number;
  renewalAt: number | null;
  plan: string | null;
  perHour: number | null;
}

export interface SourceAdapter {
  id: string;
  /** Llamadas HTTP aproximadas por producto y ejecución (para planificar cuota). */
  callsPerRun: number;
  /** ¿Están configuradas las credenciales necesarias? */
  isConfigured(env: Env): boolean;
  fetchOffers(product: Product, ctx: AdapterContext): Promise<FetchResult>;
  /** Consulta gratuita del consumo real al proveedor, si existe. */
  syncQuota?(ctx: AdapterContext): Promise<QuotaSyncResult>;
}
