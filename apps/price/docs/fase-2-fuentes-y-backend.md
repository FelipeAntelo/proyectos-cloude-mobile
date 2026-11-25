# PRICE — Fase 2: fuentes, descubrimiento, backend y costes

Fecha: 2026-11-25 · Estado: **backend implementado y probado en local; pendiente de despliegue y credenciales**

Leyenda: ✅ verificado (probado o en documentación oficial) · 🟡 reportado por
terceros / pendiente de confirmar · ❌ descartado.

---

## 1. ¿Existe o existió una oferta de USD 899 para el modelo exacto?

**Sí, y está vigente a fecha de hoy según varios medios (🟡, no verificada
directamente en tienda porque el contenedor no tiene acceso a esas webs).**

| Fuente | Qué dice |
|---|---|
| [Forbes, 23-nov-2026](https://www.forbes.com/sites/jaymcgregor/2026/11/23/google-pixel-11-pro-xl-price-black-friday-galaxy-s26-ultra-price/) | 256 GB Pixel 11 Pro XL a USD 899 en Amazon y Google Store (antes 1.299) |
| [Android Authority](https://www.androidauthority.com/google-pixel-11-pro-xl-deal-amazon-3736285/) | "record low", −400 USD |
| [Dealnews](https://www.dealnews.com/Unlocked-Google-Pixel-11-Pro-XL-256-GB-Smartphone-for-899-free-shipping/22427486.html) | Unlocked 256 GB a 899, mínimo histórico en Amazon |
| [Slickdeals](https://slickdeals.net/f/20338497-google-pixel-11-unlocked-smartphones-pixel-11-from-699-pixel-11-pro-from-749-pixel-11-pro-xl-from-899-free-s-h) | Pro XL "desde 899", envío gratis; variante de color variable |
| [Best Buy (ficha Olive)](https://www.bestbuy.com/product/google-pixel-11-pro-xl-256gb-unlocked-olive/J39TC82LXY) | "Black Friday Deal $899, Save $400" (ficha en color **Olive**, no Obsidian) |

Pendiente: confirmar que la promoción aplica al color **Obsidian** y que es
**nuevo + Factory Unlocked sin activación ni trade-in**. Varias publicaciones
mencionan trade-in u ofertas con tarjeta como *extra*, no como requisito, pero
eso debe verificarse en la tienda. Este es exactamente el caso que el monitor
debe resolver automáticamente cuando tenga credenciales.

Implicaciones aplicadas al diseño:
- La protección contra falsos positivos **no** retrasa una bajada de −31 %
  (1.299 → 899): solo exige confirmación de caídas > 40 % o < 45 % del MSRP.
- El MSRP (1.299, provisional) y el precio promocional se modelan por separado.

## 2. Fuentes directas (APIs oficiales)

| Fuente | Estado | Datos | Límites | Acción |
|---|---|---|---|---|
| **eBay Browse API** | ✅ API oficial, gratuita | precio, envío, vendedor, condición (`1000` = nuevo sin abrir, definición de eBay) | 5.000 llamadas/día; 1.000 tokens/día ([límites](https://developer.ebay.com/develop/api/buy/api_call_limits)) | **Registrarse ahora** |
| **Best Buy Products API** | ✅ API oficial | `salePrice`, `regularPrice`, `onlineAvailability`, color, condición | por key (verificar al registrarse) | **Intentar registro** — riesgo 🟡: en 2016 Best Buy dejó de emitir keys a emails gratuitos ([fuente](https://www.apievangelist.com/2016/03/30/best-buy-will-not-issue-api-keys-to-free-email-accounts-and-wants-to-get-to-know-your-company/)); no hay confirmación de que siga vigente |
| Amazon Creators API | 🟡 sucesora de PA-API 5 (retirada en 2026) ([aviso](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)) | precio, disponibilidad | requiere Associates con ventas calificadas | Bloqueado por requisito de ventas |
| Walmart Affiliate API | 🟡 vía programa de afiliados (Impact) ([términos](https://affiliates.walmart.com/terms)) | precio, stock | por key | Requiere aprobación como afiliado |

eBay: para pasar a claves de producción eBay exige suscribirse a las
notificaciones de *Marketplace Account Deletion* **o declarar la exención**
(no almacenamos datos de usuarios de eBay). La exención se declara en el
formulario web: es posible desde el iPhone.

## 3. Arquitectura complementaria de descubrimiento

Objetivo: encontrar ofertas en tiendas sin API directa (Google Store, Target,
B&H, Adorama, Newegg, Walmart…) **sin scraping propio ni evasión de controles**.
Todo lo que entra por esta capa se guarda como `verification = "discovered"`
(etiqueta visible "Descubierto · sin verificar") y nunca se presenta como
verificación comercial.

| Proveedor | Tipo | Coste / cuota gratuita | Cobertura | Restricciones y riesgos | Viabilidad |
|---|---|---|---|---|---|
| **SerpApi** (Google Shopping) | API de resultados de Google | Free **250 búsquedas/mes**, 50/h ([precios](https://serpapi.com/pricing)) · Starter 25 USD/1.000 | Muy amplia: casi todas las tiendas de EE. UU. con precio, tienda, enlace | ⚠ **No está autorizado por Google**: Google demandó a SerpApi (dic-2025) por eludir SearchGuard; la demanda DMCA fue desestimada en jul-2026 y el estado del recurso no está confirmado ([SEJ](https://searchenginejournal.com/court-dismisses-googles-dmca-claims-against-serpapi/583033), [Bloomberg Law](https://news.bloomberglaw.com/ip-law/google-lawsuit-against-data-scraper-tossed-over-authority-issue)) | Técnicamente la mejor; **legalmente gris** → requiere tu decisión |
| Serper / SearchAPI / DataForSEO / Bright Data | Igual que SerpApi | Serper ~2.500 consultas únicas; SearchAPI 100 únicas; DataForSEO depósito mínimo 50 USD; Bright Data ~5.000/mes 🟡 | Similar | Mismo problema de autorización de Google; cuotas gratuitas inestables | Igual o peor que SerpApi |
| **Sovrn Commerce** (Price Comparison API) | Red de afiliados (comparador autorizado) | Gratis para publishers aprobados | 🟡 "50.000+ merchants" | Requiere aprobación como publisher (sitio con contenido); una app personal probablemente no califica | Baja a corto plazo |
| **Impact.com** (catálogos de partner) | Feeds oficiales de afiliados | Gratis | Walmart y otras marcas del programa | Aprobación por marca; sincronización **diaria** (no 5 min) ([docs](https://integrations.impact.com/partner-api-reference/reference/catalogs)) | Media, lenta |
| CJ / Rakuten (B&H, Adorama, Newegg) | Feeds de afiliados | Gratis | Por tienda | Aprobación por tienda; feeds diarios | Media, lenta |
| Brave Search API | Búsqueda web independiente | ~5 USD de crédito mensual ([planes](https://api-dashboard.search.brave.com/app/plans)) | Web general, sin precios estructurados | No da precios fiables | ❌ |
| Keepa / PriceAPI | Comerciales | De pago | Amazon / multi | Requiere tu autorización de gasto | No por ahora |
| Google Content/Merchant API | Oficial | — | Solo para comerciantes (sus propios productos) | No sirve para consultar a terceros | ❌ |

**Recomendación**
1. **Ya**: Best Buy + eBay (directas, verificadas).
2. **Descubrimiento**: SerpApi en plan gratuito (250/mes ⇒ **una búsqueda cada
   ~3 h**, presupuesto codificado en 8/día), **solo si lo autorizas**
   sabiendo que no es un acceso autorizado por Google. La fuente está registrada
   pero **desactivada** (`sources.serpapi.enabled = 0`) y su adaptador **no se
   implementa hasta tener tu decisión**.
3. **En paralelo, a medio plazo**: solicitar Impact (Walmart) y Sovrn; si te
   aprueban, sustituyen a SerpApi con un canal autorizado.
4. Cuando una oferta descubierta aparece, se notifica como "posible oferta
   (sin verificar)" y se muestra el enlace a la tienda para comprobarla.

## 4. Financiación

Fuentes con información **pública y verificable** (para carga con procedencia):
- Google Store: Google Store Financing (Synchrony Bank), 0 % APR hasta 36 meses
  en compras elegibles; también Klarna y PayPal Pay Later
  ([Google Store](https://store.google.com/magazine/financing?hl=en-us)) 🟡.
- Best Buy: tarjeta My Best Buy (Citi), Upgrade Plus/Citizens Pay 🟡.
- Ninguna API oficial evaluada expone APR/cuotas para un producto concreto
  (la Products API de Best Buy no documenta campos de financiación).

Implementado: modelo completo (contado, cuota, nº de cuotas, APR, pago inicial,
coste total, entidad, elegibilidad, condiciones, enlace oficial, origen,
procedencia, fecha de observación, caducidad). Lo derivable (cuota por
amortización, coste total, intereses) se calcula y se marca como "calculado".
La carga manual **exige procedencia y fecha**. Alerta `financing_better` cuando
mejora el coste total, el APR o el plazo a 0 %.

## 5. Backend implementado (en `apps/price/src/worker`)

| Componente | Archivo | Detalle |
|---|---|---|
| Esquema D1 | `migrations/0001_init.sql` | productos, fuentes, ofertas, historial, financiación, checks, alertas, suscripciones, sesiones, rate limits, ajustes |
| Verificación de variante | `domain/matcher.ts` | modelo, 256 GB (ignora RAM), Obsidian, nuevo, desbloqueado, sin contrato/activación/trade-in; ante la duda → "parcial" (no alerta) |
| Alertas | `domain/alerts.ts` | objetivo (solo al cruzar), nuevo mejor precio, bajada vs último verificado (umbral 5 USD/1 %), nueva oferta, vuelta a stock; prioridad; enfriamiento 6 h salvo mejora real; dedupe por clave única |
| Anti falsos positivos | `domain/alerts.ts`, `adapters/ebay.ts` | rango de cordura, confirmación de caídas anómalas en 2 comprobaciones, vendedores eBay < 98 % o < 100 valoraciones no alertan, solo `match` + `verified` alertan automáticamente |
| Scheduler | `monitor.ts` | cron cada 5 min; intervalo efectivo = max(deseado, mínimo de la fuente, presupuesto diario); backoff exponencial 5 min → 6 h; `Retry-After`; errores de credencial → pausa 6 h; registro de cada comprobación |
| Reintentos HTTP | `lib/http.ts` | timeout 10 s, 2 reintentos con backoff + jitter en red/429/5xx |
| Adaptadores | `adapters/bestbuy.ts`, `adapters/ebay.ts` | contrato común; agregar una tienda = 1 archivo + registro |
| Web Push | `push/webpush.ts`, `notifier.ts` | VAPID ES256 + cifrado aes128gcm con WebCrypto, sin librerías; claves VAPID generadas y guardadas en el propio servidor; suscripciones caducadas (404/410) se revocan |
| API | `api/routes.ts` | panel, ofertas, historial, financiación, fuentes, ajustes, consulta manual (1 cada 2 min), push |
| Seguridad | `api/auth.ts`, `api/http.ts` | vinculación con código secreto (comparación en tiempo constante, 5 intentos/h por IP), tokens de sesión aleatorios guardados como hash, Bearer en todas las rutas privadas, comprobación de `Origin`, validación estricta de entradas, endpoints push restringidos a Apple/Google/Mozilla/Microsoft (anti-SSRF), cabeceras `no-store`/`nosniff` |
| Frontend mínimo funcional | `src/web` | vinculación, inicio (mejor precio, tienda, disponibilidad, contado + impuesto, financiación, objetivo, botón de compra), ofertas, historial, ajustes, push, modo claro/oscuro |

## 6. Consumo y costes previstos

Supuestos: 1 producto, Best Buy + eBay cada 5 min, SerpApi desactivado.

| Recurso | Consumo estimado | Límite gratuito | Uso |
|---|---|---|---|
| Ejecuciones del monitor | 288/día · **8.640/mes** | — | — |
| Workers requests | ~300 cron + ~200 de la app = ~500/día | 100.000/día | 0,5 % |
| Cron Triggers | 1 | 5 por cuenta | 20 % |
| Consultas D1 por ejecución | ~15–30 | 50 por invocación (Free) | ≤ 60 % |
| Filas escritas D1 | ≤ ~5.000/día (peor caso eBay) | 100.000/día | ≤ 5 % |
| Filas leídas D1 | ~50.000/día | 5.000.000/día | 1 % |
| Best Buy API | 288/día (tope configurado 2.000) | por key | — |
| eBay API | 288 + ~12 tokens/día = ~9.000/mes (tope 1.500/día) | 5.000/día | 6 % |
| SerpApi (si se autoriza) | 8/día · ~240/mes | 250/mes | 96 % |
| Web Push | ≤ 5 por ejecución; envíos reales esperados < 20/día | gratis (Apple/Google) | — |
| GitHub Actions | ~4–6 min por push a `apps/price` | ilimitado en repos públicos; 2.000 min/mes en privados | bajo |

Coste total esperado: **USD 0/mes**. Protecciones contra gastos inesperados:
- Cloudflare Free **no tiene facturación por uso**: al superar un límite las
  operaciones fallan (D1 aplica este bloqueo desde el 1-sep-2026), no se cobran.
  No hay que poner tarjeta.
- Presupuesto diario por fuente (`sources.daily_budget`); al agotarse, la fuente
  se pausa hasta medianoche UTC.
- Máximo 5 notificaciones por ejecución y enfriamiento de 6 h por oferta.
- Límites de frecuencia en la consulta manual y en las pruebas de push.

Riesgo identificado (🟡): el plan Free limita el **tiempo de CPU por
invocación** (10 ms según terceros, no confirmado en la documentación oficial).
El cifrado push y el parseo caben previsiblemente, pero se verificará con la
observabilidad de Cloudflare tras el despliegue. Si se excede, la alternativa
es Workers Paid (5 USD/mes): **solo con tu autorización**.

## 7. Pruebas

| Tipo | Archivo | Resultado (2026-11-25, contenedor) |
|---|---|---|
| Unitarias (matcher, alertas, financiación, impuestos, dinero, reintentos, adaptadores, Web Push con descifrado independiente) | `test/domain.test.ts`, `test/adapters.test.ts`, `test/webpush.test.ts` | ✅ |
| Integración (Worker real en workerd + D1 local: monitor, dedupe, backoff, presupuesto, API, auth, validación) | `test/integration.test.ts` | ✅ |
| Total | | **55/55** |
| End-to-end (Playwright, iPhone 11, contra `wrangler dev`) | `e2e/smoke.mjs` | ✅ 10/10: vinculación, código incorrecto, sin precios inventados, carga manual etiquetada, enlace de compra, modo claro, áreas táctiles ≥ 44 px, SW, sin errores JS |

Los fixtures de test (`test/fixtures.ts`) están marcados como **simulados** y
nunca se escriben en la base de producción.

**Aún no verificado** (requiere despliegue y credenciales): llamadas reales a
Best Buy/eBay, ejecución del cron en Cloudflare, push real en el iPhone.

## 8. Próximos pasos

| # | Quién | Acción | Desbloquea |
|---|---|---|---|
| 1 | Tú | Cuenta Cloudflare + token + secretos en GitHub | Despliegue 24/7 |
| 2 | Yo | Disparar el workflow y verificar el despliegue | URL de la app |
| 3 | Tú | Instalar en inicio, vincular, activar push, "Enviar prueba" | Criterio de aceptación push |
| 4 | Tú | Registro eBay (y Best Buy) → secretos | Primera fuente real |
| 5 | Yo | Verificar precios reales, variantes e historial | Criterios restantes del MVP |
| 6 | Tú | Decidir sobre SerpApi | Capa de descubrimiento |
