import { RefreshCw } from "lucide-react";
import { ago, duration, usd, type Dashboard } from "../api";
import { Empty, ExtLink, FreshDot, FRESH_LABEL, Section, StateMark } from "../ui";

export function Home({ d, onCheck, checking }: { d: Dashboard; onCheck: () => void; checking: boolean }) {
  const item = d.products[0];
  if (!item) return <Empty title="Sin productos monitoreados" />;
  const { product, best, bestAny, bestFinancing, opportunities } = item;
  const shown = best ?? bestAny;
  const target = product.targetCents;
  const gap = shown?.deliveredCents != null && target != null ? shown.deliveredCents - target : null;
  const auto = d.sources.filter((s) => s.kind !== "manual");
  const anyConfigured = auto.some((s) => s.configured && s.enabled);
  const lastOk = Math.max(0, ...auto.map((s) => s.lastSuccessAt ?? 0)) || null;

  return (
    <div className="fade-in">
      <p className="mt-5 text-[13px] text-[var(--muted)]">{product.name}</p>

      {shown ? (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tnum text-[46px] font-semibold leading-none tracking-[-0.03em]">{usd(shown.deliveredCents)}</span>
            {shown.discountPct != null && shown.discountPct > 0 && (
              <span className="tnum text-[15px] text-[var(--muted)]">
                −{shown.discountPct}% <span className="line-through">{usd(product.msrpCents)}</span>
              </span>
            )}
          </div>
          <p className="mt-3 text-[15px]">
            {shown.store}
            <span className="text-[var(--muted)]">
              {" · "}
              {shown.inStock === true ? "Disponible" : shown.inStock === false ? "Agotado" : "Disponibilidad no confirmada"}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <StateMark s={shown.state} />
            <span className="text-[12px] text-[var(--faint)]">Comprobado {ago(shown.lastSeenAt, d.now)}</span>
          </div>
          {!best && (
            <p className="mt-2 text-[13px] text-[var(--muted)]">Aún no hay un precio verificado directamente en tienda.</p>
          )}

          <dl className="mt-6 text-[15px]">
            <Row k={`Contado + impuesto est. (${d.tax.ratePct}%)`} v={usd(shown.totalCents)} />
            <Row
              k="Financiación"
              v={
                bestFinancing
                  ? `${usd(bestFinancing.monthlyCents)}/mes · ${bestFinancing.months ?? "?"} m · ${
                      bestFinancing.aprBps != null ? `${(bestFinancing.aprBps / 100).toFixed(2)}% APR` : "APR —"
                    }`
                  : "Sin datos verificables"
              }
            />
            <Row
              k="Objetivo"
              v={
                <>
                  {usd(target)}
                  {gap != null && <span className="text-[var(--muted)]"> · {gap <= 0 ? "alcanzado" : `faltan ${usd(gap)}`}</span>}
                </>
              }
            />
          </dl>

          <ExtLink
            href={shown.url}
            className="mt-6 flex min-h-12 w-full justify-center rounded-[12px] bg-[var(--strong)] text-[16px] font-medium text-[var(--on-strong)] active:opacity-70"
          >
            Comprar en {shown.store}
          </ExtLink>
        </>
      ) : (
        <Empty title="Todavía no hay precios">
          {anyConfigured
            ? "El monitor está consultando las fuentes. Los precios aparecerán solo cuando procedan de una fuente real."
            : "Ninguna fuente automática tiene credenciales todavía. No se muestran precios hasta obtenerlos de una fuente real."}
        </Empty>
      )}

      {opportunities.length > 0 && (
        <p className="mt-5 text-[14px] text-[var(--muted)]">
          {opportunities.length} {opportunities.length === 1 ? "oportunidad pendiente" : "oportunidades pendientes"} de verificación en Ofertas.
        </p>
      )}

      <Section
        title="Monitoreo"
        action={
          <button onClick={onCheck} disabled={checking} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[14px] text-[var(--muted)] disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} aria-hidden /> Comprobar
          </button>
        }
      >
        <p className="mb-2 text-[13px] text-[var(--faint)]">Última comprobación correcta {ago(lastOk, d.now)}</p>
        <ul className="divide-y divide-[var(--line)]">
          {d.sources.map((s) => (
            <li key={s.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px]">
              <span className="flex items-center gap-2.5">
                <FreshDot f={s.freshness} />
                {s.name}
              </span>
              <span className="text-right text-[13px] text-[var(--muted)]">
                {FRESH_LABEL[s.freshness]}
                {s.lastSuccessAt ? ` · ${ago(s.lastSuccessAt, d.now)}` : ""}
                {s.configured && s.enabled && s.effectiveIntervalS ? (
                  <span className="block text-[12px] text-[var(--faint)]">cada {duration(s.effectiveIntervalS)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-3 first:border-t">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd className="tnum text-right">{v}</dd>
    </div>
  );
}
