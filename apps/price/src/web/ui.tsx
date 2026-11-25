import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { safeHref, type DataState, type SourceView } from "./api";

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-2 flex min-h-11 items-center justify-between">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--faint)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const STATE_LABEL: Record<DataState, string> = {
  verified: "Verificado",
  partial: "Parcialmente verificado",
  discovered: "Descubierto · sin verificar",
  stale: "Desactualizado",
  unavailable: "No disponible",
  manual: "Manual",
  simulated: "Simulado",
};

/** Marcador monocromo: relleno = verificado; anillo = no confirmado; gris = desactualizado. */
export function StateMark({ s }: { s: DataState }) {
  const dot =
    s === "verified"
      ? "bg-[var(--fg)]"
      : s === "stale"
        ? "bg-[var(--faint)]"
        : s === "partial"
          ? "border-2 border-[var(--fg)]"
          : s === "discovered"
            ? "border border-dashed border-[var(--muted)]"
            : "border border-[var(--muted)]";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${s === "verified" ? "text-[var(--fg)]" : "text-[var(--muted)]"}`}>
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {STATE_LABEL[s]}
    </span>
  );
}

export const FRESH_LABEL: Record<SourceView["freshness"], string> = {
  verified: "Al día",
  stale: "Desactualizado",
  unavailable: "Sin datos",
  not_configured: "Sin credenciales",
  disabled: "Desactivada",
  manual: "Manual",
  suspended: "Suspendida",
  backoff: "Reintentando",
};

export function FreshDot({ f }: { f: SourceView["freshness"] }) {
  const cls =
    f === "verified" ? "bg-[var(--fg)]" : f === "stale" || f === "backoff" ? "bg-[var(--faint)]" : "border border-[var(--faint)]";
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

export function Button({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  label?: string;
}) {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-[15px] font-medium transition-opacity duration-150 active:opacity-60 disabled:opacity-35";
  const style =
    kind === "primary"
      ? "bg-[var(--strong)] text-[var(--on-strong)]"
      : kind === "secondary"
        ? "border border-[var(--line)] text-[var(--fg)]"
        : "px-2 text-[var(--muted)]";
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={label} className={`${base} ${style}`}>
      {children}
    </button>
  );
}

export function ExtLink({ href, children, className = "" }: { href: string | null | undefined; children: ReactNode; className?: string }) {
  const safe = safeHref(href);
  if (!safe) return <span className={`text-[var(--faint)] ${className}`}>Enlace no disponible</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center gap-1 ${className}`}>
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "block min-h-11 w-full rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[16px] outline-none focus:border-[var(--fg)]";

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-[12px] text-[var(--faint)]">{hint}</span>}
      </span>
      <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="absolute inset-0 rounded-full border border-[var(--line)] bg-[var(--surface)] transition-colors peer-checked:border-[var(--fg)] peer-checked:bg-[var(--fg)] peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--fg)]" />
        <span className="absolute left-1 h-5 w-5 rounded-full bg-[var(--muted)] transition-transform duration-150 peer-checked:translate-x-5 peer-checked:bg-[var(--bg)]" />
      </span>
    </label>
  );
}

/** Barra de uso dibujada con SVG (sin estilos en línea: CSP estricta). */
export function Meter({ pct, label }: { pct: number; label: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="h-1 w-full" role="img" aria-label={label}>
      <rect x="0" y="0" width="100" height="4" rx="2" fill="var(--line)" />
      <rect x="0" y="0" width={w} height="4" rx="2" fill={w >= 80 ? "var(--fg)" : "var(--muted)"} />
    </svg>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="py-6">
      <p className="text-[17px] font-medium">{title}</p>
      {children && <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">{children}</p>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] bg-[var(--surface)] p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-11 rounded-[8px] px-3 text-[14px] ${value === v ? "bg-[var(--bg)] font-medium text-[var(--fg)]" : "text-[var(--muted)]"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
