package com.rutafiltro.domain

import kotlinx.serialization.Serializable

/** Coordenada WGS84. Se valida en [isValid]; nunca se asume una coordenada por defecto. */
@Serializable
data class GeoPoint(val lat: Double, val lng: Double) {
    val isValid: Boolean
        get() = !lat.isNaN() && !lng.isNaN() && lat in -90.0..90.0 && lng in -180.0..180.0
}
