import { sleep } from "./util";

export class SourceError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
    public retryAfterMs: number | null = null,
    /** Error de configuración (credencial ausente/ inválida): no reintentar en bucle. */
    public fatal = false,
  ) {
    super(message);
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  /** Contador de llamadas reales efectuadas (para presupuestos de cuota). */
  onAttempt?: () => void;
  sleepFn?: (ms: number) => Promise<void>;
}

export function parseRetryAfter(h: string | null, now = Date.now()): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/**
 * fetch con timeout y reintentos con backoff exponencial + jitter en errores
 * transitorios (red, 429, 5xx). 4xx distintos de 429 no se reintentan.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 500;
  const wait = opts.sleepFn ?? sleep;
  let lastErr: SourceError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    opts.onAttempt?.();
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 10000) });
    } catch (e) {
      lastErr = new SourceError(`Error de red: ${(e as Error).message}`);
      if (attempt < retries) await wait(base * 2 ** attempt + Math.random() * base);
      continue;
    }
    if (res.ok) return res;
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    const transient = res.status === 429 || res.status >= 500;
    lastErr = new SourceError(
      `HTTP ${res.status}`,
      res.status,
      retryAfter,
      res.status === 401 || res.status === 403,
    );
    if (!transient || attempt === retries) break;
    // Si el servidor pide esperar más de 5 s, no bloqueamos el cron: lo maneja el scheduler.
    if (retryAfter != null && retryAfter > 5000) break;
    await wait(retryAfter ?? base * 2 ** attempt + Math.random() * base);
  }
  throw lastErr ?? new SourceError("Error desconocido");
}

/** Backoff del scheduler entre ejecuciones fallidas: 5 min · 2^(n-1), tope 6 h, ±10 %. */
export function schedulerBackoffMs(failures: number, rand = Math.random()): number {
  const base = Math.min(5 * 60_000 * 2 ** Math.max(0, failures - 1), 6 * 3600_000);
  return Math.round(base * (0.9 + 0.2 * rand));
}
