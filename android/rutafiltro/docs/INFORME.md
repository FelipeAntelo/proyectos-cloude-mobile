# Informe de trabajo — RutaFiltro 0.9.0 (24-nov-2026)

> 0.9: funciones observadas en el video de SpartanBot (ver ANALISIS-SPARTANBOT.md):
> tramos fijos, palabras a rechazar, viajes mínimos, llegada preferida, intentos por viaje
> con incremento, audio del viaje y zonas con trazo libre. Pruebas: **122/122 OK**
> (nueva clase `domain.SpartanFeaturesTest` (10), 3 pruebas de reintentos en el motor y
> 2 de UI: trazo libre y tramo fijo).

## 1. Auditoría inicial

| Material pedido | Estado |
|---|---|
| `RutaFiltro-v07-Zonas.zip` | **Falta** (no está en el repo, adjuntos ni contenedor) |
| `SpartanBot5.188.0.apk` | **Falta** |
| APKM inDrive 5.188.0 (código 2040) | **Falta** |
| Capturas de SpartanBot | **Faltan** |

El repositorio `proyectos-cloude-mobile` sólo contenía PWAs; no había código
Android previo. Necesidad demostrada de crear el proyecto: se ubicó en
`android/rutafiltro/` sin tocar `apps/` ni las PWAs.

Entorno: JDK 21, Gradle 8.14 del sistema, **sin Android SDK** (instalado en esta
sesión) y **sin KVM** → no es posible ejecutar un emulador. Las pruebas de UI,
persistencia y servicio corren en JVM con Robolectric.

## 2. Semántica de los modos especiales

Definida aquí, no copiada de SpartanBot (no se pudo observar).

| Opción | Semántica implementada |
|---|---|
| Modo manual | Evalúa y **prepara** la oferta (precio, Bs/km). Nunca envía. La oferta preparada caduca a los 45 s o al pulsar "Listo". |
| Modo automático / "Ofertas sin intervención manual" | Envía **sólo** si el destino declara `canSendAutomatically` **y** el precio ≤ importe máximo automático **y** la solicitud no es ambigua **y** origen/destino coinciden (simulado↔simulado, real↔real). Hoy sólo el simulador cumple: se registra "Oferta SIMULADA". |
| Rechazo agresivo | Las solicitudes con datos insuficientes se **descartan** (en vez de quedar "Datos insuficientes" para revisión) y se ocultan si el origen lo permite. Límite: N descartes visuales por minuto (configurable, 30 por defecto). Nunca afecta a solicitudes válidas. |
| Limpiar viajes descartados | Llama a `dismiss()` del origen sólo si lo soporta (simulador sí, manual no). Comparte el límite por minuto. |
| Aceptar decimales | Apagado: la tarifa exigida se redondea **hacia arriba** a Bs entero. Encendido: a múltiplos de 0,10 Bs. El precio del pasajero no se altera. |
| Tramo fijo | El precio del tramo es el total del rango. Banda completa: si la distancia cae en un tramo fijo, la tarifa por tramos es ese total. Progresivo: un tramo fijo suma su total en cuanto la distancia entra en él. |
| Intentos por viaje | Solo si el origen informa que el pasajero no aceptó (`OfferDeclined`). Precio del reintento = último precio + incremento, redondeado, nunca sobre el importe máximo; cuenta para el límite por sesión. |
| Palabras a rechazar | Se rechaza si el comentario contiene alguna (minúsculas, sin tildes). Comentario desconocido: según la política de "Descripción". |
| Llegada preferida | Llegada ≤ preferida suma +2 de prioridad; nunca descarta. |
| Audio del viaje | Tono corto + vibración en ofertas preparadas o enviadas. |
| Trazo libre | El trazo se simplifica (Douglas-Peucker, 30 m, máx. 60 vértices) y queda como polígono editable; se puede deshacer. |
| Tramos infinitos | Encendido: el último tramo es abierto ("10 km o más"). Apagado: el último tramo tiene tope y una distancia mayor se **descarta** con la regla "Distancia fuera de los tramos". |
| Banda completa / progresivo | Banda: toda la distancia al precio del tramo donde cae el total. Progresivo: cada porción a su tramo. |
| Zona roja | Bloquea recogida, destino o ambos. |
| Zona verde | Suma su prioridad (1–5) si recogida y/o destino caen dentro; ordena solicitudes simultáneas. |
| Zona dorada | *No usar* / *Preferente* (suma prioridad) / *Exclusiva* (la recogida debe estar dentro; opción para exigir también el destino). Varias zonas doradas se combinan (basta con estar en una). |
| Coordenadas desconocidas | Si una zona activa necesita una coordenada ausente: descartar como "Datos insuficientes" (por defecto) o ignorar la regla de zona (configurable). |
| Punto en el borde de un polígono | Cuenta como **dentro**. |
| Polígono inválido guardado | Imposible desde la UI; si existiera (datos corruptos) se ignora en la evaluación. |
| Autorefresco | Sólo para orígenes que admiten refresco (hoy el simulador). Intervalo 2–60 s, respetando el mínimo del origen. Se suspende con motor pausado/desactivado o pantalla apagada. Nunca crea solicitudes en un origen real. |
| Viaje activo | Motor → PAUSADO; se reanuda solo al terminar el viaje **si** la pausa la causó el viaje. |
| Mapa de demanda | Sólo solicitudes registradas localmente (30 días), deduplicadas; mínimo 30 muestras y celdas de ≥3. Etiqueta "Estadística local", "Mixto" o "SIMULACIÓN". Simuladas excluidas por defecto. |

