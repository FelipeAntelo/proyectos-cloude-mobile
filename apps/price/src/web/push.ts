import { api } from "./api";

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Debe llamarse desde un gesto del usuario (requisito de iOS). */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("Este navegador no soporta notificaciones push");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permiso de notificaciones denegado");
  const { publicKey } = await api<{ publicKey: string }>("/api/push/vapid-public-key");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) });
  }
  const json = sub.toJSON();
  await api("/api/push/subscribe", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys } });
}

/** Re-sincroniza la suscripción al abrir la app (iOS puede rotarla). */
export async function resyncPush(): Promise<void> {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const sub = await currentSubscription();
    if (!sub) return;
    const json = sub.toJSON();
    await api("/api/push/subscribe", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys } });
  } catch {
    /* no bloquear la UI */
  }
}
