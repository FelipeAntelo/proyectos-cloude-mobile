// Prueba end-to-end contra un Worker en ejecución (wrangler dev o el despliegue).
// Uso: BASE_URL=http://localhost:8787 SETUP_CODE=... node e2e/smoke.mjs [carpeta-capturas]
import { createRequire } from "node:module";
// require() respeta NODE_PATH (Playwright preinstalado globalmente en CI/contenedor).
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const CODE = process.env.SETUP_CODE;
const OUT = process.argv[2];
if (!CODE) throw new Error("Falta SETUP_CODE");

const fail = (m) => { console.error("✗", m); process.exitCode = 1; };
const ok = (m) => console.log("✓", m);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 11"], colorScheme: "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/status of 401/.test(m.text())) errors.push(m.text()); });

await page.goto(BASE);
await page.getByLabel("Código de acceso").fill("codigo-incorrecto-123");
await page.getByRole("button", { name: "Vincular" }).click();
(await page.getByRole("alert").textContent())?.includes("incorrecto") ? ok("rechaza código incorrecto") : fail("no rechazó el código");

await page.getByLabel("Código de acceso").fill(CODE);
await page.getByRole("button", { name: "Vincular" }).click();
await page.getByText("Monitoreo").waitFor();
ok("vinculación y panel");

const body = await page.textContent("body");
/\$\d/.test(body ?? "") ? fail("aparece un precio sin fuente") : ok("sin precios inventados en estado vacío");
if (OUT) await page.screenshot({ path: `${OUT}/01-inicio-vacio.png` });

// Carga manual (dato honesto, etiquetado como manual)
await page.getByRole("button", { name: "Ofertas" }).click();
await page.getByRole("button", { name: "Añadir oferta manual" }).click();
await page.getByLabel("Tienda").fill("Google Store");
await page.getByLabel("Enlace (https)").fill("https://store.google.com/product/pixel_11_pro");
await page.getByLabel("Precio (USD)").fill("899");
await page.getByRole("button", { name: "Guardar" }).click();
await page.getByText("Oferta guardada").waitFor();
ok("carga manual de oferta");
if (OUT) await page.screenshot({ path: `${OUT}/02-ofertas.png` });

await page.getByRole("button", { name: "Inicio" }).click();
await page.getByText("Comprar en Google Store").waitFor();
(await page.getByText("Manual", { exact: true }).count()) > 0 ? ok("la oferta manual se etiqueta como tal") : fail("falta etiqueta manual");
(await page.getByText("Aún no hay un precio verificado").count()) > 0 ? ok("no se presenta como verificado") : fail("dato manual presentado como verificado");
const href = await page.getByRole("link", { name: /Comprar en/ }).getAttribute("href");
href === "https://store.google.com/product/pixel_11_pro" ? ok("enlace directo de compra") : fail(`enlace incorrecto: ${href}`);
if (OUT) await page.screenshot({ path: `${OUT}/03-inicio.png` });

await page.getByRole("button", { name: "Alertas" }).click();
await page.getByRole("radio", { name: "Configuración" }).click();
await page.getByText("Nuevo mínimo histórico").waitFor();
ok("configuración de alertas por tipo");
if (OUT) await page.screenshot({ path: `${OUT}/04-alertas.png` });

await page.getByRole("button", { name: "Ajustes" }).click();
await page.getByText("Estado del sistema").waitFor();
await page.getByText("Coste operativo").waitFor();
ok("panel de salud y consumo");
if (OUT) await page.screenshot({ path: `${OUT}/05-ajustes.png`, fullPage: true });
await page.getByRole("button", { name: "Claro" }).click();
(await page.evaluate(() => document.documentElement.dataset.theme)) === "light" ? ok("modo claro") : fail("tema");
if (OUT) await page.screenshot({ path: `${OUT}/06-claro.png` });

// Accesibilidad básica: áreas táctiles ≥ 44px en botones y enlaces visibles
const small = await page.evaluate(() =>
  [...document.querySelectorAll("button, a")]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ t: el.textContent?.trim(), h: el.getBoundingClientRect().height }))
    .filter((x) => x.h < 44),
);
small.length ? fail(`áreas táctiles < 44px: ${JSON.stringify(small)}`) : ok("áreas táctiles ≥ 44px");

const sw = await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration()));
sw ? ok("service worker registrado") : console.log("· service worker no registrado (requiere https o localhost)");

const csp = (await page.request.get(BASE)).headers()["content-security-policy"] ?? "";
csp.includes("script-src 'self'") ? ok("CSP estricta servida") : console.log("· CSP no servida por este servidor (wrangler dev puede no aplicar _headers)");
errors.length ? fail(`errores JS/CSP: ${errors.join(" | ")}`) : ok("sin errores JS ni violaciones CSP");
await browser.close();
