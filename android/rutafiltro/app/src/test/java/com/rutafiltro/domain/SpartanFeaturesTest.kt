package com.rutafiltro.domain

import com.rutafiltro.TestData.req
import com.rutafiltro.automation.AlertPolicy
import com.rutafiltro.automation.Outcome
import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.maps.Geometry
import com.rutafiltro.maps.PolygonValidator
import com.rutafiltro.maps.SantaCruz
import com.rutafiltro.maps.Simplify
import com.rutafiltro.maps.ZoneDraft
import com.rutafiltro.ui.screens.TierEditing
import com.rutafiltro.ui.screens.parseKeywords
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.cos
import kotlin.math.sin

/** Funciones observadas en el video de SpartanBot e incorporadas con semántica propia. */
class SpartanFeaturesTest {
    /** Configuración vista en el video: fijos 0–3 = 12, 3–5 = 15; dinámicos 5–10 a 3/km, 10–25 a 2,7/km. */
    private val mixed = TierConfig(infiniteLastTier = false, tiers = listOf(
        Tier(0.0, 3.0, 12.0, fixed = true), Tier(3.0, 5.0, 15.0, fixed = true),
        Tier(5.0, 10.0, 3.0), Tier(10.0, 25.0, 2.7),
    ))

    @Test fun fixedTiersFullBand() {
        assertTrue(TierValidator.validate(mixed).isEmpty())
        assertEquals(12.0, FareCalculator.tierFare(0.5, mixed)!!, 1e-9)
        assertEquals(12.0, FareCalculator.tierFare(3.0, mixed)!!, 1e-9)
        assertEquals(15.0, FareCalculator.tierFare(4.2, mixed)!!, 1e-9)
        assertEquals(24.0, FareCalculator.tierFare(8.0, mixed)!!, 1e-9)      // 8 × 3
        assertEquals(54.0, FareCalculator.tierFare(20.0, mixed)!!, 1e-9)     // 20 × 2,7
        assertEquals(null, FareCalculator.tierFare(26.0, mixed))
    }

    @Test fun fixedTiersProgressive() {
        val p = mixed.copy(mode = TierMode.PROGRESSIVE)
        assertEquals(12.0, FareCalculator.tierFare(1.0, p)!!, 1e-9)
        assertEquals(27.0, FareCalculator.tierFare(4.0, p)!!, 1e-9)          // 12 + 15
        assertEquals(36.0, FareCalculator.tierFare(8.0, p)!!, 1e-9)          // 12 + 15 + 3×3
    }

    @Test fun fixedTierInEngine() {
        val s = ProfileSettings(fare = FareConfig(minFareBs = 5.0, minPricePerKm = 1.0), tiers = mixed)
        // 0,5 + 2 = 2,5 km → tramo fijo 12
        val e = RuleEngine.evaluate(req(price = 10.0, pickupKm = 0.5, tripKm = 2.0), s, emptyList())
        assertEquals(Decision.COUNTER_OFFER, e.decision)
        assertEquals(12.0, e.offer!!.priceBs, 1e-9)
        assertEquals(FareDriver.TIER, e.fare!!.dominant)
    }

    @Test fun tierEditingSetFixed() {
        val c = TierEditing.setFixed(TierConfig(), 0, true)
        assertTrue(c.tiers[0].fixed)
        assertTrue(TierValidator.validate(c).isEmpty())
    }

    @Test fun keywordRejectionIgnoresCaseAndAccents() {
        val s = ProfileSettings(tiers = TierConfig(enabled = false), filters = FilterConfig(rejectKeywords = listOf("mascota", "Sin Propina")))
        val e1 = RuleEngine.evaluate(req(description = "Voy con MASCOTÁ pequeña"), s, emptyList())
        assertEquals(RuleId.DESCRIPTION_KEYWORD, e1.rule)
        assertTrue(e1.reason.contains("mascota"))
        assertEquals(RuleId.DESCRIPTION_KEYWORD, RuleEngine.evaluate(req(description = "sin própina gracias"), s, emptyList()).rule)
        assertEquals(Decision.ACCEPT, RuleEngine.evaluate(req(description = "Llevo una maleta"), s, emptyList()).decision)
        assertEquals(Decision.ACCEPT, RuleEngine.evaluate(req(description = null), s, emptyList()).decision)
        assertEquals(listOf("mascota", "sin propina"), parseKeywords(" mascota, sin propina ,, mascota"))
    }

