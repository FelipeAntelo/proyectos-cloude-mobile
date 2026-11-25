import { b64urlDecode, b64urlEncode, concatBytes, enc } from "../lib/util";

/**
 * Web Push sin dependencias (WebCrypto):
 *  - VAPID (RFC 8292): JWT ES256 firmado con la clave privada del servidor.
 *  - Cifrado del payload (RFC 8291) con content-encoding aes128gcm (RFC 8188).
 */

export interface VapidKeys {
  publicKey: string; // punto P-256 sin comprimir, base64url (applicationServerKey)
  privateJwk: JsonWebKey;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string; // base64url
  auth: string; // base64url
}

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

export async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = (await crypto.subtle.generateKey(P256, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  return { publicKey: b64urlEncode(raw), privateJwk: jwk };
}

export async function vapidAuthHeader(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, P256, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${keys.publicKey}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** Cifra `payload` para una suscripción (un único registro, RFC 8291 §4). */
export async function encryptPayload(
  sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  payload: Uint8Array,
  opts: { salt?: Uint8Array; asKeyPair?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("Claves de suscripción inválidas");

  const as =
    opts.asKeyPair ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", as.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as SubtleCryptoDeriveKeyAlgorithm, as.privateKey, 256),
  );

  const keyInfo = concatBytes(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const plaintext = concatBytes(payload, new Uint8Array([2])); // delimitador de último registro
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concatBytes(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** Hosts de servicios push aceptados (evita SSRF con endpoints arbitrarios). */
const PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^[a-z0-9.-]+\.push\.apple\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export interface PushMessage {
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
}

export type SendOutcome = { ok: true; status: number } | { ok: false; status: number | null; gone: boolean; error: string };

export async function sendPush(
  sub: PushSubscriptionKeys,
  msg: PushMessage,
  keys: VapidKeys,
  subject: string,
): Promise<SendOutcome> {
  if (!isAllowedPushEndpoint(sub.endpoint)) return { ok: false, status: null, gone: true, error: "endpoint no permitido" };
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(msg)));
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        authorization: await vapidAuthHeader(sub.endpoint, keys, subject),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: "86400",
        urgency: "high",
        ...(msg.tag ? { topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}),
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    const text = (await res.text()).slice(0, 200);
    return { ok: false, status: res.status, gone: res.status === 404 || res.status === 410, error: text || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: null, gone: false, error: (e as Error).message };
  }
}
