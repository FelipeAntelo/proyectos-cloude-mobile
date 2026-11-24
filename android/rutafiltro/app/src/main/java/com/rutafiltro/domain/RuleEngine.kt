package com.rutafiltro.domain

import com.rutafiltro.maps.ZoneMatcher

/** Identificador de la regla que produjo un resultado (se guarda en el historial). */
enum class RuleId(val label: String) {
    DATA_INVALID("Datos insuficientes o inválidos"),
    PASSENGER_PRICE_MISSING("Precio del pasajero desconocido"),
    PICKUP_DISTANCE("Recogida demasiado lejos"),
    PICKUP_TIME("Tiempo de llegada excesivo"),
    TRIP_DISTANCE("Trayecto demasiado largo"),
    RATING("Calificación del pasajero baja"),
    EXTRA_STOPS("Demasiadas paradas adicionales"),
    DESCRIPTION("Solicitud con descripción"),
    DESCRIPTION_KEYWORD("Comentario con palabra rechazada"),
    PASSENGER_TRIPS("Pasajero con pocos viajes"),
    RED_ZONE_PICKUP("Recogida en zona roja"),
    RED_ZONE_DROPOFF("Destino en zona roja"),
    GOLD_PICKUP_OUTSIDE("Recogida fuera de zona dorada"),
    GOLD_DROPOFF_OUTSIDE("Destino fuera de zona dorada"),
    ZONE_COORDS_UNKNOWN("Coordenadas desconocidas para evaluar zonas"),
    TIERS_INVALID("Configuración de tramos inválida"),
    TIER_NOT_COVERED("Distancia fuera de los tramos configurados"),
    FARE_BELOW_REQUIRED("Precio por debajo de la tarifa exigida"),
    OK("Cumple todos los criterios"),
}

enum class Decision {
    /** Se ofrece al precio del pasajero (ya cumple la tarifa exigida). */
    ACCEPT,
    /** Se contraoferta a la tarifa exigida. */
    COUNTER_OFFER,
    REJECT,
    /** Datos ambiguos/incompletos: nunca se oferta. */
    INSUFFICIENT_DATA,
}

data class RuleCheck(val rule: RuleId, val passed: Boolean, val detail: String)

data class OfferPlan(
    val priceBs: Double,
    val isCounterOffer: Boolean,
    /** ¿Puede enviarse sin intervención? (respeta el importe máximo de oferta automática). */
    val autoSendAllowed: Boolean,
    val autoBlockReason: String?,
)

data class Evaluation(
    val request: RideRequest,
    val decision: Decision,
    /** Regla determinante: la primera que falló, o OK. */
    val rule: RuleId,
    val reason: String,
    val checks: List<RuleCheck>,
    val fare: FareBreakdown?,
    val offer: OfferPlan?,
    /** Prioridad por zonas verdes/doradas (mayor = mejor). */
    val priority: Int,
    /** Bs/km con pasajero (precio del pasajero / km de trayecto). */
    val bsPerKmTrip: Double?,
    /** Bs/km total incluida la recogida. */
    val bsPerKmTotal: Double?,
)

/**
 * Motor de reglas puro (sin Android, sin E/S): mismo input => mismo output.
 * Orden: validez de datos → filtros del conductor → zonas → tarifa → oferta.
 * Se registran TODAS las comprobaciones hechas hasta la regla determinante.
 */
object RuleEngine {

