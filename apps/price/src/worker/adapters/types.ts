import type { Env } from "../env";
import type { FetchResult, Product } from "../domain/types";

export interface AdapterContext {
  env: Env;
  db: D1Database;
  now: number;
  /** Cuenta cada llamada HTTP real a la fuente (para presupuestos). */
  countCall: () => void;
}

export interface SourceAdapter {
  id: string;
  /** Llamadas HTTP aproximadas por producto y ejecución (para planificar cuota). */
  callsPerRun: number;
  /** ¿Están configuradas las credenciales necesarias? */
  isConfigured(env: Env): boolean;
  fetchOffers(product: Product, ctx: AdapterContext): Promise<FetchResult>;
}
