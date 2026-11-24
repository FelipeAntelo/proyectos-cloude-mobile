package com.rutafiltro.domain

import kotlin.math.ceil

/** Componente que determinó la tarifa exigida (el mayor del máximo). */
enum class FareDriver { MIN_FARE, PER_KM, TIER, TIME_MIN }

data class FareBreakdown(
    val pickupKm: Double,
    val tripKm: Double,
    val totalKm: Double,
    val totalMinutes: Double?,
    val minFareComponent: Double,
    val perKmComponent: Double,
    /** null si los tramos están desactivados. */
    val tierComponent: Double?,
    /** Importe por tiempo (minutos totales · Bs/min); 0 si está desactivado. */
    val timeComponent: Double,
    val timeMode: TimePricingMode,
    val dominant: FareDriver,
    /** Tarifa exigida sin redondear. */
    val requiredRaw: Double,
    /** Tarifa exigida redondeada hacia arriba (entero o 0,10 Bs según "aceptar decimales"). */
    val required: Double,
)

sealed interface FareResult {
    data class Ok(val breakdown: FareBreakdown) : FareResult
    /** Faltan datos o son inválidos: no se calcula nada para no producir resultados inconsistentes. */
    data class Insufficient(val missing: List<String>) : FareResult
    /** La distancia supera el último tramo cerrado (tramos infinitos desactivado). */
    data class TierNotCovered(val totalKm: Double, val coveredUpToKm: Double) : FareResult
    /** La configuración de tramos tiene errores: no se usa para calcular. */
    data class InvalidTiers(val issues: List<TierIssue>) : FareResult
}

/**
 * Tarifa exigida:
 *
 *   base = max( tarifa mínima, distancia_total · Bs/km mínimo, tarifa por tramos(distancia_total) )
 *   ADDITIVE:          exigida = base + minutos_totales · Bs/min
 *   SEPARATE_MINIMUM:  exigida = max(base, minutos_totales · Bs/min)
 *   DISABLED:          exigida = base
 *
 * distancia_total = recogida + trayecto; minutos_totales = ETA recogida + duración trayecto.
 */
object FareCalculator {

    fun compute(req: RideRequest, fare: FareConfig, tiers: TierConfig): FareResult {
        val missing = mutableListOf<String>()
        val pickupKm = req.pickupDistanceKm.validNonNegative("distancia de recogida", missing)
        val tripKm = req.tripDistanceKm.validNonNegative("distancia del trayecto", missing)
        val usesTime = fare.timeMode != TimePricingMode.DISABLED && fare.pricePerMinute > 0
        var totalMin: Double? = null
        if (usesTime) {
            val a = req.pickupEtaMin.validNonNegative("tiempo hasta el pasajero", missing)
            val b = req.tripDurationMin.validNonNegative("duración del trayecto", missing)
            if (a != null && b != null) totalMin = a + b
        } else if (req.pickupEtaMin != null && req.tripDurationMin != null &&
            req.pickupEtaMin >= 0 && req.tripDurationMin >= 0) {
            totalMin = req.pickupEtaMin + req.tripDurationMin
        }
        if (missing.isNotEmpty() || pickupKm == null || tripKm == null) return FareResult.Insufficient(missing)

        val totalKm = pickupKm + tripKm
        val perKm = totalKm * fare.minPricePerKm.coerceAtLeast(0.0)
        val minFare = fare.minFareBs.coerceAtLeast(0.0)

        var tierComponent: Double? = null
        if (tiers.enabled) {
            val issues = TierValidator.validate(tiers)
            if (issues.isNotEmpty()) return FareResult.InvalidTiers(issues)
            tierComponent = tierFare(totalKm, tiers)
                ?: return FareResult.TierNotCovered(totalKm, tiers.tiers.maxOf { it.toKm ?: Double.MAX_VALUE })
        }
        val timeComponent = if (usesTime) totalMin!! * fare.pricePerMinute else 0.0

        val candidates = buildList {
            add(FareDriver.MIN_FARE to minFare)
            add(FareDriver.PER_KM to perKm)
            tierComponent?.let { add(FareDriver.TIER to it) }
            if (fare.timeMode == TimePricingMode.SEPARATE_MINIMUM && usesTime) add(FareDriver.TIME_MIN to timeComponent)
        }
        val top = candidates.maxBy { it.second }
        val raw = top.second + if (fare.timeMode == TimePricingMode.ADDITIVE && usesTime) timeComponent else 0.0
        return FareResult.Ok(
            FareBreakdown(
                pickupKm = pickupKm, tripKm = tripKm, totalKm = totalKm, totalMinutes = totalMin,
                minFareComponent = minFare, perKmComponent = perKm, tierComponent = tierComponent,
                timeComponent = if (usesTime) timeComponent else 0.0, timeMode = fare.timeMode,
                dominant = top.first, requiredRaw = raw, required = roundUp(raw, fare.acceptDecimals),
            )
        )
    }

    /** Tarifa por tramos para [km]; null si la distancia no está cubierta. Requiere tramos válidos. */
    fun tierFare(km: Double, config: TierConfig): Double? {
        val sorted = config.tiers.sortedBy { it.fromKm }
        return when (config.mode) {
            TierMode.FULL_BAND -> {
                val t = sorted.firstOrNull { t ->
                    val upperOk = t.toKm == null || km <= t.toKm + 1e-9
                    val lowerOk = km > t.fromKm + 1e-9 || (t.fromKm <= 1e-9 && km >= 0)
                    upperOk && lowerOk
                } ?: return null
                km * t.pricePerKm
            }
            TierMode.PROGRESSIVE -> {
                val maxCovered = sorted.last().toKm
                if (maxCovered != null && km > maxCovered + 1e-9) return null
                sorted.sumOf { t ->
                    val upper = minOf(km, t.toKm ?: Double.MAX_VALUE)
                    (upper - t.fromKm).coerceAtLeast(0.0) * t.pricePerKm
                }
            }
        }
    }

    fun roundUp(v: Double, acceptDecimals: Boolean): Double =
        if (acceptDecimals) ceil(v * 10 - 1e-7) / 10.0 else ceil(v - 1e-7)

    /** Bs/km sobre una distancia; null si la distancia es 0 o desconocida. */
    fun bsPerKm(priceBs: Double?, km: Double?): Double? =
        if (priceBs == null || km == null || km <= 1e-9) null else priceBs / km

    private fun Double?.validNonNegative(label: String, missing: MutableList<String>): Double? {
        if (this == null) { missing += label; return null }
        if (isNaN() || isInfinite() || this < 0) { missing += "$label (valor inválido)"; return null }
        return this
    }
}
