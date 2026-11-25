import { formatUsd, utcDay } from "../lib/util";
import type { MatchStatus, Product, Verification } from "./types";

export interface NotificationPrefs {
  priceDrop: boolean;
  targetReached: boolean;
  newOffer: boolean;
  newBest: boolean;
  backInStock: boolean;
  financing: boolean;
  /** Notificar ofertas descubiertas indirectamente (marcadas como no verificadas). */
  discovered: boolean;
  minDropCents: number;
  minDropPct: number;
  cooldownMinutes: number;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  priceDrop: true,
  targetReached: true,
  newOffer: true,
  newBest: true,
  backInStock: true,
  financing: true,
  discovered: true,
  minDropCents: 500,
  minDropPct: 1,
  cooldownMinutes: 360,
};

export type AlertType =
  | "target_reached"
  | "new_best"
  | "price_drop"
  | "new_offer"
  | "back_in_stock"
  | "financing_better";

const PRIORITY: AlertType[] = [
  "target_reached",
  "new_best",
  "price_drop",
  "financing_better",
  "new_offer",
  "back_in_stock",
];

export interface AlertCandidate {
  type: AlertType;
  productId: string;
  offerId: string | null;
  dedupeKey: string;
  title: string;
  body: string;
  url: string | null;
  priceCents: number | null;
  prevCents: number | null;
  verification: Verification;
}

// ----------------------------------------------------------- protección de falsos positivos

export interface PriceGateInput {
  prevPriceCents: number | null;
  pendingPriceCents: number | null;
  pendingCount: number;
  newPriceCents: number | null;
}

export type PriceGate =
  | { kind: "accept" }
  | { kind: "reject"; reason: string }
  | { kind: "pending"; pendingPriceCents: number; pendingCount: number; reason: string };

/**
 * Un precio sospechoso (caída > 40 % respecto del último aceptado, o < 45 % del
 * MSRP) no se acepta hasta verse igual en dos comprobaciones consecutivas.
 * Precios fuera del rango de cordura del producto se descartan siempre.
 */
export function gatePrice(product: Product, g: PriceGateInput): PriceGate {
  const p = g.newPriceCents;
  if (p == null) return { kind: "accept" };
  if (p < product.spec.priceFloorCents || p > product.spec.priceCeilCents) {
    return { kind: "reject", reason: `Precio fuera de rango plausible (${formatUsd(p)})` };
  }
  const suspicious =
    (g.prevPriceCents != null && p < g.prevPriceCents * 0.6) ||
    (product.msrpCents != null && p < product.msrpCents * 0.45);
  if (!suspicious) return { kind: "accept" };
  const samePending = g.pendingPriceCents != null && Math.abs(g.pendingPriceCents - p) <= 100;
  if (samePending && g.pendingCount >= 1) return { kind: "accept" };
  return {
    kind: "pending",
    pendingPriceCents: p,
    pendingCount: samePending ? g.pendingCount + 1 : 1,
    reason: "Variación anómala: se espera confirmación en la próxima comprobación",
  };
}

// ----------------------------------------------------------- evaluación

export interface OfferEval {
  id: string;
  store: string;
  url: string;
  verification: Verification;
  matchStatus: MatchStatus;
}

export interface EvalInput {
  product: Product;
  offer: OfferEval;
  isNew: boolean;
  prev: { priceCents: number | null; inStock: boolean | null } | null;
  next: { priceCents: number | null; inStock: boolean | null };
  /** Mejor precio (match) del producto ANTES de esta actualización, excluyendo esta oferta. */
  bestOtherCents: number | null;
  /** Primera carga del producto: evita una avalancha de "nueva oferta". */
  bootstrap: boolean;
  prefs: NotificationPrefs;
  now: number;
}

function label(v: Verification): string {
  return v === "discovered" ? " (descubierta · sin verificar en tienda)" : v === "manual" ? " (carga manual)" : "";
}

