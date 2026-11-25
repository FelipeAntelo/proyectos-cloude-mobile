import {
  ArrowUpRight,
  Bell,
  BellRing,
  ChartLine,
  CircleAlert,
  House,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Settings2,
  Sun,
  Tag,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ago,
  api,
  ApiError,
  getToken,
  setToken,
  usd,
  type Dashboard,
  type OfferView,
  type SourceView,
  type Verification,
} from "./api";
import { currentSubscription, enablePush, isStandalone, pushSupported, resyncPush } from "./push";

type Tab = "home" | "offers" | "history" | "settings";
const THEME_KEY = "pwa-lab:price:theme";

// ------------------------------------------------------------------ primitivas

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-[var(--faint)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const VERIF_LABEL: Record<Verification, string> = {
  verified: "Verificado en tienda",
  discovered: "Descubierto · sin verificar",
  manual: "Carga manual",
  simulated: "Simulado",
};

function VerifBadge({ v }: { v: Verification }) {
  const filled = v === "verified";
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[12px] ${
        filled ? "border-[var(--fg)] text-[var(--fg)]" : "border-[var(--line)] text-[var(--muted)]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${filled ? "bg-[var(--fg)]" : "border border-[var(--muted)]"}`} />
      {VERIF_LABEL[v]}
    </span>
  );
}

const FRESH_LABEL: Record<SourceView["freshness"], string> = {
  verified: "Al día",
  stale: "Desactualizado",
  unavailable: "Sin datos",
  not_configured: "Sin credenciales",
  disabled: "Desactivada",
  manual: "Manual",
};

function FreshDot({ f }: { f: SourceView["freshness"] }) {
  const cls =
    f === "verified"
      ? "bg-[var(--fg)]"
      : f === "stale"
        ? "bg-[var(--faint)]"
        : "border border-[var(--faint)] bg-transparent";
  return <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function Button({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition-opacity active:opacity-70 disabled:opacity-40";
  const style =
    kind === "primary"
      ? "bg-[var(--strong)] text-[var(--on-strong)]"
      : "border border-[var(--line)] text-[var(--fg)]";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "block min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[16px] outline-none focus:border-[var(--fg)]";

function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div role="status" className="fade-in fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-20 rounded-xl bg-[var(--strong)] px-4 py-3 text-[14px] text-[var(--on-strong)]">
      {msg}
    </div>
  );
}

// ------------------------------------------------------------------ emparejamiento

function Pair({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ token: string }>("/api/auth/claim", { method: "POST", body: { code, label: "iPhone" } });
      setToken(r.token);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="safe mx-auto flex min-h-dvh max-w-md flex-col justify-center pb-10">
      <p className="text-[13px] uppercase tracking-[0.2em] text-[var(--faint)]">PRICE</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Vincular dispositivo</h1>
      <p className="mt-2 text-[15px] text-[var(--muted)]">
        Introduce el código de acceso que guardaste como <span className="font-mono">PRICE_SETUP_CODE</span> en GitHub.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Código de acceso">
          <input
            className={inputCls}
            type="password"
            autoComplete="current-password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            minLength={12}
          />
        </Field>
        {err && <p role="alert" className="text-[14px] text-[var(--fg)]"><CircleAlert className="mr-1 inline h-4 w-4" />{err}</p>}
        <Button type="submit" disabled={busy || code.length < 12}>{busy ? "Verificando…" : "Vincular"}</Button>
      </form>
    </main>
  );
}

// ------------------------------------------------------------------ inicio

function Home({ d, onCheck, checking }: { d: Dashboard; onCheck: () => void; checking: boolean }) {
  const item = d.products[0];
  if (!item) return <p className="mt-10 text-[var(--muted)]">Sin productos.</p>;
  const { product, best, bestAny, bestFinancing } = item;
  const shown = best ?? bestAny;
  const target = product.targetCents;
  const gap = shown?.deliveredCents != null && target != null ? shown.deliveredCents - target : null;
  const anyConfigured = d.sources.some((s) => s.kind !== "manual" && s.configured && s.enabled);

  return (
    <div className="fade-in">
      <p className="mt-6 text-[13px] text-[var(--muted)]">{product.name}</p>

      {shown ? (
        <>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="tnum text-[44px] font-semibold leading-none tracking-tight">{usd(shown.deliveredCents)}</span>
            {product.msrpCents != null && shown.deliveredCents != null && shown.deliveredCents < product.msrpCents && (
              <span className="tnum text-[15px] text-[var(--muted)] line-through">{usd(product.msrpCents)}</span>
            )}
          </div>
          <p className="mt-2 text-[15px]">
            {shown.store}
            <span className="text-[var(--muted)]">
              {" · "}
              {shown.inStock === true ? "Disponible" : shown.inStock === false ? "Agotado" : "Disponibilidad no confirmada"}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <VerifBadge v={shown.verification} />
            {!best && <span className="inline-flex h-6 items-center rounded-full border border-[var(--line)] px-2 text-[12px] text-[var(--muted)]">Sin precio verificado aún</span>}
          </div>

          <dl className="mt-6 divide-y divide-[var(--line)] border-y border-[var(--line)] text-[15px]">
            <div className="flex justify-between py-3">
              <dt className="text-[var(--muted)]">Contado + impuesto est. ({d.tax.ratePct}%)</dt>
              <dd className="tnum">{usd(shown.totalCents)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-[var(--muted)]">Financiación</dt>
              <dd className="tnum text-right">
                {bestFinancing
                  ? `${usd(bestFinancing.monthlyCents)}/mes · ${bestFinancing.months} meses · ${
                      bestFinancing.aprBps != null ? `${(bestFinancing.aprBps / 100).toFixed(2)}% APR` : "APR —"
                    }`
                  : "Sin datos verificables"}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-[var(--muted)]">Objetivo</dt>
              <dd className="tnum">
                {usd(target)}
                {gap != null && <span className="text-[var(--muted)]"> · {gap <= 0 ? "alcanzado" : `faltan ${usd(gap)}`}</span>}
              </dd>
            </div>
          </dl>

          <a
            href={shown.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--strong)] text-[16px] font-medium text-[var(--on-strong)] active:opacity-70"
          >
            Comprar en {shown.store} <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </>
      ) : (
        <div className="mt-6 border-y border-[var(--line)] py-6">
          <p className="text-[20px] font-medium">Todavía no hay precios</p>
          <p className="mt-2 text-[15px] text-[var(--muted)]">
            {anyConfigured
              ? "El monitor está consultando las fuentes. Los precios aparecerán aquí solo cuando estén verificados."
              : "Ninguna fuente automática tiene credenciales todavía. No se muestran precios hasta obtenerlos de una fuente real."}
          </p>
        </div>
      )}

      <Section
        title="Fuentes"
        action={
          <button onClick={onCheck} disabled={checking} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[14px] text-[var(--muted)] disabled:opacity-40" aria-label="Comprobar ahora">
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} aria-hidden /> Comprobar
          </button>
        }
      >
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {d.sources.map((s) => (
            <li key={s.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px]">
              <span className="flex items-center gap-2.5">
                <FreshDot f={s.freshness} />
                {s.name}
              </span>
              <span className="text-right text-[13px] text-[var(--muted)]">
                {FRESH_LABEL[s.freshness]}
                {s.lastSuccessAt ? ` · ${ago(s.lastSuccessAt, d.now)}` : ""}
                {s.lastError && s.freshness !== "verified" ? <span className="block">{s.lastError}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {d.alerts.length > 0 && (
        <Section title="Alertas recientes">
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {d.alerts.slice(0, 5).map((a) => (
              <li key={a.id} className="py-3">
                <p className="text-[15px]">{a.title}</p>
                <p className="text-[13px] text-[var(--muted)]">{a.body} · {ago(a.created_at, d.now)}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ofertas

function OfferRow({ o }: { o: OfferView }) {
  const notes = (o.checks.notes ?? []).filter(Boolean);
  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium">{o.store}</p>
          <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{o.title}</p>
        </div>
        <p className="tnum shrink-0 text-[17px] font-semibold">{usd(o.deliveredCents)}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--muted)]">
        <VerifBadge v={o.verification} />
        {o.match === "partial" && <span>Variante sin confirmar</span>}
        <span>{o.inStock === true ? "Disponible" : o.inStock === false ? "Agotado" : "Stock desconocido"}</span>
        {o.shippingCents != null && o.shippingCents > 0 && <span>incl. envío {usd(o.shippingCents)}</span>}
        {o.pendingPriceCents != null && <span>Confirmando {usd(o.pendingPriceCents)}</span>}
      </div>
      {notes.length > 0 && <p className="mt-1 text-[12px] text-[var(--faint)]">{notes.join(" · ")}</p>}
      <a href={o.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1 text-[14px] underline underline-offset-4">
        Ver oferta <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </li>
  );
}

function ManualOfferForm({ productId, onSaved, notify }: { productId: string; onSaved: () => void; notify: (m: string) => void }) {
  const [store, setStore] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [inStock, setInStock] = useState(true);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(price.replace(/[$,]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return notify("Precio inválido");
    setBusy(true);
    try {
      await api("/api/offers/manual", { method: "POST", body: { productId, store, url, priceCents: cents, inStock } });
      notify("Oferta guardada como carga manual");
      setStore(""); setUrl(""); setPrice("");
      onSaved();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 border-y border-[var(--line)] py-4">
      <p className="text-[13px] text-[var(--muted)]">Se guarda como "Carga manual", nunca como dato verificado.</p>
      <Field label="Tienda"><input className={inputCls} value={store} onChange={(e) => setStore(e.target.value)} required maxLength={60} /></Field>
      <Field label="Enlace (https)"><input className={inputCls} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} required /></Field>
      <Field label="Precio (USD)"><input className={`${inputCls} tnum`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required /></Field>
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" className="h-5 w-5 accent-current" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> Disponible
      </label>
      <Button type="submit" disabled={busy}>Guardar</Button>
    </form>
  );
}

function Offers({ d, reload, notify }: { d: Dashboard; reload: () => void; notify: (m: string) => void }) {
  const item = d.products[0];
  const [adding, setAdding] = useState(false);
  if (!item) return null;
  return (
    <div className="fade-in">
      <Section
        title={`Ofertas · ${item.offers.length}`}
        action={
          <button onClick={() => setAdding((v) => !v)} className="inline-flex min-h-11 items-center gap-1 px-2 text-[14px] text-[var(--muted)]">
            <Plus className="h-4 w-4" aria-hidden /> Manual
          </button>
        }
      >
        {adding && <ManualOfferForm productId={item.product.id} onSaved={() => { setAdding(false); reload(); }} notify={notify} />}
        {item.offers.length === 0 ? (
          <p className="py-6 text-[15px] text-[var(--muted)]">Sin ofertas registradas.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {item.offers.map((o) => <OfferRow key={o.id} o={o} />)}
          </ul>
        )}
      </Section>
      <Section title="Financiación">
        {item.financing.length === 0 ? (
          <p className="text-[15px] text-[var(--muted)]">Sin condiciones de financiación verificables registradas.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {item.financing.map((f) => (
              <li key={f.id} className="py-3 text-[14px]">
                <p className="font-medium">{f.store}{f.provider ? ` · ${f.provider}` : ""}</p>
                <p className="tnum text-[var(--muted)]">
                  {usd(f.monthlyCents)}/mes × {f.months ?? "?"} · APR {f.aprBps != null ? `${(f.aprBps / 100).toFixed(2)}%` : "—"} · total {usd(f.totalCents)}
                  {f.derived.length ? " (calculado)" : ""}
                </p>
                <p className="text-[12px] text-[var(--faint)]">{f.origin === "manual" ? "Carga manual" : "API"} · {f.originNote} · {ago(f.observedAt, d.now)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ historial

interface Point { price_cents: number | null; observed_at: number; store: string; offer_id: string }

function History({ productId, now }: { productId: string; now: number }) {
  const [pts, setPts] = useState<Point[] | null>(null);
  const [days, setDays] = useState(30);
  useEffect(() => {
    api<{ points: Point[] }>(`/api/products/${productId}/history?days=${days}`).then((r) => setPts(r.points)).catch(() => setPts([]));
  }, [productId, days]);

  // Serie del mejor precio en cada instante (mínimo de las ofertas vigentes).
  const series = useMemo(() => {
    if (!pts) return [];
    const current = new Map<string, number | null>();
    const out: Array<{ t: number; v: number }> = [];
    for (const p of pts) {
      current.set(p.offer_id, p.price_cents);
      const vals = [...current.values()].filter((v): v is number => v != null);
      if (vals.length) out.push({ t: p.observed_at, v: Math.min(...vals) });
    }
    if (out.length) out.push({ t: now, v: out[out.length - 1]!.v });
    return out;
  }, [pts, now]);

  const W = 343, H = 180, P = 8;
  let path = "";
  let minV = 0, maxV = 0;
  if (series.length > 1) {
    minV = Math.min(...series.map((s) => s.v));
    maxV = Math.max(...series.map((s) => s.v));
    const t0 = series[0]!.t, t1 = series[series.length - 1]!.t;
    const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
    const y = (v: number) => H - P - ((v - minV) / Math.max(1, maxV - minV)) * (H - 2 * P);
    path = series.map((s, i) => `${i === 0 ? "M" : `H${x(s.t).toFixed(1)} V`}${i === 0 ? `${x(s.t).toFixed(1)},${y(s.v).toFixed(1)}` : y(s.v).toFixed(1)}`).join(" ");
  }

  return (
    <div className="fade-in">
      <Section
        title="Mejor precio"
        action={
          <div role="group" aria-label="Rango" className="flex">
            {[7, 30, 90].map((n) => (
              <button key={n} onClick={() => setDays(n)} aria-pressed={days === n} className={`min-h-11 px-3 text-[14px] ${days === n ? "font-semibold" : "text-[var(--muted)]"}`}>{n} d</button>
            ))}
          </div>
        }
      >
        {pts === null ? (
          <p className="text-[var(--muted)]">Cargando…</p>
        ) : series.length < 2 ? (
          <p className="text-[15px] text-[var(--muted)]">Aún no hay suficiente historial verificado.</p>
        ) : (
          <figure>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Mejor precio entre ${usd(minV)} y ${usd(maxV)}`}>
              <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line)" />
              <path d={path} fill="none" stroke="var(--fg)" strokeWidth="1.75" strokeLinejoin="round" />
            </svg>
            <figcaption className="tnum mt-2 flex justify-between text-[13px] text-[var(--muted)]">
              <span>Mín. {usd(minV)}</span><span>Máx. {usd(maxV)}</span>
            </figcaption>
          </figure>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ ajustes

function Settings({ d, reload, notify, theme, setTheme, onLogout }: {
  d: Dashboard; reload: () => void; notify: (m: string) => void;
  theme: "dark" | "light"; setTheme: (t: "dark" | "light") => void; onLogout: () => void;
}) {
  const product = d.products[0]?.product;
  const [target, setTarget] = useState(product?.targetCents != null ? String(product.targetCents / 100) : "");
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentSubscription().then((s) => setPushOn(Boolean(s))).catch(() => setPushOn(false)); }, []);

  async function saveTarget() {
    if (!product) return;
    const cents = Math.round(Number(target.replace(/[$,]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents < 1000) return notify("Precio objetivo inválido");
    try { await api(`/api/products/${product.id}`, { method: "PATCH", body: { targetCents: cents } }); notify("Objetivo actualizado"); reload(); }
    catch (e) { notify((e as Error).message); }
  }
  async function turnOnPush() {
    setBusy(true);
    try { await enablePush(); setPushOn(true); notify("Notificaciones activadas"); }
    catch (e) { notify((e as Error).message); }
    finally { setBusy(false); }
  }
  async function testPush() {
    try { const r = await api<{ sent: number; failed: number }>("/api/push/test", { method: "POST" }); notify(r.sent ? "Prueba enviada" : `No se pudo enviar (${r.failed} fallos)`); }
    catch (e) { notify((e as Error).message); }
  }

  const standalone = isStandalone();
  return (
    <div className="fade-in">
      <Section title="Notificaciones">
        {!pushSupported() || !standalone ? (
          <p className="text-[15px] text-[var(--muted)]">
            En iPhone, las notificaciones solo funcionan con PRICE instalada: en Safari toca Compartir → "Agregar a inicio" y abre PRICE desde el ícono.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pushOn ? (
              <>
                <span className="inline-flex min-h-11 items-center gap-2 text-[15px]"><BellRing className="h-4 w-4" aria-hidden /> Activadas en este dispositivo</span>
                <Button kind="secondary" onClick={testPush}>Enviar prueba</Button>
              </>
            ) : (
              <Button onClick={turnOnPush} disabled={busy}><Bell className="h-4 w-4" aria-hidden /> Activar notificaciones</Button>
            )}
          </div>
        )}
      </Section>

      {product && (
        <Section title="Precio objetivo">
          <div className="flex gap-2">
            <input className={`${inputCls} tnum`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Precio objetivo en USD" />
            <Button kind="secondary" onClick={saveTarget}>Guardar</Button>
          </div>
          <p className="mt-2 text-[13px] text-[var(--muted)]">
            También se avisa de cualquier bajada sobre el último precio verificado, nuevas ofertas, vuelta a stock y mejor financiación.
            MSRP {usd(product.msrpCents)} ({product.msrpStatus === "verified" ? "verificado" : "provisional"}).
          </p>
        </Section>
      )}

      <Section title="Impuesto estimado">
        <p className="text-[15px]">{d.tax.place} · {d.tax.zip} · {d.tax.ratePct}%</p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">{d.tax.status === "verified" ? "Tasa verificada" : "Tasa pendiente de verificar con fuente oficial"}</p>
      </Section>

      <Section title="Apariencia">
        <div className="flex gap-2">
          <Button kind={theme === "dark" ? "primary" : "secondary"} onClick={() => setTheme("dark")}><Moon className="h-4 w-4" aria-hidden /> Oscuro</Button>
          <Button kind={theme === "light" ? "primary" : "secondary"} onClick={() => setTheme("light")}><Sun className="h-4 w-4" aria-hidden /> Claro</Button>
        </div>
      </Section>

      <Section title="Sesión">
        <Button kind="secondary" onClick={onLogout}><LogOut className="h-4 w-4" aria-hidden /> Desvincular este dispositivo</Button>
      </Section>
      <p className="mt-10 text-center text-[12px] text-[var(--faint)]">PRICE 0.1.0</p>
    </div>
  );
}

// ------------------------------------------------------------------ app

const TABS: Array<{ id: Tab; label: string; Icon: typeof House }> = [
  { id: "home", label: "Inicio", Icon: House },
  { id: "offers", label: "Ofertas", Icon: Tag },
  { id: "history", label: "Historial", Icon: ChartLine },
  { id: "settings", label: "Ajustes", Icon: Settings2 },
];

export function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState<Tab>("home");
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [theme, setThemeState] = useState<"dark" | "light">(() => {
    try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* */ }
  }, [theme]);

  const notify = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3200);
  }, []);

  const load = useCallback(async () => {
    try {
      setD(await api<Dashboard>("/api/dashboard"));
      setErr(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuthed(false);
      else setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    load();
    resyncPush();
    const id = window.setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [authed, load]);

  async function checkNow() {
    setChecking(true);
    try { await api("/api/check-now", { method: "POST" }); await load(); notify("Comprobación completada"); }
    catch (e) { notify((e as Error).message); }
    finally { setChecking(false); }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* */ }
    setToken(null);
    setAuthed(false);
    setD(null);
  }

  if (!authed) return <Pair onDone={() => setAuthed(true)} />;

  return (
    <>
      <main className="safe mx-auto max-w-xl pb-[calc(env(safe-area-inset-bottom)+88px)]">
        <header className="flex min-h-12 items-center justify-between pt-3">
          <span className="text-[13px] font-semibold uppercase tracking-[0.2em]">PRICE</span>
          {d && <span className="text-[12px] text-[var(--faint)]">Actualizado {ago(d.now)}</span>}
        </header>
        {err && <p role="alert" className="mt-4 text-[14px]"><CircleAlert className="mr-1 inline h-4 w-4" aria-hidden />{err}</p>}
        {!d ? (
          <p className="mt-10 text-[var(--muted)]">Cargando…</p>
        ) : tab === "home" ? (
          <Home d={d} onCheck={checkNow} checking={checking} />
        ) : tab === "offers" ? (
          <Offers d={d} reload={load} notify={notify} />
        ) : tab === "history" ? (
          d.products[0] ? <History productId={d.products[0].product.id} now={d.now} /> : null
        ) : (
          <Settings d={d} reload={load} notify={notify} theme={theme} setTheme={setThemeState} onLogout={logout} />
        )}
      </main>
      <Toast msg={toast} />
      <nav aria-label="Principal" className="nav-safe fixed inset-x-0 bottom-0 z-10 border-t border-[var(--line)] bg-[var(--bg)]">
        <ul className="mx-auto flex max-w-xl">
          {TABS.map(({ id, label, Icon }) => (
            <li key={id} className="flex-1">
              <button
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] ${tab === id ? "text-[var(--fg)]" : "text-[var(--faint)]"}`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={tab === id ? 2.2 : 1.8} aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