    @Test fun passengerMinTrips() {
        val s = ProfileSettings(tiers = TierConfig(enabled = false), filters = FilterConfig(minPassengerTrips = 10))
        assertEquals(RuleId.PASSENGER_TRIPS, RuleEngine.evaluate(req().copy(passengerTrips = 3), s, emptyList()).rule)
        assertEquals(Decision.ACCEPT, RuleEngine.evaluate(req().copy(passengerTrips = 10), s, emptyList()).decision)
        assertEquals(Decision.ACCEPT, RuleEngine.evaluate(req().copy(passengerTrips = null), s, emptyList()).decision)
        val strict = s.copy(filters = s.filters.copy(unknownTrips = UnknownPolicy.REJECT))
        assertEquals(RuleId.PASSENGER_TRIPS, RuleEngine.evaluate(req().copy(passengerTrips = null), strict, emptyList()).rule)
    }

    @Test fun preferredEtaAddsPriorityWithoutRejecting() {
        val s = ProfileSettings(tiers = TierConfig(enabled = false), filters = FilterConfig(preferredPickupMin = 2.0))
        assertEquals(FilterConfig.PREFERRED_ETA_BONUS, RuleEngine.evaluate(req(etaMin = 2.0), s, emptyList()).priority)
        val far = RuleEngine.evaluate(req(etaMin = 5.0), s, emptyList())
        assertEquals(0, far.priority)
        assertEquals(Decision.ACCEPT, far.decision)
    }

    @Test fun alertPolicy() {
        fun r(o: Outcome) = ProcessedRecord("x", 0, "s", true, "p", Decision.ACCEPT, RuleId.OK, "", o, null, null, null, null, null, null, null, null, null, null, null)
        assertTrue(AlertPolicy.shouldAlert(r(Outcome.PREPARED), true))
        assertTrue(AlertPolicy.shouldAlert(r(Outcome.SENT_SIMULATED), true))
        assertFalse(AlertPolicy.shouldAlert(r(Outcome.REJECTED), true))
        assertFalse(AlertPolicy.shouldAlert(r(Outcome.PREPARED), false))
    }

    @Test fun freehandTraceBecomesValidPolygon() {
        val c = SantaCruz.CENTER
        // círculo de ~1,1 km con 400 puntos y algo de temblor del dedo
        val trace = (0..400).map { i ->
            val a = 2 * Math.PI * i / 400
            val jitter = if (i % 2 == 0) 0.00005 else -0.00005
            GeoPoint(c.lat + 0.01 * sin(a) + jitter, c.lng + 0.01 * cos(a))
        }
        val poly = Simplify.freehandToPolygon(trace)
        assertTrue("vértices=${poly.size}", poly.size in 8..PolygonValidator.MAX_VERTICES)
        assertTrue(PolygonValidator.validate(poly).toString(), PolygonValidator.isValid(poly))
        assertTrue(Geometry.contains(poly, c))
        val d = ZoneDraft().fromFreehand(trace)
        assertEquals(poly, d.vertices)
        assertTrue(d.undo().vertices.isEmpty())
        // un trazo demasiado corto no cambia nada
        assertEquals(0, ZoneDraft().fromFreehand(trace.take(2)).vertices.size)
    }

    @Test fun oldSettingsJsonStillLoads() {
        // JSON de la v0.8 (sin campos nuevos) => valores por defecto para lo nuevo
        val old = """{"fare":{"minFareBs":11.0},"tiers":{"tiers":[{"fromKm":0.0,"toKm":null,"pricePerKm":3.0}]}}"""
        val s = com.rutafiltro.data.JsonCodec.decodeSettings(old)
        assertEquals(11.0, s.fare.minFareBs, 1e-9)
        assertFalse(s.tiers.tiers[0].fixed)
        assertEquals(1, s.automation.maxAttemptsPerRequest)
        assertTrue(s.filters.rejectKeywords.isEmpty())
    }
}
