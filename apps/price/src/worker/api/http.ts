export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error("Unhandled", e);
  return json({ error: "Error interno" }, 500);
}

const MAX_BODY = 16 * 1024;

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new HttpError(415, "Se espera application/json");
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "Cuerpo demasiado grande");
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
}

// ---------------------------------------------------------------- validadores

type Opt = { optional?: boolean };

export function str(o: Record<string, unknown>, k: string, max: number, opt: Opt = {}): string | undefined {
  const v = o[k];
  if (v === undefined || v === null || v === "") {
    if (opt.optional) return undefined;
    throw new HttpError(400, `Falta ${k}`);
  }
  if (typeof v !== "string" || v.length > max) throw new HttpError(400, `${k} inválido`);
  return v.trim();
}

export function int(o: Record<string, unknown>, k: string, min: number, max: number, opt: Opt = {}): number | undefined {
  const v = o[k];
  if (v === undefined || v === null || v === "") {
    if (opt.optional) return undefined;
    throw new HttpError(400, `Falta ${k}`);
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new HttpError(400, `${k} inválido`);
  return v;
}

export function bool(o: Record<string, unknown>, k: string, opt: Opt = {}): boolean | undefined {
  const v = o[k];
  if (v === undefined || v === null) {
    if (opt.optional) return undefined;
    throw new HttpError(400, `Falta ${k}`);
  }
  if (typeof v !== "boolean") throw new HttpError(400, `${k} inválido`);
  return v;
}

export function httpsUrl(o: Record<string, unknown>, k: string, opt: Opt = {}): string | undefined {
  const s = str(o, k, 2000, opt);
  if (s === undefined) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw new HttpError(400, `${k} debe ser una URL https`);
  }
}

/** Fecha ISO o epoch ms → epoch ms, no futura. */
export function dateMs(o: Record<string, unknown>, k: string, now: number, opt: Opt = {}): number | undefined {
  const v = o[k];
  if (v === undefined || v === null || v === "") {
    if (opt.optional) return undefined;
    throw new HttpError(400, `Falta ${k}`);
  }
  const ms = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms) || ms > now + 5 * 60_000 || ms < Date.UTC(2020, 0, 1)) throw new HttpError(400, `${k} inválida`);
  return ms;
}
