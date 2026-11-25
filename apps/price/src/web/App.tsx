import { Bell, ChartLine, CircleAlert, House, Settings2, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ago, api, ApiError, getToken, setToken, type Dashboard } from "./api";
import { resyncPush } from "./push";
import { Alerts } from "./screens/Alerts";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { Offers } from "./screens/Offers";
import { Settings } from "./screens/Settings";
import { Button, Field, inputCls } from "./ui";

type Tab = "home" | "offers" | "history" | "alerts" | "settings";
const THEME_KEY = "pwa-lab:price:theme";
const TAB_KEY = "pwa-lab:price:tab";

const TABS: Array<{ id: Tab; label: string; Icon: typeof House }> = [
  { id: "home", label: "Inicio", Icon: House },
  { id: "offers", label: "Ofertas", Icon: Tag },
  { id: "history", label: "Historial", Icon: ChartLine },
  { id: "alerts", label: "Alertas", Icon: Bell },
  { id: "settings", label: "Ajustes", Icon: Settings2 },
];

function readLS(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function writeLS(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* almacenamiento no disponible */ }
}

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
      <p className="text-[13px] font-semibold uppercase tracking-[0.24em]">PRICE</p>
      <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em]">Vincular dispositivo</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">
        Introduce el código de acceso que guardaste como secreto <span className="font-mono text-[13px]">PRICE_SETUP_CODE</span>.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Código de acceso">
          <input className={inputCls} type="password" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} required minLength={12} />
        </Field>
        {err && <p role="alert" className="text-[14px]"><CircleAlert className="mr-1 inline h-4 w-4" aria-hidden />{err}</p>}
        <Button type="submit" disabled={busy || code.length < 12}>{busy ? "Verificando…" : "Vincular"}</Button>
      </form>
    </main>
  );
}

export function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTabState] = useState<Tab>(() => (TABS.some((t) => t.id === readLS(TAB_KEY)) ? (readLS(TAB_KEY) as Tab) : "home"));
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => (readLS(THEME_KEY) === "light" ? "light" : "dark"));

  const setTab = (t: Tab) => { setTabState(t); writeLS(TAB_KEY, t); window.scrollTo({ top: 0 }); };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0a0a0a" : "#fafafa");
    writeLS(THEME_KEY, theme);
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
      else setErr(navigator.onLine ? (e as Error).message : "Sin conexión. Se muestran los últimos datos cargados.");
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
      <main className="safe mx-auto max-w-xl pb-[calc(env(safe-area-inset-bottom)+92px)]">
        <header className="flex min-h-12 items-center justify-between pt-3">
          <span className="text-[13px] font-semibold uppercase tracking-[0.24em]">PRICE</span>
          {d && <span className="text-[12px] text-[var(--faint)]">Actualizado {ago(d.now)}</span>}
        </header>
        {err && <p role="alert" className="mt-3 text-[14px] text-[var(--muted)]"><CircleAlert className="mr-1 inline h-4 w-4" aria-hidden />{err}</p>}
        {!d ? (
          <p className="mt-10 text-[var(--muted)]">Cargando…</p>
        ) : tab === "home" ? (
          <Home d={d} onCheck={checkNow} checking={checking} />
        ) : tab === "offers" ? (
          <Offers d={d} reload={load} notify={notify} />
        ) : tab === "history" ? (
          d.products[0] ? <History productId={d.products[0].product.id} now={d.now} /> : null
        ) : tab === "alerts" ? (
          <Alerts d={d} reload={load} notify={notify} />
        ) : (
          <Settings d={d} notify={notify} theme={theme} setTheme={setTheme} onLogout={logout} />
        )}
      </main>
      {toast && (
        <div role="status" className="fade-in fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-20 mx-auto max-w-xl rounded-[12px] bg-[var(--strong)] px-4 py-3 text-[14px] text-[var(--on-strong)]">
          {toast}
        </div>
      )}
      <nav aria-label="Principal" className="nav-safe fixed inset-x-0 bottom-0 z-10 border-t border-[var(--line)] bg-[var(--bg)]">
        <ul className="mx-auto flex max-w-xl">
          {TABS.map(({ id, label, Icon }) => (
            <li key={id} className="flex-1">
              <button
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[10.5px] tracking-[0.01em] ${tab === id ? "text-[var(--fg)]" : "text-[var(--faint)]"}`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={tab === id ? 2.1 : 1.7} aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
