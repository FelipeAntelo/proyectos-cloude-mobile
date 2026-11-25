import { describe, expect, it } from "vitest";
import {
  encryptPayload,
  generateVapidKeys,
  isAllowedPushEndpoint,
  vapidAuthHeader,
} from "../src/worker/push/webpush";
import { b64urlDecode, b64urlEncode, concatBytes, dec, enc } from "../src/worker/lib/util";

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}

/** Descifrado del lado del navegador (RFC 8291), implementado de forma independiente para el test. */
async function decrypt(body: Uint8Array, uaKeys: CryptoKeyPair, auth: Uint8Array) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const uaPublic = new Uint8Array((await crypto.subtle.exportKey("raw", uaKeys.publicKey)) as ArrayBuffer);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asKey } as SubtleCryptoDeriveKeyAlgorithm, uaKeys.privateKey, 256),
  );
  const ikm = await hkdf(auth, ecdh, concatBytes(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ct));
  expect(pt[pt.length - 1]).toBe(2);
  return { rs, text: dec.decode(pt.slice(0, -1)) };
}

describe("Web Push", () => {
  it("cifra un payload que el navegador puede descifrar (aes128gcm)", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const uaPublic = new Uint8Array((await crypto.subtle.exportKey("raw", ua.publicKey)) as ArrayBuffer);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const msg = JSON.stringify({ title: "PRICE", body: "Bajó $100 en Best Buy" });
    const body = await encryptPayload({ p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(auth) }, enc.encode(msg));
    const out = await decrypt(body, ua, auth);
    expect(out.text).toBe(msg);
    expect(out.rs).toBe(4096);
  });

  it("firma un JWT VAPID ES256 verificable con la clave pública", async () => {
    const keys = await generateVapidKeys();
    expect(b64urlDecode(keys.publicKey)).toHaveLength(65);
    const header = await vapidAuthHeader("https://web.push.apple.com/abc", keys, "https://price.example.workers.dev", 1_800_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m).toBeTruthy();
    const claims = JSON.parse(dec.decode(b64urlDecode(m[2]!)));
    expect(claims).toMatchObject({ aud: "https://web.push.apple.com", sub: "https://price.example.workers.dev" });
    expect(claims.exp).toBe(1_800_000_000 + 12 * 3600);
    const pub = await crypto.subtle.importKey("raw", b64urlDecode(m[4]!), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64urlDecode(m[3]!),
      enc.encode(`${m[1]}.${m[2]}`),
    );
    expect(ok).toBe(true);
  });

  it("solo acepta endpoints de servicios push conocidos (anti-SSRF)", () => {
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QK7...")).toBe(true);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isAllowedPushEndpoint("http://web.push.apple.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evil.example.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://web.push.apple.com.evil.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });
});

describe("Web Push · vector de prueba oficial RFC 8291 (Apéndice A)", () => {
  it("produce exactamente el mensaje cifrado del estándar", async () => {
    const asPrivate = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    const asPublic = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    const uaPublic = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const salt = "DGv6ra1nlYgDCS1FRnbzlw";
    const auth = "BTBZMqHH6r4Tts7J_aSIgg";
    const expected =
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";
    const pub = b64urlDecode(asPublic);
    const jwk = { kty: "EC", crv: "P-256", d: asPrivate, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: true };
    const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const publicKey = await crypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, true, []);
    const body = await encryptPayload(
      { p256dh: uaPublic, auth },
      enc.encode("When I grow up, I want to be a watermelon"),
      { salt: b64urlDecode(salt), asKeyPair: { privateKey, publicKey } as CryptoKeyPair },
    );
    expect(b64urlEncode(body)).toBe(expected);
  });
});
