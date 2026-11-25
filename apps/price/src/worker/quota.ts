/**
 * Gestor de cuotas.
 *
 * - Ventanas por proveedor: hora, día (en la zona horaria de reinicio del
 *   proveedor), mes natural o ciclo de facturación sincronizado con el proveedor.
 * - Contadores persistentes en D1 de llamadas REALES (reintentos, paginación y
 *   llamadas auxiliares incluidas): sobreviven a reinicios y despliegues.
 * - Reserva (por defecto 20 %) que el monitor automático nunca consume; las
 *   consultas manuales solo pueden usar esa reserva, de modo que no pueden
 *   dejar sin presupuesto al monitor.
 * - Ritmo dinámico: el intervalo efectivo reparte la cuota automática restante
 *   en el tiempo que queda hasta la renovación.
 */

export type WindowKind = "hour" | "day" | "month" | "cycle";

export interface QuotaWindowConfig {
  kind: WindowKind;
  limit: number;
  /** Zona horaria en la que el proveedor reinicia el contador (IANA). */
  tz?: string;
}

export interface QuotaConfig {
  windows: QuotaWindowConfig[];
  reservePct: number;
  verified?: boolean;
  syncFromProvider?: boolean;
  note?: string;
}

/** Datos sincronizados con el proveedor (p. ej. SerpApi Account API). */
export interface ProviderSync {
  limit: number;
  used: number;
  /** Fin del ciclo actual (renovación). */
  renewalAt: number;
  syncedAt: number;
}

export interface WindowState {
  kind: WindowKind;
  key: string;
  start: number;
  end: number;
  limit: number;
  used: number;
  manualUsed: number;
  reserve: number;
}

// ------------------------------------------------------------------ calendario

function zonedParts(t: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute), s: Number(p.second) };
}

