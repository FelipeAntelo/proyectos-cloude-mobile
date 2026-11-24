package com.rutafiltro.integration

import com.rutafiltro.domain.RideRequest
import kotlinx.coroutines.flow.Flow

/** Lo que un origen de datos puede hacer realmente. La UI y el motor se guían por esto. */
data class SourceCapabilities(
    /** true solo si los datos vienen de viajes reales (no sintéticos). */
    val isReal: Boolean,
    /** ¿Puede ocultar/descartar una solicitud en su propia interfaz? */
    val supportsDismiss: Boolean,
    /** ¿Admite pedir datos nuevos bajo demanda (autorefresco)? */
    val supportsRefresh: Boolean,
    /** Intervalo mínimo entre refrescos que el origen tolera. */
    val minRefreshSeconds: Int,
)

sealed interface SourceEvent {
    data class Request(val request: RideRequest) : SourceEvent
    /** El conductor tiene un viaje en curso: el motor debe detenerse. */
    data class TripActive(val active: Boolean) : SourceEvent
    data class Error(val message: String, val critical: Boolean) : SourceEvent
    /** El pasajero no aceptó la oferta enviada para [requestId] (permite reintentar). */
    data class OfferDeclined(val requestId: String) : SourceEvent
}

/**
 * Origen de solicitudes. Sustituible sin tocar el motor de reglas:
 * simulador, entrada manual o un futuro adaptador autorizado implementan esta interfaz.
 */
interface RideSource {
    val id: String
    val displayName: String
    val capabilities: SourceCapabilities
    val events: Flow<SourceEvent>
    /** Pide datos nuevos. No debe inventar solicitudes en un origen real. */
    suspend fun refresh() {}
    /** Oculta una solicitud descartada. Devuelve false si no se pudo. */
    suspend fun dismiss(requestId: String): Boolean = false
}
