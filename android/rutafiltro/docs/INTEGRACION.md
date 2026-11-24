# Estado de integración con inDrive

| Mecanismo | Estado | Detalle |
|---|---|---|
| API oficial de inDrive para conductores | **No disponible** | Búsqueda realizada (nov. 2026): no se encontró API pública ni programa de socios que permita a terceros leer solicitudes o enviar ofertas. inDrive *consume* APIs de terceros (Google Maps, TollGuru, Payrails) y anunció integración con plataformas de flotas (Autofleet), pero sin acceso abierto documentado. |
| Automatización de la UI de inDrive (AccessibilityService / pulsaciones) | **No implementada a propósito** | Leer la pantalla de inDrive o pulsar sus botones sin autorización del operador no es un mecanismo autorizado; además Google Play restringe el uso de accesibilidad para este fin. |
| Modificar/re-empaquetar el APK de inDrive | **Descartado** | Implicaría alterar código propietario y su firma/integridad. |
| Entrada manual (panel flotante) | **Disponible** | Datos reales transcritos por el conductor; la oferta queda PREPARADA. |
| Simulador | **Simulado** | Flujo completo; ofertas registradas como "Oferta SIMULADA". |

## Cómo se conectaría una integración autorizada

1. Implementar `integration/RideSource` (emitir `SourceEvent.Request`, `TripActive`,
   `Error`; declarar `SourceCapabilities(isReal = true, …)`).
2. Implementar `integration/OfferSink` con `SinkCapabilities(isReal = true,
   canSendAutomatically = true)` **solo** si el mecanismo está autorizado.
3. Registrarlo en `AppContainer.applySourceMode`.

El motor aplica automáticamente sus salvaguardas: un intento por solicitud,
límite por sesión, importe máximo, nunca enviar con datos ambiguos, nunca
mezclar solicitudes simuladas con un destino real, detenerse ante viaje activo,
error crítico o 3 fallos seguidos.

## Referencias

- APK de SpartanBot y capturas: **no estaban disponibles**; no se copió ni se atribuyó
  ningún comportamiento de SpartanBot. Los modos especiales tienen semántica definida
  en este proyecto (ver INFORME.md).