    fun evaluate(req: RideRequest, s: ProfileSettings, zones: List<Zone>): Evaluation {
        val checks = mutableListOf<RuleCheck>()
        val f = s.filters
        val bsTrip = FareCalculator.bsPerKm(req.passengerPriceBs, req.tripDistanceKm)
        val totalKm = if (req.pickupDistanceKm != null && req.tripDistanceKm != null)
            req.pickupDistanceKm + req.tripDistanceKm else null
        val bsTotal = FareCalculator.bsPerKm(req.passengerPriceBs, totalKm)

        fun result(decision: Decision, rule: RuleId, reason: String, fare: FareBreakdown? = null,
                   offer: OfferPlan? = null, priority: Int = 0) =
            Evaluation(req, decision, rule, reason, checks.toList(), fare, offer, priority, bsTrip, bsTotal)

        fun reject(rule: RuleId, detail: String): Evaluation {
            checks += RuleCheck(rule, false, detail)
            return result(Decision.REJECT, rule, detail)
        }

        // 1) Datos mínimos para cualquier decisión
        val price = req.passengerPriceBs
        if (price == null || price.isNaN() || price <= 0) {
            checks += RuleCheck(RuleId.PASSENGER_PRICE_MISSING, false, "Sin precio válido del pasajero")
            return result(Decision.INSUFFICIENT_DATA, RuleId.PASSENGER_PRICE_MISSING, "Sin precio válido del pasajero")
        }

        // 2) Filtros del conductor
        val pk = req.pickupDistanceKm
        if (f.maxPickupKm > 0) {
            when {
                pk == null -> if (f.unknownPickup == UnknownPolicy.REJECT) {
                    checks += RuleCheck(RuleId.DATA_INVALID, false, "Distancia de recogida desconocida")
                    return result(Decision.INSUFFICIENT_DATA, RuleId.DATA_INVALID, "Distancia de recogida desconocida")
                }
                pk > f.maxPickupKm -> return reject(RuleId.PICKUP_DISTANCE, "Recogida ${km(pk)} > máx ${km(f.maxPickupKm)}")
                else -> checks += RuleCheck(RuleId.PICKUP_DISTANCE, true, "Recogida ${km(pk)}")
            }
        }
        val eta = req.pickupEtaMin
        if (f.maxPickupMin > 0) {
            when {
                eta == null -> if (f.unknownPickup == UnknownPolicy.REJECT) {
                    checks += RuleCheck(RuleId.DATA_INVALID, false, "Tiempo de llegada desconocido")
                    return result(Decision.INSUFFICIENT_DATA, RuleId.DATA_INVALID, "Tiempo de llegada desconocido")
                }
                eta > f.maxPickupMin -> return reject(RuleId.PICKUP_TIME, "Llegada ${min(eta)} > máx ${min(f.maxPickupMin)}")
                else -> checks += RuleCheck(RuleId.PICKUP_TIME, true, "Llegada ${min(eta)}")
            }
        }
        val tk = req.tripDistanceKm
        if (tk != null && f.maxTripKm > 0) {
            if (tk > f.maxTripKm) return reject(RuleId.TRIP_DISTANCE, "Trayecto ${km(tk)} > máx ${km(f.maxTripKm)}")
            checks += RuleCheck(RuleId.TRIP_DISTANCE, true, "Trayecto ${km(tk)}")
        }
        if (f.minPassengerRating > 0) {
            val r = req.passengerRating
            when {
                r == null -> if (f.unknownRating == UnknownPolicy.REJECT) return reject(RuleId.RATING, "Calificación desconocida")
                r < f.minPassengerRating -> return reject(RuleId.RATING, "Calificación ${"%.2f".format(r)} < ${"%.2f".format(f.minPassengerRating)}")
                else -> checks += RuleCheck(RuleId.RATING, true, "Calificación ${"%.2f".format(r)}")
            }
        }
        if (f.minPassengerTrips > 0) {
            val n = req.passengerTrips
            when {
                n == null -> if (f.unknownTrips == UnknownPolicy.REJECT) return reject(RuleId.PASSENGER_TRIPS, "Viajes del pasajero desconocidos")
                n < f.minPassengerTrips -> return reject(RuleId.PASSENGER_TRIPS, "$n viajes < mínimo ${f.minPassengerTrips}")
                else -> checks += RuleCheck(RuleId.PASSENGER_TRIPS, true, "$n viajes")
            }
        }
        if (f.skipExtraStops) {
            val st = req.extraStops
            when {
                st == null -> if (f.unknownStops == UnknownPolicy.REJECT) return reject(RuleId.EXTRA_STOPS, "Paradas desconocidas")
                st >= f.maxExtraStopsThreshold -> return reject(RuleId.EXTRA_STOPS, "$st paradas adicionales (límite < ${f.maxExtraStopsThreshold})")
                else -> checks += RuleCheck(RuleId.EXTRA_STOPS, true, "$st paradas adicionales")
            }
        }
        if (f.skipWithDescription) {
            val d = req.description
            when {
                d == null -> if (f.unknownDescription == UnknownPolicy.REJECT) return reject(RuleId.DESCRIPTION, "Descripción desconocida")
                d.isNotBlank() -> return reject(RuleId.DESCRIPTION, "Tiene descripción: \"${d.take(40)}\"")
                else -> checks += RuleCheck(RuleId.DESCRIPTION, true, "Sin descripción")
            }
        }

        val keywords = f.rejectKeywords.map(::normalize).filter { it.isNotBlank() }
        if (keywords.isNotEmpty()) {
            val d = req.description
            if (d != null) {
                val text = normalize(d)
                val hit = keywords.firstOrNull { text.contains(it) }
                if (hit != null) return reject(RuleId.DESCRIPTION_KEYWORD, "Comentario contiene \"$hit\"")
                checks += RuleCheck(RuleId.DESCRIPTION_KEYWORD, true, "Sin palabras rechazadas")
            } else if (f.unknownDescription == UnknownPolicy.REJECT) {
                return reject(RuleId.DESCRIPTION_KEYWORD, "Comentario desconocido")
            }
        }

        // 3) Zonas
        val usable = ZoneMatcher.usable(zones)
        val zc = s.zones
        val pickupOk = req.pickup?.isValid == true
        val dropOk = req.dropoff?.isValid == true
        val reds = usable.filter { it.type == ZoneType.RED }
        val needsPickup = reds.any { it.redTarget != RedZoneTarget.DROPOFF } ||
            (zc.goldMode == GoldMode.EXCLUSIVE && usable.any { it.type == ZoneType.GOLD })
        val needsDrop = reds.any { it.redTarget != RedZoneTarget.PICKUP } ||
            (zc.goldMode == GoldMode.EXCLUSIVE && !zc.goldAllowDropoffOutside && usable.any { it.type == ZoneType.GOLD })
        if ((needsPickup && !pickupOk) || (needsDrop && !dropOk)) {
            val which = listOfNotNull(if (needsPickup && !pickupOk) "recogida" else null, if (needsDrop && !dropOk) "destino" else null).joinToString(" y ")
            if (zc.unknownCoordinates == UnknownPolicy.REJECT) {
                checks += RuleCheck(RuleId.ZONE_COORDS_UNKNOWN, false, "Sin coordenadas de $which")
                return result(Decision.INSUFFICIENT_DATA, RuleId.ZONE_COORDS_UNKNOWN, "Sin coordenadas de $which para evaluar zonas")
            }
            checks += RuleCheck(RuleId.ZONE_COORDS_UNKNOWN, true, "Sin coordenadas de $which: reglas de zona omitidas")
        }
        for (z in reds) {
            if (z.redTarget != RedZoneTarget.DROPOFF && pickupOk && ZoneMatcher.containing(listOf(z), ZoneType.RED, req.pickup).isNotEmpty())
                return reject(RuleId.RED_ZONE_PICKUP, "Recogida en zona roja \"${z.name}\"")
            if (z.redTarget != RedZoneTarget.PICKUP && dropOk && ZoneMatcher.containing(listOf(z), ZoneType.RED, req.dropoff).isNotEmpty())
                return reject(RuleId.RED_ZONE_DROPOFF, "Destino en zona roja \"${z.name}\"")
        }
        if (reds.isNotEmpty()) checks += RuleCheck(RuleId.RED_ZONE_PICKUP, true, "Fuera de zonas rojas")

        val golds = usable.filter { it.type == ZoneType.GOLD }
        val goldPickup = ZoneMatcher.containing(golds, ZoneType.GOLD, req.pickup)
        val goldDrop = ZoneMatcher.containing(golds, ZoneType.GOLD, req.dropoff)
        if (zc.goldMode == GoldMode.EXCLUSIVE && golds.isNotEmpty()) {
            if (pickupOk && goldPickup.isEmpty()) return reject(RuleId.GOLD_PICKUP_OUTSIDE, "Recogida fuera de las zonas doradas")
            if (!zc.goldAllowDropoffOutside && dropOk && goldDrop.isEmpty())
                return reject(RuleId.GOLD_DROPOFF_OUTSIDE, "Destino fuera de las zonas doradas")
            checks += RuleCheck(RuleId.GOLD_PICKUP_OUTSIDE, true, "Dentro de zona dorada")
        }
        val greens = usable.filter { it.type == ZoneType.GREEN }
        var priority = (ZoneMatcher.containing(greens, ZoneType.GREEN, req.pickup).maxOfOrNull { it.priority } ?: 0) +
            (ZoneMatcher.containing(greens, ZoneType.GREEN, req.dropoff).maxOfOrNull { it.priority } ?: 0)
        if (zc.goldMode != GoldMode.OFF) priority += (goldPickup.maxOfOrNull { it.priority } ?: 0)
        if (f.preferredPickupMin > 0 && eta != null && eta <= f.preferredPickupMin) priority += FilterConfig.PREFERRED_ETA_BONUS

        // 4) Tarifa
        val fare = when (val fr = FareCalculator.compute(req, s.fare, s.tiers)) {
            is FareResult.Insufficient -> {
                val msg = "Faltan: " + fr.missing.joinToString(", ")
                checks += RuleCheck(RuleId.DATA_INVALID, false, msg)
                return result(Decision.INSUFFICIENT_DATA, RuleId.DATA_INVALID, msg, priority = priority)
            }
            is FareResult.InvalidTiers -> {
                checks += RuleCheck(RuleId.TIERS_INVALID, false, fr.issues.first().message)
                return result(Decision.INSUFFICIENT_DATA, RuleId.TIERS_INVALID, "Tramos inválidos: ${fr.issues.first().message}", priority = priority)
            }
            is FareResult.TierNotCovered -> return reject(RuleId.TIER_NOT_COVERED,
                "Distancia total ${km(fr.totalKm)} supera el último tramo (${km(fr.coveredUpToKm)})")
            is FareResult.Ok -> fr.breakdown
        }

        // 5) Oferta
        val maxAuto = s.fare.maxAutoOfferBs
        fun plan(p: Double, counter: Boolean): OfferPlan {
            val block = when {
                maxAuto <= 0 -> "Oferta automática deshabilitada (importe máximo = 0)"
                p > maxAuto + 1e-9 -> "Bs ${bs(p)} supera el máximo automático Bs ${bs(maxAuto)}"
                else -> null
            }
            return OfferPlan(p, counter, block == null, block)
        }
        return if (price + 1e-9 >= fare.required) {
            checks += RuleCheck(RuleId.FARE_BELOW_REQUIRED, true, "Bs ${bs(price)} ≥ exigida Bs ${bs(fare.required)}")
            checks += RuleCheck(RuleId.OK, true, "Aceptar al precio del pasajero")
            result(Decision.ACCEPT, RuleId.OK, "Bs ${bs(price)} cumple (exigida Bs ${bs(fare.required)})", fare, plan(price, false), priority)
        } else if (s.fare.counterOfferEnabled) {
            checks += RuleCheck(RuleId.FARE_BELOW_REQUIRED, true, "Bs ${bs(price)} < exigida: contraoferta")
            checks += RuleCheck(RuleId.OK, true, "Contraoferta Bs ${bs(fare.required)}")
            result(Decision.COUNTER_OFFER, RuleId.OK, "Contraoferta Bs ${bs(fare.required)} (pasajero Bs ${bs(price)})", fare, plan(fare.required, true), priority)
        } else {
            checks += RuleCheck(RuleId.FARE_BELOW_REQUIRED, false, "Bs ${bs(price)} < exigida Bs ${bs(fare.required)}")
            Evaluation(req, Decision.REJECT, RuleId.FARE_BELOW_REQUIRED,
                "Bs ${bs(price)} < exigida Bs ${bs(fare.required)}", checks.toList(), fare, null, priority, bsTrip, bsTotal)
        }
    }

    /** Minúsculas y sin tildes, para comparar palabras clave. */
    fun normalize(s: String): String =
        java.text.Normalizer.normalize(s.lowercase().trim(), java.text.Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")

    private fun km(v: Double) = "%.1f km".format(v)
    private fun min(v: Double) = "%.0f min".format(v)
    fun bs(v: Double) = if (v == Math.floor(v)) v.toLong().toString() else "%.2f".format(v)
}
