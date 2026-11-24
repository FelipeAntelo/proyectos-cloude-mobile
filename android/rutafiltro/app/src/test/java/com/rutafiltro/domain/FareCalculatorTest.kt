package com.rutafiltro.domain

import com.rutafiltro.TestData.req
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FareCalculatorTest {
    private val noTiers = TierConfig(enabled = false)
    private fun ok(r: FareResult) = (r as FareResult.Ok).breakdown

    @Test fun minFareDominatesShortTrips() {
        val b = ok(FareCalculator.compute(req(pickupKm = 0.5, tripKm = 1.0), FareConfig(minFareBs = 10.0, minPricePerKm = 3.0), noTiers))
        assertEquals(1.5, b.totalKm, 1e-9)
        assertEquals(FareDriver.MIN_FARE, b.dominant)
        assertEquals(10.0, b.required, 1e-9)
    }

    @Test fun totalDistanceIncludesPickup() {
        val b = ok(FareCalculator.compute(req(pickupKm = 2.0, tripKm = 8.0), FareConfig(minFareBs = 5.0, minPricePerKm = 3.0), noTiers))
        assertEquals(10.0, b.totalKm, 1e-9)
        assertEquals(30.0, b.required, 1e-9)
        assertEquals(FareDriver.PER_KM, b.dominant)
    }

    @Test fun fullBandTier() {
        val tiers = TierConfig(mode = TierMode.FULL_BAND)
        // 8 km -> tramo 6-10 a 3 Bs/km = 24
        assertEquals(24.0, FareCalculator.tierFare(8.0, tiers)!!, 1e-9)
        // borde: exactamente 3 km cae en el primer tramo (0-3] a 4 => 12
        assertEquals(12.0, FareCalculator.tierFare(3.0, tiers)!!, 1e-9)
        assertEquals(0.0, FareCalculator.tierFare(0.0, tiers)!!, 1e-9)
        // 20 km -> tramo infinito 2.8 => 56
        assertEquals(56.0, FareCalculator.tierFare(20.0, tiers)!!, 1e-9)
    }

    @Test fun progressiveTier() {
        val tiers = TierConfig(mode = TierMode.PROGRESSIVE)
        // 8 km: 3*4 + 3*3.5 + 2*3 = 28.5
        assertEquals(28.5, FareCalculator.tierFare(8.0, tiers)!!, 1e-9)
        // 12 km: 12 + 10.5 + 12 + 2*2.8 = 40.1
        assertEquals(40.1, FareCalculator.tierFare(12.0, tiers)!!, 1e-9)
    }

    @Test fun tierNotCoveredWhenFinite() {
        val tiers = TierConfig(infiniteLastTier = false, tiers = listOf(Tier(0.0, 5.0, 4.0), Tier(5.0, 10.0, 3.0)))
        assertNull(FareCalculator.tierFare(10.5, tiers))
        val r = FareCalculator.compute(req(pickupKm = 1.0, tripKm = 9.9), FareConfig(), tiers)
        assertTrue(r is FareResult.TierNotCovered)
    }

    @Test fun requiredIsMaxOfComponents() {
        // 1+6=7 km, tramo 6-10 a 3 => 21; per km 2.5 => 17.5; min 10 => 21
        val b = ok(FareCalculator.compute(req(pickupKm = 1.0, tripKm = 6.0), FareConfig(minFareBs = 10.0, minPricePerKm = 2.5), TierConfig()))
        assertEquals(FareDriver.TIER, b.dominant)
        assertEquals(21.0, b.required, 1e-9)
    }

    @Test fun timeAdditive() {
        // base: 7 km * 3 = 21 ; tiempo (3+15)=18 min * 0.5 = 9 => 30
        val f = FareConfig(minFareBs = 5.0, minPricePerKm = 3.0, pricePerMinute = 0.5, timeMode = TimePricingMode.ADDITIVE)
        val b = ok(FareCalculator.compute(req(), f, noTiers))
        assertEquals(30.0, b.required, 1e-9)
        assertEquals(9.0, b.timeComponent, 1e-9)
    }

    @Test fun timeSeparateMinimum() {
        val f = FareConfig(minFareBs = 5.0, minPricePerKm = 3.0, pricePerMinute = 2.0, timeMode = TimePricingMode.SEPARATE_MINIMUM)
        val b = ok(FareCalculator.compute(req(), f, noTiers))
        // max(5, 21, 36) = 36
        assertEquals(36.0, b.required, 1e-9)
        assertEquals(FareDriver.TIME_MIN, b.dominant)
    }

    @Test fun missingDataIsInsufficientNeverZero() {
        val r = FareCalculator.compute(req(tripKm = null), FareConfig(), noTiers)
        assertTrue(r is FareResult.Insufficient)
        val r2 = FareCalculator.compute(req(pickupKm = -1.0), FareConfig(), noTiers)
        assertTrue(r2 is FareResult.Insufficient)
        val r3 = FareCalculator.compute(req(tripKm = Double.NaN), FareConfig(), noTiers)
        assertTrue(r3 is FareResult.Insufficient)
        val f = FareConfig(pricePerMinute = 1.0, timeMode = TimePricingMode.ADDITIVE)
        assertTrue(FareCalculator.compute(req(tripMin = null), f, noTiers) is FareResult.Insufficient)
    }

    @Test fun invalidTiersBlockCalculation() {
        val bad = TierConfig(tiers = listOf(Tier(0.0, 3.0, 4.0), Tier(4.0, null, 3.0)))
        assertTrue(FareCalculator.compute(req(), FareConfig(), bad) is FareResult.InvalidTiers)
    }

    @Test fun rounding() {
        assertEquals(22.0, FareCalculator.roundUp(21.01, false), 1e-9)
        assertEquals(21.0, FareCalculator.roundUp(21.0, false), 1e-9)
        assertEquals(21.1, FareCalculator.roundUp(21.01, true), 1e-9)
        assertEquals(21.3, FareCalculator.roundUp(21.3, true), 1e-9)
        // floating point: 0.1*3 = 0.30000000000000004 no debe subir a 0.4
        assertEquals(0.3, FareCalculator.roundUp(0.1 * 3, true), 1e-9)
    }

    @Test fun bsPerKm() {
        assertEquals(5.0, FareCalculator.bsPerKm(30.0, 6.0)!!, 1e-9)
        assertNull(FareCalculator.bsPerKm(30.0, 0.0))
        assertNull(FareCalculator.bsPerKm(null, 5.0))
    }
}