## 3. Pruebas ejecutadas — 107/107 OK

`./gradlew :app:testDebugUnitTest` (JDK 21, Robolectric SDK 34/35)

| Clase | Pruebas | Cubre |
|---|---|---|
| `domain.FareCalculatorTest` | 12 | mínima, distancia total con recogida, banda/progresivo, bordes de tramo, tramo no cubierto, tiempo sumado / otro mínimo, datos faltantes/NaN/negativos, redondeo (incl. 0,1×3), Bs/km |
| `domain.TierValidatorTest` | 10 | huecos, solapes, inicio ≠ 0, precio/rango inválidos, tramo abierto intermedio, coherencia "infinitos", orden libre |
| `domain.RuleEngineTest` | 19 | aceptar, contraoferta, rechazo sin contraoferta, importe máx. automático, precio ausente, recogida/llegada/trayecto/calificación/paradas/descripción, zonas rojas por extremo, coordenadas desconocidas, doradas exclusivas y múltiples, prioridad verde, polígono inválido ignorado, determinismo |
| `maps.GeometryTest` | 7 | point-in-polygon (convexo, cóncavo, borde, vértice), Santa Cruz real, haversine, autointersección |
| `maps.PolygonValidatorTest` | 7 | pocos vértices, colineales, duplicados, "moño", coordenada inválida, tamaño |
| `automation.AutomationEngineTest` | 22 | transiciones de estado, manual nunca envía, envío simulado etiquetado, duplicados, límite por sesión (y dentro de una ráfaga), datos insuficientes nunca enviados, rechazo agresivo con tope/minuto, viaje activo, pausa del usuario, error crítico y reinicio, 3 fallos sin reintentos, simulado nunca a destino real, ráfaga de 300, sobrecarga contabilizada, prioridad en simultáneas, autorefresco/pantalla apagada, **concurrencia real 8 hilos × 50 eventos** |
| `data.PersistenceTest` | 8 | perfiles semilla, ida y vuelta de ajustes, zonas por perfil + duplicado + borrado en cascada, zona inválida no se guarda, último perfil no borrable, tope de historial, JSON corrupto → valores seguros, DataStore |
| `ui.PureUiLogicTest` | 7 | edición de tramos sin huecos, editor de vértices (agregar/seleccionar/mover/deshacer/borrar), demanda (mínimos, etiquetas, deduplicación), filtros de historial, decimales con coma, JSON con campos futuros |
| `ui.ScreensUiTest` | 7 | calculadora de Tarifas, editor de Tramos, error de hueco, botones de Inicio por estado y "Oferta SIMULADA registrada", dibujo y guardado de zona, estado honesto de integración, demanda insuficiente |
| `ui.AppIntegrationUiTest` | 2 | grafo real Room+DataStore+motor+simulador desde la UI; cambio de perfil cambia reglas |
| `overlay.OverlayServiceTest` | 3 | foreground + notificación persistente, burbuja en WindowManager, pausar/reanudar/detener desde la notificación, sin permiso se detiene, pantalla apagada suspende autorefresco |
| `overlay.OverlayPanelUiTest` | 1 | burbuja, activar/pausar desde panel, cerrar panel no detiene el motor, detener servicio |
| `ui.ScreenshotTest` | 2 | capturas reales de las 8 secciones y del panel (`app/build/screenshots/`) |

