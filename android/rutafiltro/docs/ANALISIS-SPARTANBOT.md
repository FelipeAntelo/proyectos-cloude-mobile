# Análisis de SpartanBot (a partir de un video de pantalla, 7 min, 23-nov-2026)

No se analizó el APK (no fue posible subirlo). Todo lo siguiente es **comportamiento
observable** en el video; no se copió código, textos de marca ni recursos gráficos.

## Cómo se integra con inDrive

Indicios de que SpartanBot es una **versión modificada (re-empaquetada) de la app de inDrive**:

- Nombre del archivo `SpartanBot5.188.0.apk` = misma versión que inDrive 5.188.0.
- Los avisos emergentes de la pantalla de Zonas ("Saved area", "Dibuja con el dedo sobre el mapa")
  llevan el ícono de inDrive: el código se ejecuta dentro del proceso de inDrive.
- El mapa de zonas es Google Maps (el SDK que usa inDrive).
- Opción "Diseño de la lista de viajes — Automático (servidor de inDrive)": altera una
  configuración interna de inDrive.
- Suscripción ("32 días", "Renovar", ID de usuario) y "Configuración remota restaurada":
  licencia controlada por un servidor.

**No se replica ese mecanismo**: implica modificar y redistribuir código propietario de
inDrive y saltar su firma/integridad (prohibido por las reglas del proyecto y con alto
riesgo de bloqueo de cuenta). RutaFiltro sigue siendo una app independiente.

## Funciones observadas → estado en RutaFiltro 0.9

| SpartanBot (video) | RutaFiltro 0.9 |
|---|---|
| Tarifas y filtros: precio por km, precio mínimo, precio por tiempo | Ya existía (Tarifas) |
| Radio de operación: distancia al punto A, distancia del punto B | Recogida máx. y Trayecto máx. |
| Llegada preferida / Pickup máximo | **Nuevo**: llegada preferida (prioridad) + llegada máx. |
| Calidad del cliente: calificación mínima, viajes mínimos | **Nuevo**: viajes mínimos |
| Intentos máximos | **Nuevo**: intentos por viaje + incremento |
| Comentarios que deseas rechazar (palabras) | **Nuevo**: lista de palabras |
| Motor de tramos: tramos fijos (Bs por rango) + tramos dinámicos (Bs/km) | **Nuevo**: tramo fijo o por km, combinables |
| Tramos infinitos | Ya existía |
| Configuración activa / Modo manual | Activar/Desactivar + modo Manual/Automático |
| Rechazo agresivo ("aumenta el siguiente intento") | Semántica propia distinta (descartar datos insuficientes); el aumento por intento es el "Incremento" |
| Sin lápiz (evita ofertas editadas manualmente) | No aplica: RutaFiltro no edita ofertas en inDrive |
| Aceptar decimales / Limpiar viajes | Ya existían |
| Rechazar comentarios / Aceptar paradas | Palabras clave nuevas; paradas ya existía (filtro inverso) |
| Botón flotante | Ya existía |
| Audio del viaje | **Nuevo**: tono + vibración |
| Perfiles | Ya existía |
| Zonas roja/dorada/verde dibujadas con el dedo | **Nuevo**: trazo libre (además de por puntos) |
| Suscripción, ranking, configuración remota | **No se implementa** (sin licencias ni servidores) |
| Diseño de la lista de viajes de inDrive | **No se implementa** (requiere modificar inDrive) |
