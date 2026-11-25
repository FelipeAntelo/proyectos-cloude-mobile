# PRICE — Fase 1: evaluación de herramientas, fuentes, arquitectura y alcance del MVP

Fecha: 2026-11-25 · Estado: **propuesta, pendiente de confirmación del usuario**

Este documento separa explícitamente lo **verificado** (probado o confirmado en
fuente oficial durante esta sesión) de lo **pendiente de verificar** (se
confirmará al registrar cuentas o al probar en el dispositivo). Nada de lo
descrito aquí está operativo todavía.

---

## 1. Herramientas realmente disponibles

| Herramienta | Disponible | Uso en PRICE | Verificado |
|---|---|---|---|
| Claude Code en la nube (esta sesión) | Sí | Escribir código, tests, build, commits y push a GitHub | Sí: Node 22.23, npm 10.9, git, Chromium + Playwright preinstalados |
| GitHub (repo `proyectos-cloude-mobile`) | Sí | Control de versiones, PRs, **GitHub Actions** como "computadora" de CI/CD | Sí: acceso de lectura/escritura vía MCP, puedo disparar workflows y leer logs |
| Red saliente del contenedor | **Restringida** | — | Sí: `api.cloudflare.com`, `api.bestbuy.com`, `api.ebay.com` → 403 del proxy |
| GitHub Actions | Sí (gratis en repos públicos; 2.000 min/mes en privados) | Tests + `wrangler deploy` a Cloudflare, migraciones D1 | Pendiente: primer workflow |
| Artifacts (Claude) | Sí | Prototipo visual interactivo (fase 4) | Sí |
| Safari iOS / app GitHub / app Cloudflare | Sí (tuyo) | Crear cuentas, tokens y *secrets*; instalar y probar la PWA | Requiere acción tuya |

**Conclusión:** no hace falta computadora. El flujo es:
`Claude Code (escribe y prueba) → GitHub (push) → GitHub Actions (build + deploy) → Cloudflare (corre 24/7)`.
Tú solo intervienes desde Safari para crear cuentas y pegar credenciales como
*secrets* de GitHub (nunca en el chat ni en el código).

Como el contenedor no llega a Cloudflare ni a las APIs de tiendas, **todas las
llamadas reales ocurren desde GitHub Actions o desde el propio Worker**. Esto
además es más seguro: las credenciales nunca pasan por esta sesión.

## 2. Hallazgo importante sobre el producto

Verificado en fuentes públicas (lanzamiento 12-ago-2026, a la venta 20-ago-2026):
el **Pixel 11 Pro XL 256 GB Obsidian desbloqueado cuesta USD 1.299** en Google
Store y Amazon. **USD 899 es el precio del Pixel 11 base**, no del Pro XL.

Consecuencia: con referencia 899 y objetivo 799, la alerta prácticamente nunca
saltaría (sería un 38 % de descuento sobre el precio real). Propuesta:
referencia = **1.299 (MSRP verificado)**, objetivo configurable (tú decides el
valor; se puede dejar 799). **Requiere tu confirmación.**

