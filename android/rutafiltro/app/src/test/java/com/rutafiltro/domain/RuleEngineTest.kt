package com.rutafiltro.domain

import com.rutafiltro.TestData.req
import com.rutafiltro.TestData.square
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RuleEngineTest {
    private val base = ProfileSettings(
        fare = FareConfig(minFareBs = 10.0, minPricePerKm = 3.0, maxAutoOfferBs = 60.0),
        tiers = TierConfig(enabled = false),
        filters = FilterConfig(maxPickupKm = 3.0, maxPickupMin = 10.0, maxTripKm = 25.0, minPassengerRating = 4.5),
    )
    private fun eval(r: RideRequest, s: ProfileSettings = base, zones: List<Zone> = emptyList()) = RuleEngine.evaluate(r, s, zones)

    @Test fun acceptWhenPriceCoversRequired() {
        // total 7 km * 3 = 21 ; pasajero 30
        val e = eval(req(price = 30.0))
        assertEquals(Decision.ACCEPT, e.decision)
        assertEquals(30.0, e.offer!!.priceBs, 1e-9)
        assertTrue(e.offer!!.autoSendAllowed)
        assertEquals(5.0, e.bsPerKmTrip!!, 1e-9)
        assertEquals(30.0 / 7.0, e.bsPerKmTotal!!, 1e-9)
    }

    @Test fun counterOfferAtRequired() {
        val e = eval(req(price = 15.0))
        assertEquals(Decision.COUNTER_OFFER, e.decision)
        assertEquals(21.0, e.offer!!.priceBs, 1e-9)
        assertTrue(e.offer!!.isCounterOffer)
    }

    @Test fun rejectBelowRequiredWhenCounterDisabled() {
        val e = eval(req(price = 15.0), base.copy(fare = base.fare.copy(counterOfferEnabled = false)))
        assertEquals(Decision.REJECT, e.decision)
        assertEquals(RuleId.FARE_BELOW_REQUIRED, e.rule)
        assertNull(e.offer)
    }

    @Test fun maxAutoOfferBlocksAutoSendButKeepsPlan() {
        val e = eval(req(price = 80.0))
        assertEquals(Decision.ACCEPT, e.decision)
        assertFalse(e.offer!!.autoSendAllowed)
        assertTrue(e.offer!!.autoBlockReason!!.contains("máximo"))
    }

    @Test fun missingPriceIsInsufficient() {
        assertEquals(Decision.INSUFFICIENT_DATA, eval(req(price = null)).decision)
        assertEquals(Decision.INSUFFICIENT_DATA, eval(req(price = 0.0)).decision)
    }

    @Test fun missingTripIsInsufficientNotAccepted() {
        val e = eval(req(tripKm = null))
        assertEquals(Decision.INSUFFICIENT_DATA, e.decision)
        assertNull(e.offer)
    }

    @Test fun pickupFilters() {
        assertEquals(RuleId.PICKUP_DISTANCE, eval(req(pickupKm = 3.5)).rule)
        assertEquals(RuleId.PICKUP_TIME, eval(req(etaMin = 11.0)).rule)
        assertEquals(Decision.INSUFFICIENT_DATA, eval(req(pickupKm = null)).decision)
        val lenient = base.copy(filters = base.filters.copy(unknownPickup = UnknownPolicy.IGNORE))
        assertEquals(Decision.INSUFFICIENT_DATA, eval(req(pickupKm = null), lenient).decision) // aún falta para la tarifa
    }

    @Test fun tripDistanceFilter() = assertEquals(RuleId.TRIP_DISTANCE, eval(req(tripKm = 30.0, price = 200.0)).rule)

    @Test fun ratingFilter() {
        assertEquals(RuleId.RATING, eval(req(rating = 4.4)).rule)
        assertEquals(Decision.ACCEPT, eval(req(rating = 4.5)).decision) // límite inclusivo
        assertEquals(Decision.ACCEPT, eval(req(rating = null)).decision) // IGNORE por defecto
        val strict = base.copy(filters = base.filters.copy(unknownRating = UnknownPolicy.REJECT))
        assertEquals(RuleId.RATING, eval(req(rating = null), strict).rule)
    }

    @Test fun extraStops() {
        assertEquals(Decision.ACCEPT, eval(req(stops = 1)).decision)
        assertEquals(RuleId.EXTRA_STOPS, eval(req(stops = 2)).rule)
        assertEquals(RuleId.EXTRA_STOPS, eval(req(stops = 3)).rule)
    }

    @Test fun description() {
        val s = base.copy(filters = base.filters.copy(skipWithDescription = true))
        assertEquals(RuleId.DESCRIPTION, eval(req(description = "llevo mascota"), s).rule)
        assertEquals(Decision.ACCEPT, eval(req(description = "  "), s).decision)
    }

    @Test fun redZones() {
        val pickup = GeoPoint(-17.78, -63.18)
        val drop = GeoPoint(-17.76, -63.16)
        val redPickup = square("Mercado", ZoneType.RED, pickup.lat, pickup.lng, red = RedZoneTarget.PICKUP)
        assertEquals(RuleId.RED_ZONE_PICKUP, eval(req(), zones = listOf(redPickup)).rule)
        val redDropOnly = square("Destino", ZoneType.RED, pickup.lat, pickup.lng, red = RedZoneTarget.DROPOFF)
        assertEquals(Decision.ACCEPT, eval(req(), zones = listOf(redDropOnly)).decision)
        val redDrop = square("D2", ZoneType.RED, drop.lat, drop.lng, red = RedZoneTarget.DROPOFF)
        assertEquals(RuleId.RED_ZONE_DROPOFF, eval(req(), zones = listOf(redDrop)).rule)
        // zona desactivada no aplica
        assertEquals(Decision.ACCEPT, eval(req(), zones = listOf(redPickup.copy(enabled = false))).decision)
    }

    @Test fun unknownCoordinatesPolicy() {
        val red = square("R", ZoneType.RED, -17.78, -63.18)
        val e = eval(req(pickup = null), zones = listOf(red))
        assertEquals(Decision.INSUFFICIENT_DATA, e.decision)
        assertEquals(RuleId.ZONE_COORDS_UNKNOWN, e.rule)
        val lenient = base.copy(zones = ZoneConfig(unknownCoordinates = UnknownPolicy.IGNORE))
        // destino sigue conocido y dentro? destino -17.76 está fuera del cuadrado de -17.78 ±0.01 => acepta
        assertEquals(Decision.ACCEPT, eval(req(pickup = null), lenient, listOf(red)).decision)
        // sin zonas, coordenadas desconocidas no importan
        assertEquals(Decision.ACCEPT, eval(req(pickup = null, dropoff = null)).decision)
    }

    @Test fun goldExclusive() {
        val gold = square("Centro", ZoneType.GOLD, -17.78, -63.18)
        val s = base.copy(zones = ZoneConfig(goldMode = GoldMode.EXCLUSIVE, goldAllowDropoffOutside = true))
        assertEquals(Decision.ACCEPT, eval(req(), s, listOf(gold)).decision)
        assertEquals(RuleId.GOLD_PICKUP_OUTSIDE, eval(req(pickup = GeoPoint(-17.70, -63.10)), s, listOf(gold)).rule)
        val strict = s.copy(zones = s.zones.copy(goldAllowDropoffOutside = false))
        assertEquals(RuleId.GOLD_DROPOFF_OUTSIDE, eval(req(), strict, listOf(gold)).rule)
        // múltiples zonas doradas: destino dentro de la segunda
        val gold2 = square("Norte", ZoneType.GOLD, -17.76, -63.16)
        assertEquals(Decision.ACCEPT, eval(req(), strict, listOf(gold, gold2)).decision)
    }

    @Test fun greenPriority() {
        val g1 = square("G1", ZoneType.GREEN, -17.78, -63.18, priority = 4)
        val g2 = square("G2", ZoneType.GREEN, -17.76, -63.16, priority = 2)
        assertEquals(6, eval(req(), zones = listOf(g1, g2)).priority)
        assertEquals(0, eval(req()).priority)
    }

    @Test fun invalidPolygonZoneIsIgnored() {
        val bad = Zone("x", "x", ZoneType.RED, listOf(GeoPoint(-17.78, -63.18), GeoPoint(-17.77, -63.17)))
        assertEquals(Decision.ACCEPT, eval(req(), zones = listOf(bad)).decision)
    }

    @Test fun checksRecordDeterminingRule() {
        val e = eval(req(rating = 3.0))
        assertEquals(RuleId.RATING, e.rule)
        assertFalse(e.checks.last().passed)
        assertTrue(e.checks.any { it.rule == RuleId.PICKUP_DISTANCE && it.passed })
    }

    @Test fun tiersAppliedInEngine() {
        val s = base.copy(tiers = TierConfig(mode = TierMode.PROGRESSIVE), fare = base.fare.copy(minPricePerKm = 1.0))
        // 7 km progresivo: 12 + 10.5 + 3 = 25.5 -> 26 redondeado
        val e = eval(req(price = 20.0), s)
        assertEquals(Decision.COUNTER_OFFER, e.decision)
        assertEquals(26.0, e.offer!!.priceBs, 1e-9)
    }

    @Test fun deterministic() = assertEquals(eval(req()), eval(req()))
}
