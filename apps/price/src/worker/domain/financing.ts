/**
 * Financiación: normaliza condiciones declaradas y calcula lo derivable.
 * Nunca inventa datos: lo calculado se marca como tal y lo desconocido queda null.
 */

export interface FinancingInput {
  cashPriceCents: number | null;
  aprBps: number | null; // 1999 = 19.99 %
  months: number | null;
  monthlyCents: number | null;
  downCents: number | null;
  totalCents: number | null;
}

export interface FinancingComputed extends FinancingInput {
  /** Campos que se derivaron matemáticamente (no los declaró la fuente). */
  derived: Array<"monthlyCents" | "totalCents">;
  interestCents: number | null;
}

export function amortizedMonthlyCents(principalCents: number, aprBps: number, months: number): number {
  if (months <= 0) throw new Error("months must be > 0");
  const r = aprBps / 10000 / 12;
  if (r === 0) return Math.ceil(principalCents / months);
  const pay = (principalCents * r) / (1 - Math.pow(1 + r, -months));
  return Math.round(pay);
}

export function computeFinancing(f: FinancingInput): FinancingComputed {
  const derived: FinancingComputed["derived"] = [];
  let monthly = f.monthlyCents;
  let total = f.totalCents;
  const down = f.downCents ?? 0;
  if (monthly == null && f.cashPriceCents != null && f.aprBps != null && f.months) {
    monthly = amortizedMonthlyCents(f.cashPriceCents - down, f.aprBps, f.months);
    derived.push("monthlyCents");
  }
  if (total == null && monthly != null && f.months) {
    total = down + monthly * f.months;
    derived.push("totalCents");
  }
  const interest = total != null && f.cashPriceCents != null ? Math.max(0, total - f.cashPriceCents) : null;
  return { ...f, monthlyCents: monthly, totalCents: total, derived, interestCents: interest };
}

/** true si `b` es estrictamente mejor que `a` para el comprador. */
export function isBetterFinancing(a: FinancingComputed | null, b: FinancingComputed): boolean {
  if (!a) return true;
  if (a.totalCents != null && b.totalCents != null && b.totalCents !== a.totalCents) {
    return b.totalCents < a.totalCents;
  }
  if (a.aprBps != null && b.aprBps != null && b.aprBps !== a.aprBps) return b.aprBps < a.aprBps;
  if (a.aprBps === 0 && b.aprBps === 0 && a.months != null && b.months != null) return b.months > a.months;
  return false;
}
