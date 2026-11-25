import { useEffect, useMemo, useState } from "react";
import { ago, api, usd } from "../api";
import { Empty, Section, Segmented } from "../ui";

interface Point {
  offer_id: string;
  price_cents: number | null;
  observed_at: number;
  store: string;
  source_id: string;
  verification: string;
}

export function History({ productId, now }: { productId: string; now: number }) {
  const [pts, setPts] = useState<Point[] | null>(null);
  const [days, setDays] = useState<"7" | "30" | "90" | "365">("30");
  useEffect(() => {
    setPts(null);
    api<{ points: Point[] }>(`/api/products/${productId}/history?days=${days}`).then((r) => setPts(r.points)).catch(() => setPts([]));
  }, [productId, days]);

  const { series, stores, changes } = useMemo(() => {
    const series: Array<{ t: number; v: number }> = [];
    const stores = new Map<string, { min: number; max: number; last: number | null }>();
    const changes: Array<{ t: number; store: string; from: number | null; to: number | null }> = [];
    if (!pts) return { series, stores, changes };
    const current = new Map<string, number | null>();
    for (const p of pts) {
      const prev = current.has(p.offer_id) ? current.get(p.offer_id)! : undefined;
      current.set(p.offer_id, p.price_cents);
      if (prev !== undefined && prev !== p.price_cents) changes.push({ t: p.observed_at, store: p.store, from: prev, to: p.price_cents });
      if (p.price_cents != null) {
        const s = stores.get(p.store) ?? { min: p.price_cents, max: p.price_cents, last: null };
        s.min = Math.min(s.min, p.price_cents);
        s.max = Math.max(s.max, p.price_cents);
        stores.set(p.store, s);
      }
      if (stores.has(p.store)) stores.get(p.store)!.last = p.price_cents;
      const vals = [...current.values()].filter((v): v is number => v != null);
      if (vals.length) series.push({ t: p.observed_at, v: Math.min(...vals) });
    }
    if (series.length) series.push({ t: now, v: series[series.length - 1]!.v });
    return { series, stores, changes: changes.reverse().slice(0, 10) };
  }, [pts, now]);

  const W = 343, H = 168, P = 6;
  let path = "", minV = 0, maxV = 0;
  if (series.length > 1) {
    minV = Math.min(...series.map((s) => s.v));
    maxV = Math.max(...series.map((s) => s.v));
    const t0 = series[0]!.t, t1 = series[series.length - 1]!.t;
    const x = (t: number) => (P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P)).toFixed(1);
    const y = (v: number) => (H - P - ((v - minV) / Math.max(1, maxV - minV)) * (H - 2 * P)).toFixed(1);
    path = series.map((s, i) => (i === 0 ? `M${x(s.t)},${y(s.v)}` : `H${x(s.t)} V${y(s.v)}`)).join(" ");
  }

  return (
    <div className="fade-in">
      <div className="mt-5">
        <Segmented label="Rango" value={days} onChange={setDays} options={[["7", "7 d"], ["30", "30 d"], ["90", "90 d"], ["365", "1 año"]]} />
      </div>
      <Section title="Mejor precio registrado">
        {pts === null ? (
          <p className="text-[var(--muted)]">Cargando…</p>
        ) : series.length < 2 ? (
          <Empty title="Aún no hay historial suficiente">Se registra un punto cada vez que un precio real cambia.</Empty>
        ) : (
          <figure>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Mejor precio entre ${usd(minV)} y ${usd(maxV)}`}>
              <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line)" />
              <path d={path} fill="none" stroke="var(--fg)" strokeWidth="1.75" strokeLinejoin="round" />
            </svg>
            <figcaption className="tnum mt-3 flex justify-between text-[13px] text-[var(--muted)]">
              <span>Mínimo {usd(minV)}</span>
              <span>Máximo {usd(maxV)}</span>
            </figcaption>
          </figure>
        )}
      </Section>

      {stores.size > 0 && (
        <Section title="Por tienda">
          <ul className="divide-y divide-[var(--line)]">
            {[...stores.entries()].sort((a, b) => a[1].min - b[1].min).map(([name, s]) => (
              <li key={name} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[14px]">
                <span>{name}</span>
                <span className="tnum text-right text-[var(--muted)]">
                  mín. {usd(s.min)} · máx. {usd(s.max)}
                  <span className="block text-[12px] text-[var(--faint)]">actual {s.last == null ? "no disponible" : usd(s.last)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {changes.length > 0 && (
        <Section title="Cambios recientes">
          <ul className="divide-y divide-[var(--line)]">
            {changes.map((c, i) => (
              <li key={i} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[14px]">
                <span>{c.store}<span className="block text-[12px] text-[var(--faint)]">{ago(c.t, now)}</span></span>
                <span className="tnum">{usd(c.from)} → {c.to == null ? "retirada" : usd(c.to)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