Además: `./gradlew :app:lintDebug` → **0 errores** (advertencias: versiones más
nuevas disponibles, reglas de backup, Locale constante).

## 4. Errores encontrados y resueltos

1. **Ráfagas perdían solicitudes en silencio** (300 simultáneas → 44 perdidas en el buffer del simulador). El simulador ahora cede el hilo entre emisiones y el motor cuenta y muestra "Perdidas por sobrecarga".
2. **DataStore duplicado por archivo** podía lanzar `IllegalStateException`. Ahora hay una instancia única por archivo.
3. **Fallos de E/S en segundo plano** podían cerrar la app. `appScope` tiene `CoroutineExceptionHandler`.
4. **Panel flotante con textos negros** sobre fondo oscuro (detectado en las capturas): se fija el color de contenido en la ventana del overlay.
5. Botón "Desactivar" partido en dos líneas en pantallas de 393 dp; "Intentos 0/∞" con el motor apagado. Corregidos.
6. Entorno: Android SDK ausente y `dl.google.com` bloqueado (se habilitó con permiso); 429 de Maven Central (reintentos + espejo de Google con verificación SHA-1).

## 5. Limitaciones y pendientes (precisos)

- **Sin integración real con inDrive** (ver INTEGRACION.md). El modo automático sólo envía en el simulador.
- **No probado en emulador ni en dispositivo físico** (sin KVM en el entorno). Pendiente verificar en un teléfono: permiso de superposición, arrastre de la burbuja, teclado en el panel (modo manual), notificación en Android 13/14/15.
- **Mapa MapLibre no ejecutado**: no corre en JVM. Compila y su lógica (vértices, validación, point-in-polygon) está probada, pero la renderización de teselas, el toque sobre el mapa y la atribución deben verificarse en el teléfono. Requiere internet para las teselas (sin modo offline).
- Edición de vértices por "tocar para seleccionar y tocar para mover" (no arrastre). No se pueden insertar vértices entre dos existentes.
- El mapa de demanda sólo es útil con suficientes solicitudes **reales** registradas (entrada manual); con simulador muestra datos sintéticos etiquetados.
- APK debug de 62 MB (librerías nativas de MapLibre para 4 ABI). Para distribución: App Bundle o `abiFilters`.
- Sin firma release ni ofuscación configuradas.
- Perfiles por horario: el perfil "Horario nocturno" existe, pero el cambio automático por hora no está implementado (cambio manual desde Inicio o el panel).

## 6. Fusión con la v0.7 (cuando esté disponible)

Subir el zip y comparar: el motor (`domain/`, `automation/`) es independiente de la
UI; las pantallas de la v0.7 que funcionen pueden reemplazar a las de `ui/screens`
llamando a `MainViewModel`. Mantener la matriz de `COMPATIBILIDAD.md`.
