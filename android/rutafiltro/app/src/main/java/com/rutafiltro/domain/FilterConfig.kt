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
    val skipWithDescription: Boolean = false,
    val unknownRating: UnknownPolicy = UnknownPolicy.IGNORE,
    val unknownPickup: UnknownPolicy = UnknownPolicy.REJECT,
    val unknownStops: UnknownPolicy = UnknownPolicy.IGNORE,
    val unknownDescription: UnknownPolicy = UnknownPolicy.IGNORE,
)
