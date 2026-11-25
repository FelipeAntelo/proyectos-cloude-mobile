import { Plus } from "lucide-react";
import { useState } from "react";
import { ago, api, usd, type Dashboard, type OfferView } from "../api";
import { Button, Empty, ExtLink, Field, inputCls, Section, Segmented, StateMark } from "../ui";

type Filter = "exact" | "pending" | "financing";

export function Offers({ d, reload, notify }: { d: Dashboard; reload: () => void; notify: (m: string) => void }) {
  const item = d.products[0];
  const [filter, setFilter] = useState<Filter>("exact");
  const [adding, setAdding] = useState(false);
  if (!item) return null;
  return (
    <div className="fade-in">
      <div className="mt-5 flex items-center justify-between gap-2">
        <Segmented
          label="Filtro"
          value={filter}
          onChange={setFilter}
          options={[
            ["exact", `Exactas ${item.offers.length}`],
            ["pending", `Pendientes ${item.opportunities.length}`],
            ["financing", "Financiación"],
          ]}
        />
        {filter === "exact" && (
          <Button kind="ghost" onClick={() => setAdding((v) => !v)} label="Añadir oferta manual">
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>

      {filter === "exact" && (
        <>
          {adding && <ManualOfferForm productId={item.product.id} onSaved={() => { setAdding(false); reload(); }} notify={notify} />}
          <Section title="Ordenadas por precio final">
            {item.offers.length === 0 ? (
              <Empty title="Sin ofertas exactas">Solo aparecen aquí las que coinciden en modelo, 256 GB, color, condición y desbloqueo.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--line)]">{item.offers.map((o) => <OfferRow key={o.id} o={o} now={d.now} />)}</ul>
            )}
          </Section>
        </>
      )}

      {filter === "pending" && (
        <Section title="Pendientes de verificación">
          <p className="mb-2 text-[13px] text-[var(--muted)]">
            Ofertas interesantes con algún atributo sin confirmar o descubiertas de forma indirecta. Verifícalas en la tienda antes de comprar.
          </p>
          {item.opportunities.length === 0 ? (
            <Empty title="Nada pendiente" />
          ) : (
            <ul className="divide-y divide-[var(--line)]">{item.opportunities.map((o) => <OfferRow key={o.id} o={o} now={d.now} />)}</ul>
          )}
        </Section>
      )}

      {filter === "financing" && (
        <Section title="Contado vs. financiado">
          {item.financing.length === 0 ? (
            <Empty title="Sin condiciones verificables">Ninguna API evaluada expone APR ni cuotas; se registran manualmente con procedencia y fecha.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {item.financing.map((f) => (
                <li key={f.id} className="py-3 text-[14px]">
                  <p className="font-medium">{f.store}{f.provider ? ` · ${f.provider}` : ""}</p>
                  <p className="tnum text-[var(--muted)]">
                    {usd(f.monthlyCents)}/mes × {f.months ?? "?"} · APR {f.aprBps != null ? `${(f.aprBps / 100).toFixed(2)}%` : "—"} · total {usd(f.totalCents)}
                    {f.derived.length ? " (calculado)" : ""}
                  </p>
                  <p className="text-[12px] text-[var(--faint)]">
                    {f.origin === "manual" ? "Manual" : "API"} · {f.originNote} · {ago(f.observedAt, d.now)}
                  </p>
                  {f.url && <ExtLink href={f.url} className="text-[13px] underline underline-offset-4">Condiciones oficiales</ExtLink>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

function OfferRow({ o, now }: { o: OfferView; now: number }) {
  const notes = (o.checks.notes ?? []).filter(Boolean);
  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium">{o.store}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-[var(--muted)]">{o.title}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-[17px] font-semibold">{usd(o.deliveredCents)}</p>
          {o.discountPct != null && o.discountPct > 0 && <p className="tnum text-[12px] text-[var(--muted)]">−{o.discountPct}%</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--muted)]">
        <StateMark s={o.state} />
        <span>{o.inStock === true ? "Disponible" : o.inStock === false ? "Agotado" : "Stock sin confirmar"}</span>
        {o.shippingCents != null && o.shippingCents > 0 && <span>incl. envío {usd(o.shippingCents)}</span>}
        {o.pendingPriceCents != null && <span>Confirmando {usd(o.pendingPriceCents)}</span>}
        <span className="text-[var(--faint)]">{ago(o.lastSeenAt, now)}</span>
      </div>
      {notes.length > 0 && <p className="mt-1 text-[12px] text-[var(--faint)]">{notes.join(" · ")}</p>}
      <ExtLink href={o.url} className="text-[14px] underline underline-offset-4">Ver oferta</ExtLink>
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
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-[12px] bg-[var(--surface)] p-4">
      <p className="text-[13px] text-[var(--muted)]">Se guarda como "Manual", nunca como dato verificado.</p>
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
