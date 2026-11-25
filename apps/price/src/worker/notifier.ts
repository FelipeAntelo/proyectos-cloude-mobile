import type { Env } from "./env";
import { generateVapidKeys, sendPush, type PushMessage, type VapidKeys } from "./push/webpush";
import { getSettings } from "./repo";
import { safeJsonParse } from "./lib/util";

const VAPID_KEY = "vapid_keys";
/** Tope de pushes por ejecución (protección contra ráfagas). */
export const MAX_PUSHES_PER_RUN = 5;

/**
 * Las claves VAPID se generan en el propio Worker la primera vez y se guardan en
 * D1: la privada nunca sale de Cloudflare ni pasa por GitHub ni por el chat.
 */
export async function getOrCreateVapid(db: D1Database): Promise<VapidKeys> {
  const row = await db.prepare("SELECT value FROM kv_internal WHERE key = ?").bind(VAPID_KEY).first<{ value: string }>();
  const existing = safeJsonParse<VapidKeys | null>(row?.value, null);
  if (existing?.publicKey && existing.privateJwk) return existing;
  const keys = await generateVapidKeys();
  await db
    .prepare("INSERT OR IGNORE INTO kv_internal (key, value) VALUES (?, ?)")
    .bind(VAPID_KEY, JSON.stringify(keys))
    .run();
  // Releer por si otra invocación concurrente ganó la carrera.
  const again = await db.prepare("SELECT value FROM kv_internal WHERE key = ?").bind(VAPID_KEY).first<{ value: string }>();
  return safeJsonParse<VapidKeys>(again?.value, keys);
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushReport {
  sent: number;
  failed: number;
  removed: number;
  errors: string[];
}

/**
 * Emisor con contexto precargado (suscripciones, claves, subject) para que una
 * ejecución con varias alertas haga pocas consultas a D1 (límite por invocación).
 */
export async function createPushSender(env: Env) {
  const db = env.DB;
  const { results: subs } = await db
    .prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE revoked = 0")
    .all<SubRow>();
  const keys = subs.length ? await getOrCreateVapid(db) : null;
  const subject = subs.length ? ((await getSettings(db)).appOrigin ?? "mailto:alerts@price.invalid") : "";
  const stmts = new Map<string, D1PreparedStatement>();
  const gone = new Set<string>();

  async function send(msg: PushMessage): Promise<PushReport> {
    const report: PushReport = { sent: 0, failed: 0, removed: 0, errors: [] };
    if (!keys) return report;
    const now = Date.now();
    for (const s of subs) {
      if (gone.has(s.id)) continue;
      const r = await sendPush(s, msg, keys, subject);
      if (r.ok) {
        report.sent++;
        stmts.set(s.id, db.prepare("UPDATE push_subscriptions SET last_ok_at = ?, failures = 0 WHERE id = ?").bind(now, s.id));
      } else {
        report.failed++;
        report.errors.push(`${r.status ?? "red"}: ${r.error}`);
        if (r.gone) {
          report.removed++;
          gone.add(s.id);
          stmts.set(s.id, db.prepare("UPDATE push_subscriptions SET revoked = 1 WHERE id = ?").bind(s.id));
        } else {
          stmts.set(s.id, db.prepare("UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?").bind(s.id));
        }
      }
    }
    return report;
  }

  async function flush(extra: D1PreparedStatement[] = []) {
    const all = [...stmts.values(), ...extra];
    stmts.clear();
    if (all.length) await db.batch(all);
  }

  return { send, flush, subscriptions: subs.length };
}

export async function pushToAll(env: Env, msg: PushMessage): Promise<PushReport> {
  const sender = await createPushSender(env);
  const r = await sender.send(msg);
  await sender.flush();
  return r;
}
