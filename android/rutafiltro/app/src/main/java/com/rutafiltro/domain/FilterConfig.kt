package com.rutafiltro.domain

import kotlinx.serialization.Serializable

/** Qué hacer cuando un dato necesario para un filtro es desconocido. */
@Serializable
enum class UnknownPolicy {
    /** Rechazar la solicitud (opción conservadora, por defecto). */
    REJECT,
    /** Ignorar ese filtro concreto y seguir evaluando. */
    IGNORE,
}

@Serializable
data class FilterConfig(
    /** 0 o menor = sin límite. */
    val maxPickupKm: Double = 3.0,
    val maxPickupMin: Double = 10.0,
    val maxTripKm: Double = 25.0,
    val minPassengerRating: Double = 4.5,
    val skipExtraStops: Boolean = true,
    /** Se omiten solicitudes con paradas adicionales >= este valor (por defecto 2). */
    val maxExtraStopsThreshold: Int = 2,
    /** Rechaza CUALQUIER solicitud con comentario. */
    val skipWithDescription: Boolean = false,
    /**
     * "Rechazar comentarios": palabras o frases; se rechaza si el comentario contiene alguna
     * (sin distinguir mayúsculas ni tildes). Vacío = no se aplica.
     */
    val rejectKeywords: List<String> = emptyList(),
    /** Calidad del cliente: viajes mínimos del pasajero. 0 = sin filtro. */
    val minPassengerTrips: Int = 0,
    val unknownTrips: UnknownPolicy = UnknownPolicy.IGNORE,
    /**
     * Llegada preferida (min): si la llegada es menor o igual, la solicitud gana prioridad
     * (+[PREFERRED_ETA_BONUS]). No descarta nada. 0 = desactivado.
     */
    val preferredPickupMin: Double = 0.0,
    val unknownRating: UnknownPolicy = UnknownPolicy.IGNORE,
    val unknownPickup: UnknownPolicy = UnknownPolicy.REJECT,
    val unknownStops: UnknownPolicy = UnknownPolicy.IGNORE,
    val unknownDescription: UnknownPolicy = UnknownPolicy.IGNORE,
) {
    companion object { const val PREFERRED_ETA_BONUS = 2 }
}