export function evaluateOffer(i: EvalInput): AlertCandidate[] {
  const { product, offer, prefs } = i;
  const eligible =
    offer.matchStatus === "match" || (offer.matchStatus === "user_asserted" && offer.verification === "manual");
  if (!eligible) return [];
  if (offer.verification === "simulated") return [];
  if (offer.verification === "discovered" && !prefs.discovered) return [];

  const price = i.next.priceCents;
  const prev = i.prev?.priceCents ?? null;
  const out: AlertCandidate[] = [];
  const base = {
    productId: product.id,
    offerId: offer.id,
    url: offer.url,
    priceCents: price,
    prevCents: prev,
    verification: offer.verification,
  };
  const name = product.spec.modelLabel;
  const sfx = label(offer.verification);

  if (price != null) {
    const target = product.targetCents;
    if (prefs.targetReached && target != null && price <= target && (prev == null || prev > target)) {
      out.push({
        ...base,
        type: "target_reached",
        dedupeKey: `target_reached:${offer.id}:${price}`,
        title: `Precio objetivo alcanzado${sfx}`,
        body: `${name} a ${formatUsd(price)} en ${offer.store} (objetivo ${formatUsd(target)}).`,
      });
    }
    const isBest = i.bestOtherCents == null || price < i.bestOtherCents;
    if (prefs.newBest && isBest && (prev == null || price < prev)) {
      out.push({
        ...base,
        type: "new_best",
        dedupeKey: `new_best:${product.id}:${price}`,
        title: `Nuevo mejor precio${sfx}`,
        body: `${name}: ${formatUsd(price)} en ${offer.store}` +
          (i.bestOtherCents != null ? ` (antes ${formatUsd(i.bestOtherCents)} en otra tienda).` : "."),
      });
    }
    if (prefs.priceDrop && prev != null && price < prev) {
      const drop = prev - price;
      const threshold = Math.max(prefs.minDropCents, Math.round((prev * prefs.minDropPct) / 100));
      if (drop >= threshold) {
        out.push({
          ...base,
          type: "price_drop",
          dedupeKey: `price_drop:${offer.id}:${price}`,
          title: `Bajó ${formatUsd(drop)} en ${offer.store}${sfx}`,
          body: `${name}: ${formatUsd(prev)} → ${formatUsd(price)}.`,
        });
      }
    }
    if (prefs.newOffer && i.isNew && !i.bootstrap) {
      const relevant = product.msrpCents == null || price < product.msrpCents || isBest;
      if (relevant) {
        out.push({
          ...base,
          type: "new_offer",
          dedupeKey: `new_offer:${offer.id}`,
          title: `Nueva oferta en ${offer.store}${sfx}`,
          body: `${name} a ${formatUsd(price)}.`,
        });
      }
    }
  }

  if (prefs.backInStock && i.prev?.inStock === false && i.next.inStock === true) {
    out.push({
      ...base,
      type: "back_in_stock",
      dedupeKey: `back_in_stock:${offer.id}:${utcDay(i.now)}`,
      title: `Disponible de nuevo en ${offer.store}${sfx}`,
      body: `${name}${price != null ? ` a ${formatUsd(price)}` : ""}.`,
    });
  }
  return out;
}

/** Ordena por prioridad; la primera de cada oferta es la que se envía como push. */
export function prioritize(cands: AlertCandidate[]): AlertCandidate[] {
  return [...cands].sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));
}

export interface RecentAlert {
  type: string;
  offerId: string | null;
  priceCents: number | null;
  createdAt: number;
}

/**
 * Enfriamiento: no repetir el mismo tipo de alerta para la misma oferta dentro
 * de la ventana, salvo que el precio sea estrictamente menor que el último
 * notificado (una mejora real siempre se avisa).
 */
export function applyCooldown(
  cands: AlertCandidate[],
  recent: RecentAlert[],
  cooldownMs: number,
  now: number,
): AlertCandidate[] {
  return cands.filter((c) => {
    if (c.type === "target_reached") return true; // ya deduplicado por cruce de umbral
    const last = recent
      .filter((r) => r.type === c.type && r.offerId === c.offerId && now - r.createdAt < cooldownMs)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!last) return true;
    return c.priceCents != null && last.priceCents != null && c.priceCents < last.priceCents;
  });
}
