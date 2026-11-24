package com.rutafiltro.domain

import kotlinx.serialization.Serializable

/**
 * Cómo participa el precio por minuto en la tarifa exigida.
 *
 * - [DISABLED]: no se usa el tiempo.
 * - [ADDITIVE]: se SUMA al resultado del cálculo base:
 *   exigida = max(mínima, km·Bs/km, tramos) + minutos·Bs/min
 * - [SEPARATE_MINIMUM]: es OTRO mínimo más dentro del máximo:
 *   exigida = max(mínima, km·Bs/km, tramos, minutos·Bs/min)
 */
@Serializable
enum class TimePricingMode { DISABLED, ADDITIVE, SEPARATE_MINIMUM }

/** Parámetros de tarifa y rentabilidad (todos en Bs, km y minutos). */
@Serializable
data class FareConfig(
    val minFareBs: Double = 10.0,
    val minPricePerKm: Double = 3.0,
    val pricePerMinute: Double = 0.0,
    val timeMode: TimePricingMode = TimePricingMode.DISABLED,
    /** Importe máximo que el modo automático puede ofertar. 0 o menor = sin oferta automática. */
    val maxAutoOfferBs: Double = 60.0,
    /** Máximo de ofertas por sesión de automatización. */
    val maxOffersPerSession: Int = 20,
    /** Si false, la oferta se redondea hacia ARRIBA a Bs entero. Si true, a múltiplos de 0,10 Bs. */
    val acceptDecimals: Boolean = false,
    /** Permite contraofertar cuando el precio del pasajero no alcanza la tarifa exigida. */
    val counterOfferEnabled: Boolean = true,
)
