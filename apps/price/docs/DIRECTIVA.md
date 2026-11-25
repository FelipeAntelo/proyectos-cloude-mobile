# PRICE — Directiva maestra y auditoría de cumplimiento

> Fuente principal de requisitos del proyecto (directiva del usuario del
> 2026-11-25). Se mantiene actualizada en cada fase. Las fases 1 y 2 están en
> `fase-1-evaluacion.md` y `fase-2-fuentes-y-backend.md`.

Leyenda: ✅ implementado y probado · 🟨 parcial · ⬜ pendiente · ⛔ bloqueado
(requiere acción externa) · ✖ no viable bajo las restricciones actuales.
"Probado" significa tests automatizados en el contenedor/CI; **nada está
verificado en producción todavía** (no hay despliegue).

## 1. Resumen de la directiva

PRICE es un sistema autónomo de monitoreo, descubrimiento, validación y
notificación de ofertas. Debe funcionar 24/7 sin Claude, Safari ni el iPhone
encendido; con **presupuesto operativo máximo de USD 0/mes** (solo planes
gratuitos, sin tarjetas, sin pruebas que caduquen, sin cuentas múltiples, sin
violar términos; si un proveedor deja de ser gratuito se suspende y se avisa).
Primer producto: Pixel 11 Pro XL · 256 GB · Obsidian · nuevo sellado · Factory
Unlocked · EE. UU. · destino Manassas, VA · USD · MSRP provisional 1.299 ·
promoción reportada 899 (pendiente de verificar en la variante exacta) ·
objetivo 799 configurable; alertas no limitadas al objetivo. Arquitectura:
React + TS + Tailwind + Lucide (PWA) · Cloudflare Workers + D1 + Cron ·
Web Push · GitHub Actions · workers.dev. Prioridades: (1) sostenibilidad de
cuotas, (2) USD 0, (3) seguridad, (4) despliegue, (5) primera integración
real, (6) primera push real, (7) diseño, (8) expansión de fuentes.

## 2. Auditoría (2026-11-25, tras la ronda de correcciones)

### Cuotas y presupuesto (prioridades 1 y 2)
| Requisito | Estado | Dónde / evidencia |
|---|---|---|
| Contadores persistentes de llamadas reales por proveedor (incl. reintentos, paginación, auxiliares como tokens OAuth) | ✅ | `quota.ts`, tabla `quota_usage`; test "cuenta reintentos y llamadas fallidas" |
| Ventanas hora/día/mes/ciclo con reinicio en el ciclo real del proveedor (eBay: medianoche del Pacífico; SerpApi: fecha de renovación real) | ✅ | `windowBounds`; tests de DST y ciclo |
| Sincronización con el proveedor (SerpApi Account API, gratuita) | ✅ código · ⛔ sin key | `adapters/serpapi.ts#syncQuota` |
| Reserva mínima 20 % que el automático nunca consume; manuales solo dentro de la reserva | ✅ | `planSource`; test de integración de reserva |
| Ritmo dinámico según cuota y tiempo restante hasta la renovación | ✅ | `planSource` (pace) |
| Reducción automática antes del límite; bloqueo hasta la renovación; reanudación automática | ✅ | test "espera a la renovación y se reanuda sola" |
| Exponential backoff con jitter + `Retry-After` + circuit breaker por proveedor | ✅ | `lib/http.ts`, `monitor.ts#runSource` |
| Aislamiento de fallos entre integraciones | ✅ | test "aislamiento" |
| Protección contra ejecuciones duplicadas (bloqueo con caducidad) | ✅ | `acquireLock`; test de concurrencia |
| Cuotas por segundo | 🟨 | Las llamadas son secuenciales (1 por fuente y ejecución); no se modela ventana por segundo |
| Caché / agrupación de consultas | 🟨 | Una llamada devuelve todas las variantes (Best Buy, eBay); no hay caché HTTP adicional (no aporta con 1 producto) |
| Simulación ≥ 365 días | ✅ (simulación) | `test/quota.test.ts`: 2 años, febreros de 28/29 días, 429, caídas, recorte del plan de 250 a 100 |
| Límites oficiales verificados | 🟨 | eBay 5.000/día ✅ oficial; SerpApi 250/mes y 50/h ✅ oficial; Best Buy ⚠ solo terceros (50.000/día, 5/s) → tope autoimpuesto 5.000/día |
| Coste USD 0 | ✅ diseño | Cloudflare Free no factura por uso; SerpApi Free no tiene cobro por exceso; sin tarjetas |
| Detección de cambio de condiciones del proveedor | ✅ (SerpApi) | Alerta `provider_change` si cambia la cuota del plan |
| CPU ≤ 10 ms por invocación (Free, incluido el cron) | ⬜ medir | Límite oficial confirmado. Se medirá en producción (observabilidad). Plan B sin coste: dividir el trabajo por fuente en invocaciones separadas |

### Monitoreo autónomo
| Requisito | Estado |
|---|---|
| Cron cada 5 min en servidor, independiente del iPhone | ✅ código · ⛔ despliegue |
| Frecuencias por fuente: Best Buy/eBay 5 min; SerpApi ~4 h | ✅ |
| Eventos comerciales (Black Friday–Cyber Monday + eventos configurables) aceleran solo si hay presupuesto | ✅ |
| Fuentes estables > 7 días con cuota mensual se espacian (×1,5) | ✅ |
| Frecuencia efectiva y última comprobación visibles | ✅ |
| Consultas manuales con límite (1 cada 2 min); el descubrimiento solo si se pide | ✅ |
| Prioridad por producto | ⬜ (un solo producto; el modelo lo admite) |