/** Desfase (ms) de la zona respecto de UTC en el instante t. */
function tzOffset(t: number, tz: string): number {
  const p = zonedParts(t, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

/** Medianoche local (en tz) del día que contiene t, como epoch ms. */
export function startOfZonedDay(t: number, tz: string): number {
  const p = zonedParts(t, tz);
  const guess = Date.UTC(p.y, p.m - 1, p.d) - tzOffset(t, tz);
  // Corrección por cambio de horario entre la medianoche y t.
  return Date.UTC(p.y, p.m - 1, p.d) - tzOffset(guess, tz);
}

export function windowBounds(
  w: QuotaWindowConfig,
  now: number,
  sync: ProviderSync | null,
): { key: string; start: number; end: number } {
  const tz = w.tz ?? "UTC";
  switch (w.kind) {
    case "hour": {
      const start = now - (now % 3600_000);
      return { key: `hour:${new Date(start).toISOString().slice(0, 13)}`, start, end: start + 3600_000 };
    }
    case "day": {
      const start = startOfZonedDay(now, tz);
      const end = startOfZonedDay(start + 26 * 3600_000, tz);
      const p = zonedParts(start + 3600_000, tz);
      const key = `day:${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}@${tz}`;
      return { key, start, end };
    }
    case "cycle": {
      if (sync && sync.renewalAt > now) {
        const end = sync.renewalAt;
        const s = new Date(end);
        const start = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 1, s.getUTCDate(), s.getUTCHours(), s.getUTCMinutes());
        return { key: `cycle:${end}`, start, end };
      }
      // Sin sincronización: mes natural UTC como aproximación conservadora.
      const d = new Date(now);
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      return { key: `month:${new Date(start).toISOString().slice(0, 7)}`, start, end };
    }
    case "month": {
      const p = zonedParts(now, tz);
      const start = startOfZonedDay(Date.UTC(p.y, p.m - 1, 1, 12), tz);
      const end = startOfZonedDay(Date.UTC(p.y, p.m, 1, 12), tz);
      return { key: `month:${p.y}-${String(p.m).padStart(2, "0")}@${tz}`, start, end };
    }
  }
}

// ------------------------------------------------------------------ planificación (puro)

export interface PlanInput {
  now: number;
  windows: WindowState[];
  callsPerRun: number;
  desiredIntervalS: number;
  minIntervalS: number;
  /** Multiplicador ≤ 1 durante eventos comerciales; ≥ 1 si la fuente está estable. */
  intervalFactor: number;
}

export interface Plan {
  autoAllowed: boolean;
  manualAllowed: boolean;
  /** Intervalo efectivo hasta la próxima consulta automática. */
  intervalS: number;
  /** Si la cuota automática está agotada: cuándo se renueva. */
  blockedUntil: number | null;
  /** Máximo % de uso entre todas las ventanas. */
  usagePct: number;
  reason: string;
}

export function planSource(i: PlanInput): Plan {
  const need = Math.max(1, i.callsPerRun);
  let paceS = 0;
  let autoAllowed = true;
  let manualAllowed = true;
  let blockedUntil: number | null = null;
  let usagePct = 0;
  let reason = "ok";

  for (const w of i.windows) {
    const autoCap = w.limit - w.reserve;
    const autoUsed = w.used - w.manualUsed;
    const autoRemaining = autoCap - autoUsed;
    usagePct = Math.max(usagePct, w.limit > 0 ? (w.used / w.limit) * 100 : 100);

    if (autoRemaining < need) {
      autoAllowed = false;
      blockedUntil = Math.max(blockedUntil ?? 0, w.end);
      reason = `cuota automática agotada (${w.kind})`;
    } else {
      const runs = Math.floor(autoRemaining / need);
      const remainingS = Math.max(1, (w.end - i.now) / 1000);
      // Solo ventanas largas fijan el ritmo; la ventana horaria actúa como tope.
      if (w.kind !== "hour") paceS = Math.max(paceS, remainingS / runs);
    }
    // Manual: solo dentro de la reserva y sin sobrepasar el total.
    if (w.manualUsed + need > w.reserve || w.used + need > w.limit) manualAllowed = false;
  }

  const desired = i.desiredIntervalS * i.intervalFactor;
  const intervalS = Math.ceil(Math.max(i.minIntervalS, desired, paceS));
  return { autoAllowed, manualAllowed, intervalS, blockedUntil, usagePct, reason };
}

// ------------------------------------------------------------------ eventos comerciales

export interface CommercialEvent {
  name: string;
  start: number;
  end: number;
}

/** Acción de Gracias (4.º jueves de noviembre) hasta Cyber Monday, hora del Este. */
export function blackFridayWindow(year: number): CommercialEvent {
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0=domingo
  const firstThu = 1 + ((4 - nov1 + 7) % 7);
  const thanksgiving = firstThu + 21;
  // 05:00 UTC ≈ medianoche en Virginia (EST).
  const start = Date.UTC(year, 10, thanksgiving, 5);
  const end = Date.UTC(year, 10, thanksgiving + 5, 5); // fin del lunes (Cyber Monday)
  return { name: "Black Friday – Cyber Monday", start, end };
}

export function activeEvent(now: number, custom: CommercialEvent[] = []): CommercialEvent | null {
  const y = new Date(now).getUTCFullYear();
  const all = [blackFridayWindow(y), ...custom];
  return all.find((e) => now >= e.start && now < e.end) ?? null;
}

/**
 * Factor de intervalo: en eventos se consulta el doble de seguido (el ritmo de
 * cuota sigue limitándolo); con precios estables > 7 días en fuentes de cuota
 * mensual, se espacia un 50 %.
 */
export function intervalFactor(opts: { event: boolean; monthlyQuota: boolean; lastChangeAt: number | null; now: number }): number {
  if (opts.event) return 0.5;
  if (opts.monthlyQuota && opts.lastChangeAt != null && opts.now - opts.lastChangeAt > 7 * 86400_000) return 1.5;
  return 1;
}

// ------------------------------------------------------------------ persistencia D1

export function parseQuota(json: string | null | undefined): QuotaConfig {
  try {
    const q = JSON.parse(json ?? "") as QuotaConfig;
    if (!Array.isArray(q.windows)) throw new Error();
    return { ...q, reservePct: typeof q.reservePct === "number" ? q.reservePct : 20 };
  } catch {
    return { windows: [], reservePct: 20 };
  }
}

export async function getProviderSync(db: D1Database, sourceId: string): Promise<ProviderSync | null> {
  const r = await db.prepare("SELECT value FROM kv_internal WHERE key = ?").bind(`quota_sync:${sourceId}`).first<{ value: string }>();
  if (!r) return null;
  try {
    return JSON.parse(r.value) as ProviderSync;
  } catch {
    return null;
  }
}

export async function saveProviderSync(db: D1Database, sourceId: string, s: ProviderSync) {
  await db
    .prepare("INSERT OR REPLACE INTO kv_internal (key, value, expires_at) VALUES (?, ?, NULL)")
    .bind(`quota_sync:${sourceId}`, JSON.stringify(s))
    .run();
}

/** Carga el estado de todas las ventanas de varias fuentes con UNA consulta. */
export async function loadWindowStates(
  db: D1Database,
  sources: Array<{ id: string; quota: QuotaConfig; sync: ProviderSync | null }>,
  now: number,
): Promise<Map<string, WindowState[]>> {
  const specs = sources.flatMap((s) =>
    s.quota.windows.map((w) => ({ sourceId: s.id, w, b: windowBounds(w, now, s.sync), sync: s.sync, reservePct: s.quota.reservePct })),
  );
  const out = new Map<string, WindowState[]>(sources.map((s) => [s.id, []]));
  if (!specs.length) return out;
  const placeholders = specs.map(() => "(source_id = ? AND window_key = ?)").join(" OR ");
  const { results } = await db
    .prepare(`SELECT source_id, window_key, used, manual_used FROM quota_usage WHERE ${placeholders}`)
    .bind(...specs.flatMap((s) => [s.sourceId, s.b.key]))
    .all<{ source_id: string; window_key: string; used: number; manual_used: number }>();
  const byKey = new Map(results.map((r) => [`${r.source_id}|${r.window_key}`, r]));
  for (const s of specs) {
    const row = byKey.get(`${s.sourceId}|${s.b.key}`);
    let used = row?.used ?? 0;
    let limit = s.w.limit;
    // El proveedor es la fuente de verdad del ciclo cuando está sincronizado.
    if (s.w.kind === "cycle" && s.sync && s.b.key === `cycle:${s.sync.renewalAt}`) {
      limit = s.sync.limit;
      used = Math.max(used, s.sync.used);
    }
    out.get(s.sourceId)!.push({
      kind: s.w.kind,
      key: s.b.key,
      start: s.b.start,
      end: s.b.end,
      limit,
      used,
      manualUsed: row?.manual_used ?? 0,
      reserve: Math.ceil((limit * s.reservePct) / 100),
    });
  }
  return out;
}

/** Sentencias para sumar llamadas reales a todas las ventanas de una fuente. */
export function recordUsageStatements(
  db: D1Database,
  sourceId: string,
  windows: WindowState[],
  calls: number,
  manual: boolean,
  now: number,
): D1PreparedStatement[] {
  if (calls <= 0) return [];
  return windows.map((w) =>
    db
      .prepare(
        `INSERT INTO quota_usage (source_id, window_key, used, manual_used, window_end, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id, window_key) DO UPDATE SET used = quota_usage.used + excluded.used,
           manual_used = quota_usage.manual_used + excluded.manual_used, updated_at = excluded.updated_at`,
      )
      .bind(sourceId, w.key, calls, manual ? calls : 0, w.end, now),
  );
}
