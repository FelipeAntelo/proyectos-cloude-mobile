import { bestBuyAdapter } from "./bestbuy";
import { ebayAdapter } from "./ebay";
import { serpApiAdapter } from "./serpapi";
import type { SourceAdapter } from "./types";

/** Agregar una tienda = crear su adaptador + registrarlo aquí + fila en `sources` (migración). */
export const ADAPTERS: Record<string, SourceAdapter> = {
  [bestBuyAdapter.id]: bestBuyAdapter,
  [ebayAdapter.id]: ebayAdapter,
  [serpApiAdapter.id]: serpApiAdapter,
};
