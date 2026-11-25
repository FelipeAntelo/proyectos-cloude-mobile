import type { Env } from "../env";
import { randomToken, sha256Hex, timingSafeEqual } from "../lib/util";
import { HttpError } from "./http";

const SESSION_TTL_MS = 180 * 86400_000;

/**
 * Límite de tasa de ventana fija en D1. Devuelve false si se excede.
 * (Para una app personal es suficiente; evita fuerza bruta y abuso de endpoints caros.)
 */
export async function rateLimit(db: D1Database, key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
  const windowStart = now - (now % windowMs);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

/** Emparejamiento: el usuario introduce el SETUP_CODE (secreto del Worker) y recibe un token de sesión. */
export async function claim(req: Request, env: Env, code: string, label: string | undefined, now: number) {
  if (!(await rateLimit(env.DB, `claim:${clientIp(req)}`, 5, 3600_000, now))) {
    throw new HttpError(429, "Demasiados intentos. Prueba en una hora.");
  }
  if (!(await rateLimit(env.DB, "claim:global", 20, 3600_000, now))) {
    throw new HttpError(429, "Demasiados intentos.");
  }
  const expected = env.SETUP_CODE;
  if (!expected || expected.length < 12) throw new HttpError(503, "El servidor no tiene SETUP_CODE configurado");
  if (!timingSafeEqual(code, expected)) throw new HttpError(401, "Código incorrecto");
  const token = randomToken(32);
  await env.DB
    .prepare("INSERT INTO sessions (token_hash, label, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), label ?? null, now, now, now + SESSION_TTL_MS)
    .run();
  return { token, expiresAt: now + SESSION_TTL_MS };
}

export async function requireSession(req: Request, env: Env, now: number): Promise<string> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(h);
  if (!m) throw new HttpError(401, "No autenticado");
  const hash = await sha256Hex(m[1]!);
  const row = await env.DB
    .prepare("SELECT token_hash, expires_at, last_used_at FROM sessions WHERE token_hash = ?")
    .bind(hash)
    .first<{ token_hash: string; expires_at: number; last_used_at: number }>();
  if (!row || row.expires_at < now) throw new HttpError(401, "Sesión inválida o caducada");
  if (now - row.last_used_at > 3600_000) {
    await env.DB.prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?").bind(now, hash).run();
  }
  return hash;
}

export async function revokeSession(env: Env, hash: string) {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
}