### Validación y calidad de datos
| Requisito | Estado |
|---|---|
| Estados: verificado, parcial, descubierto, desactualizado, no disponible, manual, simulado | ✅ (`offerState`) |
| Modelo, almacenamiento (ignora RAM), color, condición, desbloqueo, sin contrato/activación/trade-in | ✅ |
| Exclusión de usados/refurbished/renewed/open box, accesorios, operador | ✅ |
| Reputación de vendedor (eBay ≥ 98 % y ≥ 100 valoraciones) | ✅ |
| Oportunidades pendientes de verificación (no se descartan; alerta opcional diferenciada) | ✅ |
| Precios anómalos: rango plausible + confirmación en 2 comprobaciones | ✅ |
| Enlaces externos solo https (servidor y cliente) | ✅ |
| Nunca inventar datos | ✅ (tests e2e: estado vacío sin precios; manual no se presenta como verificado) |

### Financiación
| Requisito | Estado |
|---|---|
| Modelo completo (contado, cuota, plazo, APR, entrada, total, entidad, elegibilidad, condiciones, vigencia, enlace) | ✅ |
| Calculado vs. declarado vs. manual vs. no disponible | ✅ (`derived`, `origin`) |
| Obtención automática | ✖ no viable hoy: ninguna API evaluada expone APR/cuotas por producto |
| Precio promocional vs MSRP, % descuento, impuesto, envío, precio final | ✅ |
| Impuesto del destino verificado oficialmente | 🟨 6 % según Avalara y SalesTaxHandbook; falta fuente oficial (tax.virginia.gov) → marcado "sin confirmar" |

### Notificaciones
| Requisito | Estado |
|---|---|
| Web Push iOS (PWA instalada); RFC 8291/8292 | ✅ código: **reproduce byte a byte el vector oficial del RFC 8291**; JWT VAPID verificado · ⛔ prueba real en iPhone |
| Tipos: objetivo, bajada, mínimo histórico, mejor oferta, nueva tienda, stock, financiación, oportunidad, fallo prolongado, cuota al 80 %, cambio de proveedor (+ subida y nueva oferta) | ✅ |
| Deduplicación persistente, enfriamiento, máx. 5 por ejecución, una por oferta | ✅ |
| Tienda, precio anterior → nuevo, %, enlace, estado de verificación | ✅ |
| Configuración individual por tipo e historial | ✅ |
| Suscripciones expiradas (404/410) | ✅ revocación automática |
| Reintentos controlados de push | 🟨 un intento por alerta; los fallos quedan registrados |

### Seguridad
| Requisito | Estado |
|---|---|
| Autenticación (código de vinculación + sesión), expiración 180 d, revocación (salir / cerrar otras sesiones) | ✅ |
| Rate limiting y anti fuerza bruta (5 intentos/h por IP, 20/h global) | ✅ |
| Validación de entradas, CSRF (Origin), SSRF (endpoints push permitidos), XSS (React + CSP estricta sin inline) | ✅ |
| Cabeceras: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP | ✅ |
| Secretos solo en GitHub Secrets → Worker secrets; nunca en código, logs (redacción), artefactos ni chat | ✅ |
| Librería auditada vs. criptografía propia en Web Push | 🟨 Decisión: se mantiene la implementación propia sobre WebCrypto (primitivas nativas del runtime) porque reproduce el vector oficial del RFC; la librería de referencia (`web-push`) depende de Node y no es fiable en Workers |
| Privilegios mínimos del token de Cloudflare | ⬜ (al crearlo: solo Workers Scripts + D1) |

### Diseño, rendimiento y despliegue
| Requisito | Estado |
|---|---|
| Monocromo, oscuro/claro, Lucide, safe areas, 44 px, sin glassmorphism/neón/degradados | ✅ (e2e en viewport iPhone 11) |
| Estructura Inicio · Ofertas · Historial · Alertas · Ajustes (+ panel de salud) | ✅ |
| Rendimiento frontend | ✅ ~81 KB gzip JS, ~4 KB CSS |
| Retención y compactación de datos | ✅ (checks 30 d, alertas 365 d, cuotas 90 d, ofertas parciales inactivas 180 d; historial solo en cambios) |
| Despliegue real en workers.dev | ⛔ falta cuenta de Cloudflare |
| Primera integración comercial real | ⛔ faltan credenciales (eBay recomendado primero) |
| Push real con iPhone bloqueado | ⛔ requiere despliegue |

## 3. Decisiones registradas

- **SerpApi**: integrado de forma experimental y **desactivado por defecto**.
  - Uso: solo plan Free, un ciclo de 250 búsquedas con reserva de 50 (20 %), unas 4 h entre búsquedas automáticas y sin reintentos automáticos.
  - Legalidad: el mecanismo (resultados de Google obtenidos por SerpApi) **no está autorizado por Google**. El litigio Google v. SerpApi no está resuelto en el fondo. Por eso la activación es decisión explícita del usuario, que añade la key y activa la fuente.
  - Presupuesto por longitud de mes con 200 búsquedas automáticas: 28 d → 168 (4 h) · 29 d → 174 · 30 d → 180 · 31 d → 186. Todos caben, y sobran entre 14 y 32 para eventos comerciales.
- **Black Friday 2026 (26-nov → 30-nov)**: el monitor acelera solo cuando el presupuesto lo permite.
- **403 de Best Buy**: no se trata como credencial inválida, porque Best Buy lo usa también para el exceso de cuota. Solo el 401 pausa la fuente 6 h.
- **Gratuidad**: las condiciones actuales de los proveedores son gratuitas, pero pueden cambiar. El sistema detecta cambios de cuota en SerpApi y alerta. Para el resto, el panel de salud muestra el consumo real.
