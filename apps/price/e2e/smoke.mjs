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

await page.goto(BASE);
await page.getByLabel("Código de acceso").fill("codigo-incorrecto-123");
await page.getByRole("button", { name: "Vincular" }).click();
(await page.getByRole("alert").textContent())?.includes("incorrecto") ? ok("rechaza código incorrecto") : fail("no rechazó el código");

await page.getByLabel("Código de acceso").fill(CODE);
await page.getByRole("button", { name: "Vincular" }).click();
await page.getByText("Fuentes").waitFor();
ok("vinculación y panel");

const body = await page.textContent("body");
/\$\d/.test(body ?? "") && !body.includes("Carga manual") ? fail("aparece un precio sin fuente") : ok("sin precios inventados en estado vacío");
if (OUT) await page.screenshot({ path: `${OUT}/01-inicio-vacio.png` });

// Carga manual (dato honesto, etiquetado como manual)
await page.getByRole("button", { name: "Ofertas" }).click();
await page.getByRole("button", { name: "Manual" }).click();
await page.getByLabel("Tienda").fill("Google Store");
await page.getByLabel("Enlace (https)").fill("https://store.google.com/product/pixel_11_pro");
await page.getByLabel("Precio (USD)").fill("899");
await page.getByRole("button", { name: "Guardar" }).click();
await page.getByText("Oferta guardada").waitFor();
ok("carga manual de oferta");
if (OUT) await page.screenshot({ path: `${OUT}/02-ofertas.png` });

await page.getByRole("button", { name: "Inicio" }).click();
await page.getByText("Comprar en Google Store").waitFor();
(await page.getByText("Carga manual").count()) > 0 ? ok("la oferta manual se etiqueta como tal") : fail("falta etiqueta manual");
const href = await page.getByRole("link", { name: /Comprar en/ }).getAttribute("href");
href === "https://store.google.com/product/pixel_11_pro" ? ok("enlace directo de compra") : fail(`enlace incorrecto: ${href}`);
if (OUT) await page.screenshot({ path: `${OUT}/03-inicio.png` });

await page.getByRole("button", { name: "Ajustes" }).click();
await page.getByRole("button", { name: "Claro" }).click();
(await page.evaluate(() => document.documentElement.dataset.theme)) === "light" ? ok("modo claro") : fail("tema");
if (OUT) await page.screenshot({ path: `${OUT}/04-ajustes-claro.png` });

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

errors.length ? fail(`errores JS: ${errors.join(" | ")}`) : ok("sin errores JS");
await browser.close();