Fuentes: [Digital Citizen](https://www.digitalcitizen.life/google-pixel-11-pro-xl-1299-amazon-launch-price/),
[Google Store](https://store.google.com/product/pixel_11_pro?hl=en_US),
[TechRepublic](https://www.techrepublic.com/es/article/news-google-pixel-11-price/),
[9to5Google](https://9to5google.com/2026/08/12/pixel-11-pro-launches-for-1099/).

## 3. Viabilidad por fuente

Criterio: solo APIs oficiales, feeds de afiliados autorizados o carga manual.
**No** scraping de sitios que lo prohíben, **no** evasión de CAPTCHA/anti-bot.

| Tienda | Mecanismo permitido | Precio | Disponib. | Financ. | Frecuencia realista | Veredicto MVP |
|---|---|---|---|---|---|---|
| **Best Buy** | Products API oficial (API key) | Sí (`salePrice`, `regularPrice`) | Sí (online + tiendas por ZIP) | Parcial / no fiable | 5 min | **Sí** — riesgo: históricamente no emiten keys a emails gratuitos (Gmail) |
| **eBay** | Browse API oficial (OAuth app token) | Sí | Sí (cantidad) | No | 5 min (cuota ~5.000 llamadas/día) | **Sí** — filtrar `condition=NEW`; "sellado" depende del vendedor → se marca "no verificable" |
| **Amazon** | Creators API (sucesora de PA‑API 5, retirada en 2026) | Sí | Sí | No | Limitada por cuota | **Fase posterior** — requiere cuenta Associates aprobada con ventas calificadas |
| **Walmart** | Affiliate API (walmart.io, vía programa en Impact) | Sí | Sí | No | Cuota por key | **Fase posterior** — requiere aprobación de afiliado |
| **B&H / Adorama / Newegg** | Feeds de producto de redes de afiliados (CJ/Impact/Rakuten) | Sí | A veces | No | Diaria (no 5 min) | **Fase posterior** — requiere aprobación por tienda |
| **Google Store** | Sin API pública; scraping contrario a ToS | — | — | — | — | **Manual**: tú cargas la oferta, se marca "ingresado manualmente" |
| **Target** | Sin API pública (la interna no es de uso autorizado) | — | — | — | — | **Manual** |
| Agregadores pagos (Keepa, etc.) | API comercial | Sí | Sí | No | Alta | **No** sin tu autorización (son de pago) |

Notas de honestidad:
- Ninguna API oficial expone de forma fiable **APR, cuotas y requisitos de
  financiación**. Esos datos serán de carga manual (con fecha y fuente) o
  quedarán como "no disponible". Nunca se estiman.
- "Factory Unlocked" y "sin activación" se verifican por SKU/UPC y texto del
  título/atributos; si la fuente no lo permite, la oferta se marca
  **"no verificada"** y no dispara alerta de precio.
- 5 minutos es posible solo para Best Buy y eBay; cada adaptador declara su
  intervalo mínimo permitido y el scheduler lo respeta.

## 4. Plataforma: límites del plan gratuito de Cloudflare (verificado en docs oficiales)

- Workers Free: 100.000 requests/día; **5 Cron Triggers por cuenta**; 50
  subrequests por invocación.
- D1 Free: 5 M filas leídas/día, 500 MB por base; desde 1-sep-2026 las
  consultas fallan al superar el límite diario (no hay cobro sorpresa).
- Carga estimada de PRICE: 288 ejecuciones/día × pocas fuentes ≈ 1–2 k
  subrequests/día y < 10 k escrituras/día → **muy por debajo del límite. Costo: USD 0.**

Fuente: [Workers limits](https://developers.cloudflare.com/workers/platform/limits),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits),
[D1 enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/).

## 5. Web Push en iPhone 11

- iOS soporta Web Push desde 16.4 **solo para PWAs agregadas a la pantalla de
  inicio**; el iPhone 11 recibe iOS 26. El permiso debe pedirse con un toque del
  usuario dentro de la app instalada.
- El envío lo hace el Worker (VAPID + cifrado `aes128gcm` con WebCrypto, sin
  librerías) → **funciona con Claude y Safari cerrados**.
- Riesgos reales: Focus/Modo bajo consumo pueden retrasar avisos; iOS puede
  invalidar la suscripción → el backend detecta `404/410` y la marca como
  caducada, y la app la renueva al abrirse.

## 6. Arquitectura propuesta

```
            ┌──────────────── Cloudflare (gratis, 24/7) ────────────────┐
iPhone PWA ─┤ Worker "price"                                             │
(React+TS)  │  ├─ Static assets: la PWA (mismo origen, HTTPS)            │
            │  ├─ /api/*  REST (auth por token de dispositivo)           │
            │  ├─ scheduled() cada 5 min ─► Scheduler                    │
            │  │     └─ Adaptadores: bestbuy, ebay, manual, (amazon…)    │
            │  │        reintentos + backoff + cache + rate limit        │
            │  ├─ Matcher: modelo/almacenamiento/color/condición/unlock  │
            │  ├─ Evaluador de alertas + deduplicación                   │
            │  └─ Web Push (VAPID)                                       │
            │ D1: products, sources, offers, price_history, checks,      │
            │     alerts, push_subscriptions, settings                   │
            └────────────────────────────────────────────────────────────┘
GitHub ── Actions: tests → build → migraciones D1 → wrangler deploy
```

Decisiones:
1. **Un solo Worker sirve la PWA y la API** (mismo origen): sin CORS, el
   service worker y Push comparten scope, un único deploy.
2. **Adaptadores** con interfaz común (`search`, `fetchOffer`, `minInterval`,
   `capabilities`); agregar una tienda = un archivo + registro.
3. **Estados de dato**: `verified` (comprobado en la última ventana),
   `stale` (último éxito > 3 intervalos), `unavailable` (sin fuente o error),
   `manual` (cargado por el usuario), `simulated` (solo en tests/demo, con
   etiqueta visible). Cada tienda guarda su `last_success_at`.
4. **Alertas** con clave de deduplicación
   `(producto, tienda, tipo, precio redondeado, día)` + enfriamiento
   configurable; solo disparan sobre datos `verified`.
5. **Impuestos**: Manassas, VA → tasa configurable, precargada 6,0 %
   (4,3 % estatal + 0,7 % regional NoVA + 1,0 % local) — **pendiente de
   confirmar contra Virginia Tax** antes de mostrarla como dato verificado.
6. **Seguridad**: claves de tiendas y VAPID privada como *Worker secrets*
   (cargadas por Actions desde GitHub Secrets); el frontend nunca las ve. API
   protegida con un token de dispositivo (app de un solo usuario).
7. **Stack**: React + TypeScript + Vite + Tailwind + `lucide-react` (íconos
   empaquetados, sin CDN); Worker en TypeScript sin framework; Vitest +
   Miniflare para unit/integración; Playwright para e2e.

### Excepción a `CLAUDE.md`

Las reglas del laboratorio piden HTML/JS puro, sin build ni backend. El usuario
pidió explícitamente React/TS/Tailwind/Cloudflare, así que PRICE será una
**excepción acotada a `apps/price/`**: tendrá `package.json` y build **solo
dentro de esa carpeta**, se despliega en Cloudflare (no en GitHub Pages) y no
afecta a las otras apps. Se mantienen: manifest `manifest.webmanifest`, rutas
relativas, meta tags iOS, safe areas, 44 px táctiles, SW versionado, keys de
`localStorage` con prefijo `pwa-lab:price:`.

## 7. Alcance del MVP

**Incluido**
- Varios productos; Pixel 11 Pro XL 256 GB Obsidian Unlocked precargado.
- Adaptadores reales: Best Buy y eBay (sujetos a obtener las keys).
- Adaptador "manual" para Google Store, Target, Amazon, etc.
- Cron cada 5 min con intervalo por fuente; reintentos/backoff; registro de
  última comprobación exitosa por tienda.
- Historial y gráfico de precios; contado vs. financiado (financiación manual).
- Estimación de impuestos y costo total.
- Push: baja de precio, precio ≤ objetivo, nueva oferta, vuelta a stock;
  deduplicación; preferencias de notificación.
- UI monocromática, oscuro por defecto + claro, navegación inferior.
- Tests unit/integración/e2e y documentación.

**Fuera del MVP (fases siguientes)**: Amazon Creators API, Walmart, feeds de
afiliados (B&H/Adorama/Newegg), detección automática de financiación.

## 8. Plan de fases

| Fase | Entregable | Acción tuya |
|---|---|---|
| 1 | Este documento | Confirmar decisiones (sección 9) |
| 2 | Cuentas de fuentes: Best Buy + eBay | Registrarte (Safari) |
| 3 | Repo + Worker "hello" + D1 + CI/CD desplegado | Cuenta Cloudflare + token como GitHub Secret |
| 4 | Prototipo visual interactivo (Artifact) | Revisar diseño |
| 5 | Backend real: adaptadores, scheduler, historial | — |
| 6 | PWA real conectada a la API | Instalar en inicio |
| 7 | Push real con app y Claude cerrados | Activar notificaciones y confirmar recepción |
| 8 | Pruebas finales y documentación | — |

## 9. Decisiones que necesitan confirmación

1. Precio de referencia 1.299 (MSRP verificado) y valor del precio objetivo.
2. Aceptar la excepción a `CLAUDE.md` para `apps/price/`.
3. MVP con Best Buy + eBay automáticos y el resto manual.
