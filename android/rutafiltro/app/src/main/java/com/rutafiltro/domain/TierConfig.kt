package com.rutafiltro.domain

import kotlinx.serialization.Serializable

/**
 * Tramo de distancia: (fromKm, toKm]. toKm == null => tramo infinito.
 * El primer tramo empieza en 0 e incluye el 0: [0, toKm].
 *
 * [fixed] = false: [pricePerKm] es Bs por km ("tramo dinámico").
 * [fixed] = true:  [pricePerKm] es un precio TOTAL en Bs para ese rango ("tramo fijo").
 */
@Serializable
data class Tier(val fromKm: Double, val toKm: Double?, val pricePerKm: Double, val fixed: Boolean = false)

/**
 * - [FULL_BAND]: toda la distancia se cobra al precio del tramo en que cae la distancia total.
 *   Ej. 8 km con tramo 6–10 a 3 Bs/km => 24 Bs. Si ese tramo es fijo, la tarifa es su precio fijo.
 * - [PROGRESSIVE]: cada porción se cobra a su tramo (como impuestos escalonados).
 *   Ej. 8 km => 3·4 + 3·3,5 + 2·3 = 28,5 Bs. Un tramo fijo suma su precio completo en cuanto
 *   la distancia entra en él (el primer tramo siempre se cobra).
 */
@Serializable
enum class TierMode { FULL_BAND, PROGRESSIVE }

@Serializable
data class TierConfig(
    val enabled: Boolean = true,
    val mode: TierMode = TierMode.FULL_BAND,
    /**
     * "Tramos infinitos": si true el último tramo debe ser abierto (toKm = null) y cubre
     * cualquier distancia. Si false, una distancia por encima del último tramo NO tiene
     * tarifa por tramo y la solicitud se rechaza con motivo TIER_NOT_COVERED.
     */
    val infiniteLastTier: Boolean = true,
    val tiers: List<Tier> = DEFAULT_TIERS,
) {
    companion object {
        val DEFAULT_TIERS = listOf(
            Tier(0.0, 3.0, 4.0),
            Tier(3.0, 6.0, 3.5),
            Tier(6.0, 10.0, 3.0),
            Tier(10.0, null, 2.8),
        )
    }
}
