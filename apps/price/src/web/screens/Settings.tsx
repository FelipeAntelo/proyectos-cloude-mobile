import { Bell, BellRing, LogOut, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { ago, api, duration, until, usd, type Dashboard, type SystemView } from "../api";
import { currentSubscription, enablePush, isStandalone, pushSupported } from "../push";
import { Button, FreshDot, FRESH_LABEL, Meter, Section } from "../ui";

const KIND_LABEL = { hour: "hora", day: "día", month: "mes", cycle: "ciclo" } as const;

export function Settings({ d, notify, theme, setTheme, onLogout }: {
  d: Dashboard;
  notify: (m: string) => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  onLogout: () => void;
}) {
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [sys, setSys] = useState<SystemView | null>(null);
  useEffect(() => {
    currentSubscription().then((s) => setPushOn(Boolean(s))).catch(() => setPushOn(false));
    api<SystemView>("/api/system").then(setSys).catch(() => {});
  }, []);

  async function turnOnPush() {
    setBusy(true);
    try { await enablePush(); setPushOn(true); notify("Notificaciones activadas"); }
    catch (e) { notify((e as Error).message); }
    finally { setBusy(false); }
  }
  async function testPush() {
    try {
      const r = await api<{ sent: number; failed: number }>("/api/push/test", { method: "POST" });
      notify(r.sent ? "Prueba enviada. Bloquea el iPhone para comprobarla." : `No se pudo enviar (${r.failed} fallos)`);
    } catch (e) { notify((e as Error).message); }
  }
  async function delayedTest() {
    try {
      await api("/api/push/test", { method: "POST", body: { delayed: true } });
      notify("Programada. Cierra PRICE y bloquea el iPhone: llegará en ≤ 5 min.");
    } catch (e) { notify((e as Error).message); }
  }
  async function revokeOthers() {
    try { const r = await api<{ revoked: number }>("/api/sessions/revoke-others", { method: "POST" }); notify(`${r.revoked} sesiones cerradas`); }
    catch (e) { notify((e as Error).message); }
  }

  const standalone = isStandalone();
  return (
    <div className="fade-in">
      <Section title="Notificaciones">
        {!pushSupported() || !standalone ? (
          <p className="text-[14px] leading-relaxed text-[var(--muted)]">
            En iPhone solo funcionan con PRICE instalada: en Safari toca Compartir → "Agregar a inicio" y abre PRICE desde el ícono.
          </p>
        ) : pushOn ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-11 items-center gap-2 text-[15px]"><BellRing className="h-4 w-4" aria-hidden /> Activadas</span>
            <Button kind="secondary" onClick={testPush}>Enviar prueba</Button>
            <Button kind="secondary" onClick={delayedTest}>Prueba con la app cerrada</Button>
          </div>
        ) : (
          <Button onClick={turnOnPush} disabled={busy}><Bell className="h-4 w-4" aria-hidden /> Activar notificaciones</Button>
        )}
      </Section>

      <Section title="Apariencia">
        <div className="flex gap-2">
          <Button kind={theme === "dark" ? "primary" : "secondary"} onClick={() => setTheme("dark")}><Moon className="h-4 w-4" aria-hidden /> Oscuro</Button>
          <Button kind={theme === "light" ? "primary" : "secondary"} onClick={() => setTheme("light")}><Sun className="h-4 w-4" aria-hidden /> Claro</Button>
        </div>
      </Section>

      <Section title="Seguimiento">
        <dl className="text-[14px]">
          {d.products.map((p) => <KV key={p.product.id} k="Producto" v={p.product.name} />)}
          <KV k="Región · moneda" v="Estados Unidos · USD" />
          <KV k="Destino" v={`${d.tax.place} ${d.tax.zip}`} />
          <KV k="Impuesto estimado" v={`${d.tax.ratePct}% · ${d.tax.status === "verified" ? "verificado" : "sin confirmar con fuente oficial"}`} />
        </dl>
      </Section>

      <Section title="Estado del sistema">
        {!sys ? (
          <p className="text-[var(--muted)]">Cargando…</p>
        ) : (
          <>
            <dl className="text-[14px]">
              <KV k="General" v={sys.overall} />
              <KV k="Última ejecución del monitor" v={sys.monitor.lastCron ? ago(sys.monitor.lastCron.startedAt, sys.now) : "ninguna todavía"} />
              <KV k="Próxima ejecución" v={until(sys.monitor.nextCronAt, sys.now)} />
              {sys.event && <KV k="Evento comercial" v={sys.event} />}
              <KV k="Dispositivos con push" v={`${sys.push.subscriptions}${sys.push.lastDeliveredAt ? ` · última entrega ${ago(sys.push.lastDeliveredAt, sys.now)}` : ""}`} />
              <KV k="Coste operativo" v={`${usd(sys.cost.monthlyUsd * 100)}/mes`} />
            </dl>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--faint)]">{sys.cost.basis}</p>

            <ul className="mt-4 divide-y divide-[var(--line)]">
              {sys.sources.filter((s) => s.kind !== "manual").map((s) => (
                <li key={s.id} className="py-3 text-[14px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2.5 font-medium"><FreshDot f={s.freshness} />{s.name}</span>
                    <span className="text-[13px] text-[var(--muted)]">{FRESH_LABEL[s.freshness]}</span>
                  </div>
                  {s.configured && s.enabled && (
                    <p className="mt-1 text-[12px] text-[var(--muted)]">
                      Frecuencia efectiva {duration(s.effectiveIntervalS)} · último éxito {ago(s.lastSuccessAt, sys.now)} · próxima {until(Math.max(s.nextCheckAt, s.backoffUntil ?? 0), sys.now)}
                    </p>
                  )}
                  {s.quotas.map((q) => (
                    <div key={q.kind} className="mt-2">
                      <div className="tnum mb-1 flex justify-between text-[12px] text-[var(--muted)]">
                        <span>{q.used} / {q.limit} por {KIND_LABEL[q.kind]} · reserva {q.reserve}</span>
                        <span>renueva {until(q.resetsAt, sys.now)}</span>
                      </div>
                      <Meter pct={q.usagePct} label={`${q.usagePct}% de la cuota usada`} />
                    </div>
                  ))}
                  {!s.quotaVerified && s.quotaNote && <p className="mt-1 text-[11px] text-[var(--faint)]">{s.quotaNote}</p>}
                  {s.lastError && s.freshness !== "verified" && <p className="mt-1 text-[12px] text-[var(--muted)]">Último error: {s.lastError}</p>}
                  {s.suspendedReason && <p className="mt-1 text-[12px]">Suspendida: {s.suspendedReason}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-[var(--faint)]">
              Datos: {sys.storage.offers ?? 0} ofertas · {sys.storage.pricePoints ?? 0} puntos de historial · {sys.storage.alerts ?? 0} alertas. {sys.cloudflareUsage.note}
            </p>
          </>
        )}
      </Section>

      <Section title="Seguridad">
        <p className="mb-2 text-[13px] text-[var(--muted)]">{sys ? `${sys.sessions} ${sys.sessions === 1 ? "sesión activa" : "sesiones activas"}` : ""}</p>
        <div className="flex flex-wrap gap-2">
          <Button kind="secondary" onClick={revokeOthers}>Cerrar otras sesiones</Button>
          <Button kind="secondary" onClick={onLogout}><LogOut className="h-4 w-4" aria-hidden /> Desvincular</Button>
        </div>
      </Section>
      <p className="mt-10 text-center text-[12px] text-[var(--faint)]">PRICE 0.2.0</p>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2.5 first:border-t">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
