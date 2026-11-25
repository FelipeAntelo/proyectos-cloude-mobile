import type { CheckResult, MatchChecks, MatchStatus, Observation, ProductSpec } from "./types";

/**
 * Verificación de variante: modelo, almacenamiento, color, condición,
 * desbloqueo y ausencia de contrato/activación/trade-in obligatorio.
 *
 * Principio: ante la duda, "unknown" (→ partial), nunca "ok". Solo las ofertas
 * con todas las comprobaciones en "ok" pueden disparar alertas automáticas.
 */

const ACCESSORY = /\b(case|cases|cover|protector|screen ?guard|tempered|glass|charger|cable|holster|skin|mount|stand|wallet|lens|replacement|battery|housing|sticker|decal|dummy|replica|box only|empty box|for parts|parts only)\b/;
const NOT_NEW = /\b(renewed|refurb|refurbished|reconditioned|used|pre-?owned|open[- ]box|like new|excellent|good condition|fair condition|grade [abc]|scratch|cracked|damaged|for parts|demo unit)\b/;
const CARRIERS = /\b(verizon|at&t|att|t-?mobile|tmobile|sprint|boost( mobile)?|cricket|metro( by t-?mobile)?|visible|us cellular|uscellular|tracfone|straight talk|total wireless|xfinity|spectrum|google fi|mint mobile|us mobile)\b/;
const LOCKED_PHRASES = /\b(carrier[- ]locked|sim[- ]locked|network[- ]locked|locked to|(verizon|at&t|att|t-?mobile|boost|cricket|xfinity|spectrum|visible)[- ]locked|requires? activation|activation required|with activation|prepaid|new line required|installment plan required|trade[- ]in required|with trade[- ]in|contract required|\d+[- ]month contract)\b/;
const UNLOCKED = /\b(?<!not )(factory[- ])?unlocked\b/;
const OTHER_COLORS = /\b(porcelain|moonstone|jade|olive|canyon|hazel|rose|lemongrass|peony|iris|frost|indigo|bay|mint|coral|sage|snow|white|green|blue|pink|silver|gold)\b/;

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[|,()\[\]/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Capacidades de almacenamiento mencionadas (≥ 64 GB, para no confundir RAM). */
export function storageMentions(title: string): number[] {
  const out: number[] = [];
  for (const m of title.matchAll(/(\d{2,4})\s?(gb|tb)\b/g)) {
    const n = Number(m[1]) * (m[2] === "tb" ? 1024 : 1);
    if (n >= 64) out.push(n);
  }
  return out;
}

export function matchObservation(
  spec: ProductSpec,
  obs: Pick<Observation, "title" | "attrs">,
): { status: MatchStatus; checks: MatchChecks } {
  const t = normalizeTitle(obs.title);
  const notes: string[] = [];

  // Modelo
  let model: CheckResult = new RegExp(`\\b${spec.modelPattern}\\b`).test(t) ? "ok" : "fail";
  if (model === "fail") notes.push("El título no corresponde al modelo");
  if (ACCESSORY.test(t) || /\bfor (google )?pixel\b/.test(t)) {
    model = "fail";
    notes.push("Parece un accesorio, no el teléfono");
  }

  // Almacenamiento
  let storage: CheckResult = "unknown";
  const structured = obs.attrs.storageGb ?? null;
  const mentions = structured ? [structured] : storageMentions(t);
  if (mentions.length) {
    storage = mentions.includes(spec.storageGb) ? "ok" : "fail";
    if (storage === "ok" && new Set(mentions).size > 1) {
      storage = "unknown";
      notes.push("El título menciona varias capacidades");
    }
    if (storage === "fail") notes.push(`Almacenamiento distinto (${mentions.join("/")} GB)`);
  }

  // Color
  let color: CheckResult = "unknown";
  const colorField = obs.attrs.color ? normalizeTitle(obs.attrs.color) : null;
  const aliases = spec.colorAliases.map((c) => c.toLowerCase());
  const hay = (s: string) => aliases.some((a) => new RegExp(`\\b${a}\\b`).test(s));
  if (colorField) color = hay(colorField) ? "ok" : "fail";
  else if (hay(t)) color = "ok";
  else if (OTHER_COLORS.test(t)) color = "fail";
  if (color === "fail") notes.push("Color distinto");
  if (color === "unknown") notes.push("Color no indicado");

  // Condición
  let condition: CheckResult = "unknown";
  const cond = obs.attrs.condition ? obs.attrs.condition.toLowerCase().trim() : null;
  if (cond) condition = cond === "new" || cond === "brand new" ? "ok" : "fail";
  if (NOT_NEW.test(t)) condition = "fail";
  if (condition === "fail") notes.push("No es nuevo/sellado");

  // Desbloqueo
  let unlocked: CheckResult = "unknown";
  if (spec.unlocked) {
    const saysUnlocked = UNLOCKED.test(t);
    const lockedPhrase = /\b(carrier[- ]locked|sim[- ]locked|network[- ]locked|locked to|(verizon|at&t|att|t-?mobile|boost|cricket|xfinity|spectrum|visible)[- ]locked)\b/.test(t);
    if (lockedPhrase) unlocked = "fail";
    else if (saysUnlocked) unlocked = "ok";
    else if (CARRIERS.test(t)) unlocked = "fail";
    if (unlocked === "fail") notes.push("Vinculado a operador");
    if (unlocked === "unknown") notes.push("Desbloqueo no indicado");
  } else {
    unlocked = "ok";
  }

  // Sin contrato / activación / trade-in obligatorio
  const noStrings: CheckResult = LOCKED_PHRASES.test(t) ? "fail" : "ok";
  if (noStrings === "fail") notes.push("Requiere contrato, activación o trade-in");

  const checks: MatchChecks = { model, storage, color, condition, unlocked, noStrings, notes };
  const values = [model, storage, color, condition, unlocked, noStrings];
  const status: MatchStatus = values.includes("fail")
    ? "mismatch"
    : values.every((v) => v === "ok")
      ? "match"
      : "partial";
  return { status, checks };
}
