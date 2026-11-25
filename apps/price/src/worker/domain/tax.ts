export interface TaxSettings {
  zip: string;
  place: string;
  ratePct: number;
  status: "verified" | "unverified";
  note?: string;
}

export const DEFAULT_TAX: TaxSettings = {
  zip: "20110",
  place: "Manassas, VA",
  ratePct: 6.0,
  status: "unverified",
};

/** Impuesto estimado sobre el precio (redondeo comercial a centavos). */
export function estimateTaxCents(priceCents: number, ratePct: number): number {
  return Math.round((priceCents * Math.round(ratePct * 1000)) / 100000);
}

export function totalWithTax(priceCents: number, shippingCents: number | null, ratePct: number) {
  const tax = estimateTaxCents(priceCents, ratePct);
  return { taxCents: tax, totalCents: priceCents + (shippingCents ?? 0) + tax };
}
