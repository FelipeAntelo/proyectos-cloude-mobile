import { bestBuyAdapter } from "./bestbuy";
import { ebayAdapter } from "./ebay";
import type { SourceAdapter } from "./types";

/** Agregar una tienda = crear su adaptador + registrarlo aquí + fila en `sources`. */
export const ADAPTERS: Record<string, SourceAdapter> = {
  [bestBuyAdapter.id]: bestBuyAdapter,
  [ebayAdapter.id]: ebayAdapter,
};
