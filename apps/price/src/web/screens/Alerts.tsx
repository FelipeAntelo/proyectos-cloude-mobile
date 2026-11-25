import { useEffect, useState } from "react";
import { ago, api, usd, type AlertRow, type Dashboard, type NotificationPrefs } from "../api";
import { Button, Empty, ExtLink, inputCls, Section, Segmented, Toggle } from "../ui";

const TYPES: Array<[keyof NotificationPrefs, string, string?]> = [
  ["targetReached", "Precio objetivo alcanzado"],
  ["priceDrop", "Reducción de precio", "Respecto del último precio verificado"],
  ["allTimeLow", "Nuevo mínimo histórico"],
  ["newBest", "Nueva mejor oferta"],
  ["newStore", "Nueva tienda con disponibilidad"],
  ["newOffer", "Nueva oferta relevante"],
  ["backInStock", "Nuevamente en stock"],
  ["financing", "Mejora de financiación"],
  ["opportunities", "Oportunidades pendientes de verificación", "Se marcan como no verificadas"],
  ["discovered", "Ofertas descubiertas indirectamente", "Google Shopping vía SerpApi"],
  ["priceIncrease", "Subidas de precio"],
  ["system", "Estado del sistema", "Fallos prolongados, cuotas al 80 %, cambios de proveedor"],
];

export function Alerts({ d, reload, notify }: { d: Dashboard; reload: () => void; notify: (m: string) => void }) {
  const [view, setView] = useState<"history" | "settings">("history");
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const product = d.products[0]?.product;
  const [target, setTarget] = useState(product?.targetCents != null ? String(product.targetCents / 100) : "");

  useEffect(() => {
    api<{ alerts: AlertRow[] }>("/api/alerts").then((r) => setAlerts(r.alerts)).catch(() => setAlerts([]));
    api<{ notifications: NotificationPrefs }>("/api/settings").then((r) => setPrefs(r.notifications)).catch(() => {});
  }, []);

  async function setPref(k: keyof NotificationPrefs, v: boolean | number) {
    if (!prefs) return;
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    try { await api("/api/settings", { method: "PATCH", body: { notifications: { [k]: v } } }); }
    catch (e) { notify((e as Error).message); setPrefs(prefs); }
  }
  async function saveTarget() {
    if (!product) return;
    const cents = Math.round(Number(target.replace(/[$,]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents < 1000) return notify("Precio objetivo inválido");
    try { await api(`/api/products/${product.id}`, { method: "PATCH", body: { targetCents: cents } }); notify("Objetivo actualizado"); reload(); }
    catch (e) { notify((e as Error).message); }
  }

  return (
    <div className="fade-in">
      <div className="mt-5">
        <Segmented label="Vista" value={view} onChange={setView} options={[["history", "Historial"], ["settings", "Configuración"]]} />
      </div>

      {view === "history" ? (
        <Section title="Notificaciones">
          {alerts === null ? (
            <p className="text-[var(--muted)]">Cargando…</p>
          ) : alerts.length === 0 ? (
            <Empty title="Sin alertas todavía">Solo se notifica cuando algo cambia de verdad; las ofertas sin cambios no generan avisos repetidos.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {alerts.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[15px] font-medium">{a.title}</p>
                    <span className="shrink-0 text-[12px] text-[var(--faint)]">{ago(a.created_at, d.now)}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--muted)]">{a.body}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--faint)]">{a.pushed_at ? "Enviada al dispositivo" : "Registrada (sin envío push)"}</p>
                  {a.url && <ExtLink href={a.url} className="text-[13px] underline underline-offset-4">Ver oferta</ExtLink>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : (
        <>
          {product && (
            <Section title="Precio objetivo">
              <div className="flex gap-2">
                <input className={`${inputCls} tnum`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Precio objetivo en USD" />
                <Button kind="secondary" onClick={saveTarget}>Guardar</Button>
              </div>
              <p className="mt-2 text-[13px] text-[var(--muted)]">
                MSRP {usd(product.msrpCents)} ({product.msrpStatus === "verified" ? "verificado" : "provisional"}). Las alertas no se limitan al objetivo.
              </p>
            </Section>
          )}
          <Section title="Tipos de alerta">
            {!prefs ? (
              <p className="text-[var(--muted)]">Cargando…</p>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {TYPES.map(([k, label, hint]) => (
                  <Toggle key={k} label={label} hint={hint} checked={Boolean(prefs[k])} onChange={(v) => setPref(k, v)} />
                ))}
              </div>
            )}
          </Section>
          {prefs && (
            <Section title="Antispam">
              <p className="text-[14px] text-[var(--muted)]">
                Bajada mínima {usd(prefs.minDropCents)} o {prefs.minDropPct}% · no se repite una alerta de la misma oferta durante{" "}
                {Math.round(prefs.cooldownMinutes / 60)} h salvo que el precio mejore · máximo 5 avisos por comprobación.
              </p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
