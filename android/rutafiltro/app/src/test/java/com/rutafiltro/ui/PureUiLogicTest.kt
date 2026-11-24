package com.rutafiltro.ui

import com.rutafiltro.automation.Outcome
import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.data.JsonCodec
import com.rutafiltro.domain.Decision
import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.domain.RuleId
import com.rutafiltro.domain.TierConfig
import com.rutafiltro.domain.TierValidator
import com.rutafiltro.maps.DemandAggregator
import com.rutafiltro.maps.SantaCruz
import com.rutafiltro.maps.ZoneDraft
import com.rutafiltro.ui.components.parseDecimal
import com.rutafiltro.ui.screens.HistoryFilter
import com.rutafiltro.ui.screens.TierEditing
import com.rutafiltro.ui.screens.filterHistory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PureUiLogicTest {
    @Test fun tierEditingKeepsCoverage() {
        var c = TierConfig()
        c = TierEditing.setUpper(c, 0, 2.5)
        assertTrue(TierValidator.validate(c).isEmpty())
        assertEquals(2.5, c.tiers[1].fromKm, 1e-9)
        c = TierEditing.add(c)
        assertEquals(5, c.tiers.size)
        assertTrue(TierValidator.validate(c).isEmpty())
        for (i in listOf(1, 0, 2)) { c = TierEditing.remove(c, i); assertTrue("tras borrar $i: ${TierValidator.validate(c)}", TierValidator.validate(c).isEmpty()) }
        c = TierEditing.setInfinite(c, false)
        assertTrue(TierValidator.validate(c).isEmpty())
        c = TierEditing.setInfinite(c, true)
        assertTrue(TierValidator.validate(c).isEmpty())
        assertNull(c.tiers.last().toKm)
    }

    @Test fun removeLastTierClosesOrOpensCorrectly() {
        var c = TierEditing.setInfinite(TierConfig(), false)
        c = TierEditing.remove(c, c.tiers.lastIndex)
        assertTrue(TierValidator.validate(c).isEmpty())
    }

    @Test fun zoneDraftTapLogic() {
        val c = SantaCruz.CENTER
        // distancia en "px" simulada: 1e5 px por grado
        fun dist(a: GeoPoint) = { b: GeoPoint -> (kotlin.math.hypot(a.lat - b.lat, a.lng - b.lng) * 1e5).toFloat() }
        var d = ZoneDraft()
        val pts = listOf(GeoPoint(c.lat, c.lng), GeoPoint(c.lat, c.lng + 0.01), GeoPoint(c.lat + 0.01, c.lng + 0.01), GeoPoint(c.lat + 0.01, c.lng))
        pts.forEach { d = d.onTap(it, dist(it)) }
        assertEquals(4, d.vertices.size)
        assertTrue(d.issues.isEmpty())
        // tocar cerca del vértice 1 lo selecciona
        val near = GeoPoint(c.lat + 0.0001, c.lng + 0.01)
        d = d.onTap(near, dist(near))
        assertEquals(1, d.selected)
        // tocar lejos mueve el vértice seleccionado
        val target = GeoPoint(c.lat - 0.005, c.lng + 0.015)
        d = d.onTap(target, dist(target))
        assertEquals(target, d.vertices[1]); assertNull(d.selected)
        d = d.undo(); assertEquals(pts[1], d.vertices[1])
        d = d.onTap(near, dist(near)).removeSelected()
        assertEquals(3, d.vertices.size)
        assertEquals("Zona roja", d.toZone().name)
    }

    @Test fun demandRequiresMinimumSamplesAndLabelsSimulation() {
        fun r(i: Int, sim: Boolean, lat: Double = -17.783, lng: Double = -63.182) = ProcessedRecord("x$i", 0, "s", sim, "p", Decision.REJECT, RuleId.RATING, "", Outcome.REJECTED,
            null, null, null, null, null, null, null, lat, lng, null, null)
        val few = DemandAggregator.aggregate((1..10).map { r(it, false) })
        assertFalse(few.sufficient)
        val many = DemandAggregator.aggregate((1..40).map { r(it, false) } + (1..2).map { r(100 + it, false, -17.70, -63.10) })
        assertTrue(many.sufficient)
        assertEquals(1, many.cells.size) // la celda con 2 se oculta (< MIN_CELL_COUNT)
        assertTrue(many.label.startsWith("Estadística local"))
        val sim = DemandAggregator.aggregate((1..40).map { r(it, true) })
        assertTrue(sim.label.contains("SIMULACIÓN"))
        // duplicados por requestId no inflan la muestra
        assertEquals(1, DemandAggregator.aggregate(List(5) { r(1, false) }).totalSamples)
    }

    @Test fun historyFilters() {
        fun r(o: Outcome, sim: Boolean) = ProcessedRecord("i", 0, "s", sim, "p", Decision.ACCEPT, RuleId.OK, "", o, null, null, null, null, null, null, null, null, null, null, null)
        val items = listOf(r(Outcome.SENT_SIMULATED, true), r(Outcome.REJECTED, false), r(Outcome.PREPARED, false))
        assertEquals(2, filterHistory(items, HistoryFilter.OFFERS).size)
        assertEquals(1, filterHistory(items, HistoryFilter.DISCARDED).size)
        assertEquals(2, filterHistory(items, HistoryFilter.REAL).size)
    }

    @Test fun decimalParsing() {
        assertEquals(3.5, parseDecimal("3,5")!!, 1e-9)
        assertEquals(3.5, parseDecimal(" 3.5 ")!!, 1e-9)
        assertNull(parseDecimal("abc")); assertNull(parseDecimal("NaN"))
    }

    @Test fun jsonForwardCompatible() {
        val json = JsonCodec.encodeSettings(ProfileSettings())
        val withUnknown = json.dropLast(1) + ",\"campoFuturo\":123}"
        assertEquals(ProfileSettings(), JsonCodec.decodeSettings(withUnknown))
    }
}
