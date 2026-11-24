# RutaFiltro 0.9 — asistente Android para conductores de inDrive

Asistente que evalúa solicitudes de viaje según los criterios de rentabilidad del
conductor (tarifa mínima, Bs/km, tramos, zonas, filtros) y prepara la oferta
correspondiente, con un control flotante sobre otras apps.

> **Estado de integración con inDrive: NO EXISTE integración real.** No se encontró
> una API oficial o autorizada para leer solicitudes ni enviar ofertas. RutaFiltro
> funciona con (a) **simulador** de solicitudes y ofertas — todo marcado como
> SIMULADO — y (b) **entrada manual**: el conductor escribe lo que ve en inDrive y
> RutaFiltro calcula y *prepara* la oferta; el envío lo hace el conductor en inDrive.
> Ver [docs/INTEGRACION.md](docs/INTEGRACION.md).

## Origen del código

La versión anterior (`RutaFiltro-v07-Zonas.zip`) **no estaba disponible** en el
entorno de trabajo, ni tampoco `SpartanBot5.188.0.apk`, el APKM de inDrive 5.188.0
ni las capturas de SpartanBot. Por eso esta v0.8 se escribió desde cero sobre la
especificación funcional. Para fusionarla con la v0.7, ver la sección final de
[docs/INFORME.md](docs/INFORME.md).

## Compilar

Requisitos: JDK 17 o 21, Android SDK con `platforms;android-35` y `build-tools;35.0.0`.

```bash
cd android/rutafiltro
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew :app:assembleDebug          # APK: app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:testDebugUnitTest      # 122 pruebas (JVM + Robolectric)
./gradlew :app:lintDebug
```

Matriz de versiones fijada: [docs/COMPATIBILIDAD.md](docs/COMPATIBILIDAD.md). Capturas de las pantallas (generadas por las pruebas): [docs/capturas/](docs/capturas/).

## Instalar en el teléfono (debug)

1. Copiar `app-debug.apk` al teléfono (o `adb install -r app-debug.apk`).
2. Permitir "Instalar apps desconocidas" para el gestor de archivos usado.
   No hace falta desactivar Play Protect; si muestra un aviso por ser una app
   sin publicar, se puede elegir "Instalar de todos modos".
3. Abrir RutaFiltro → **Configuración** → conceder *Mostrar sobre otras apps* y
   *Notificaciones*.
4. **Inicio** → *Iniciar control flotante*. Aparece una burbuja movible.

El paquete debug es `com.rutafiltro.debug` y convive con una futura versión release.

## Secciones

| Sección | Qué hace |
|---|---|
| Inicio | Estado del motor, Activar/Pausar/Desactivar, perfil activo, origen de datos (Simulador/Manual), control flotante, últimas operaciones |
| Tarifas | Tarifa mínima, Bs/km, Bs/min (sumar u "otro mínimo"), contraoferta, decimales, importe máx. automático, intentos por sesión, recogida/llegada/trayecto máximos, calificación mínima, calculadora "Probar un viaje" |
| Tramos | Editor de tramos (agregar/editar/eliminar), banda completa o progresivo, tramos infinitos, validación de huecos/solapes, vista previa |
| Auto | Modo manual/automático, filtros de paradas y descripción, política ante datos desconocidos, limpiar descartados, rechazo agresivo, autorefresco |
| Zonas | Mapa real de Santa Cruz (MapLibre + OpenFreeMap/OSM), dibujo táctil de polígonos rojos/verdes/dorados, edición de vértices, prioridad, reglas doradas |
| Perfiles | Ciudad, Nocturno, Cortos, Largos, Personalizado; renombrar, duplicar (con zonas), restablecer, eliminar |
| Historial | Registro con regla determinante y Bs/km; mapa de demanda local |
| Configuración | Permisos, estado verificado de integraciones, privacidad, licencias |

## Novedades 0.9 (funciones observadas en el video de SpartanBot)

- **Tramos fijos**: cada tramo puede ser "precio fijo" (total del rango, p. ej. 0–3 km = Bs 12) o "por km"; se combinan.
- **Rechazar comentarios** por palabras clave (sin distinguir mayúsculas ni tildes).
- **Calidad del cliente**: viajes mínimos del pasajero.
- **Llegada preferida**: da prioridad (+2) sin descartar.
- **Intentos por viaje** con incremento en Bs cuando el pasajero no acepta (tope: importe máximo).
- **Audio del viaje**: tono + vibración al preparar/enviar una oferta.
- **Zonas con trazo libre**: se dibuja con el dedo y se simplifica a un polígono editable.

Análisis del video: [docs/ANALISIS-SPARTANBOT.md](docs/ANALISIS-SPARTANBOT.md).

## Reglas de cálculo (definidas, no supuestas)

```
distancia_total = recogida + trayecto          minutos_totales = llegada + duración
base     = máx( tarifa mínima, distancia_total × Bs/km, tarifa por tramos(distancia_total) )
exigida  = base                                 (precio por minuto: "No usar")
exigida  = base + minutos_totales × Bs/min      ("Sumar")
exigida  = máx( base, minutos_totales × Bs/min )("Otro mínimo")
redondeo = hacia arriba a Bs entero (o a 0,10 Bs con "Aceptar decimales")
```

- Precio del pasajero ≥ exigida → **aceptar** a ese precio. Si es menor →
  **contraoferta** a la exigida (o descartar si la contraoferta está apagada).
- Se muestran **Bs/km con pasajero** (precio / km de trayecto) y **Bs/km total**
  (precio / km incluida la recogida).
- Faltan precio, distancia de recogida o de trayecto, o hay valores negativos/NaN →
  **DATOS INSUFICIENTES**: nunca se oferta.
- Tramos con errores → no se calcula ni se oferta hasta corregirlos.

Semántica de cada modo especial: [docs/INFORME.md](docs/INFORME.md#semántica-de-los-modos-especiales).

## Arquitectura

```
app/src/main/java/com/rutafiltro/
├── domain/       entidades + reglas puras (FareCalculator, TierValidator, RuleEngine)
├── maps/         geometría (point-in-polygon, validación), ZoneDraft, mapa MapLibre, demanda
├── automation/   AutomationEngine (máquina de 7 estados), modelos de registro
├── integration/  RideSource / OfferSink + Simulador + Manual + catálogo de integraciones
├── data/         Room (perfiles, zonas, historial) + DataStore (preferencias)
├── overlay/      OverlayService (foreground) + burbuja + panel
└── ui/           Compose: tema, componentes, 8 pantallas, MainViewModel
app/src/test/     122 pruebas (ver docs/INFORME.md)
```

Un adaptador de integración futuro sólo implementa `RideSource` y `OfferSink`;
el motor de reglas no cambia.

## Privacidad

Sin credenciales de inDrive, sin telemetría, publicidad ni licencias. Todo queda
en el teléfono. Única conexión de red: descarga de teselas de mapa (OpenFreeMap).
