package com.rutafiltro.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rutafiltro.automation.EngineState
import com.rutafiltro.automation.EngineStatus
import com.rutafiltro.data.SourceMode
import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.domain.Tier
import com.rutafiltro.domain.TierConfig
import com.rutafiltro.domain.Zone
import com.rutafiltro.domain.ZoneConfig
import com.rutafiltro.maps.DemandAggregator
import com.rutafiltro.maps.PolygonValidator
import com.rutafiltro.maps.SantaCruz
import com.rutafiltro.ui.screens.FaresScreen
import com.rutafiltro.ui.screens.HistoryScreen
import com.rutafiltro.ui.screens.HomeScreen
import com.rutafiltro.ui.screens.MapSlot
import com.rutafiltro.ui.screens.OverlayUiState
import com.rutafiltro.ui.screens.SettingsScreen
import com.rutafiltro.ui.screens.TiersScreen
import com.rutafiltro.ui.screens.ZonesScreen
import com.rutafiltro.ui.theme.RutaFiltroTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w411dp-h891dp")
class ScreensUiTest {
    @get:Rule val rule = createComposeRule()

    /** Mapa falso: un botón que "toca" el siguiente punto de una lista. */
    private fun fakeMap(points: List<GeoPoint>): MapSlot = { model, onClick, _ ->
        var i by remember { mutableStateOf(0) }
        androidx.compose.foundation.layout.Column {
            Button(onClick = { val p = points[i % points.size]; i++; onClick(p) { q -> if (q == p) 0f else 9999f } }, modifier = Modifier.testTag("fake-map")) { Text("mapa") }
            // Simula un trazo con el dedo (solo existe si el mapa está en modo trazo libre)
            model.onFreehand?.let { f -> Button(onClick = { f(circle()) }, modifier = Modifier.testTag("fake-trace")) { Text("trazo") } }
        }
    }

    private fun circle() = (0..200).map { k ->
        val a = 2 * Math.PI * k / 200
        GeoPoint(SantaCruz.CENTER.lat + 0.01 * kotlin.math.sin(a), SantaCruz.CENTER.lng + 0.01 * kotlin.math.cos(a))
    }

    @Test fun fareTesterReflectsSettings() {
        var settings by mutableStateOf(ProfileSettings(tiers = TierConfig(enabled = false)))
        rule.setContent { RutaFiltroTheme { Box(Modifier.verticalScroll(rememberScrollState())) {
            FaresScreen(settings, emptyList()) { t -> settings = t(settings) } } } }
        // 1 + 6 = 7 km * 3 = 21 > mínima 10 -> pasajero 15 => contraoferta 21
        rule.onNodeWithTag("test-price").performScrollTo().performTextReplacement("15")
        rule.onNodeWithTag("test-decision").assertTextContains("CONTRAOFERTAR Bs 21")
        rule.onNodeWithTag("test-price").performTextReplacement("50")
        rule.onNodeWithTag("test-decision").assertTextContains("ACEPTAR a Bs 50")
        // Cambiar el mínimo por km en el formulario actualiza el perfil y el cálculo
        rule.onNodeWithTag("fare-km").performScrollTo().performTextReplacement("8")
        assertEquals(8.0, settings.fare.minPricePerKm, 1e-9)
        rule.onNodeWithTag("test-decision").performScrollTo().assertTextContains("CONTRAOFERTAR Bs 56")
        // Valor inválido no se guarda
        rule.onNodeWithTag("fare-km").performScrollTo().performTextReplacement("abc")
        assertEquals(8.0, settings.fare.minPricePerKm, 1e-9)
        // Datos faltantes => nunca oferta
        rule.onNodeWithTag("test-trip").performScrollTo().performTextReplacement("")
        rule.onNodeWithTag("test-decision").assertTextContains("DATOS INSUFICIENTES")
    }

    @Test fun tiersEditorAddsAndValidates() {
        var cfg by mutableStateOf(TierConfig())
        rule.setContent { RutaFiltroTheme { Box(Modifier.verticalScroll(rememberScrollState())) { TiersScreen(cfg) { cfg = it } } } }
        rule.onNodeWithTag("tier-ok").performScrollTo().assertIsDisplayed()
        rule.onNodeWithTag("tier-add").performScrollTo().performClick()
        assertEquals(5, cfg.tiers.size)
        rule.onNodeWithTag("tier-ok").performScrollTo().assertIsDisplayed()
        rule.onNodeWithTag("tier-to-0").performScrollTo().performTextReplacement("2")
        assertEquals(2.0, cfg.tiers[1].fromKm, 1e-9)
        rule.onNodeWithTag("tier-del-1").performScrollTo().performClick()
        assertEquals(4, cfg.tiers.size)
        rule.onNodeWithTag("tier-ok").performScrollTo().assertIsDisplayed()
    }

    @Test fun tiersEditorShowsGapError() {
        rule.setContent { RutaFiltroTheme { TiersScreen(TierConfig(tiers = listOf(Tier(0.0, 3.0, 4.0), Tier(5.0, null, 3.0)))) {} } }
        rule.onAllNodesWithTag("tier-issue")[0].assertTextContains("Hueco", substring = true)
    }

    @Test fun homeButtonsFollowStateAndNeverSaySentWhenSimulated() {
        var status by mutableStateOf(EngineStatus())
        var activated = 0
        rule.setContent { RutaFiltroTheme { Box(Modifier.verticalScroll(rememberScrollState())) {
            HomeScreen(status, emptyList(), null, SourceMode.SIMULATOR, emptyList(), OverlayUiState(false, false),
                { activated++ }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {})
        } } }
        rule.onNodeWithTag("btn-activate").assertIsEnabled().performClick()
        assertEquals(1, activated)
        rule.onNodeWithTag("btn-pause").assertIsNotEnabled()
        rule.onNodeWithText("SIMULACIÓN", substring = true).assertIsDisplayed()
        status = EngineStatus(state = EngineState.OFFER_SENT, sourceIsReal = false, message = "x")
        rule.onNodeWithTag("engine-state").assertTextContains("Oferta SIMULADA registrada")
        rule.onNodeWithTag("btn-pause").assertIsEnabled()
        rule.onNodeWithTag("btn-activate").assertIsNotEnabled()
        status = EngineStatus(state = EngineState.PAUSED)
        rule.onNodeWithTag("btn-activate").assertTextContains("Reanudar").assertIsEnabled()
        rule.onNodeWithTag("btn-overlay").performScrollTo().assertTextContains("Conceder permiso")
    }

    @Test fun zonesEditorDrawsAndSavesPolygon() {
        val c = SantaCruz.CENTER
        val pts = listOf(GeoPoint(c.lat, c.lng), GeoPoint(c.lat, c.lng + 0.01), GeoPoint(c.lat + 0.01, c.lng + 0.01), GeoPoint(c.lat + 0.01, c.lng))
        val saved = mutableListOf<Zone>()
        rule.setContent { RutaFiltroTheme { Box(Modifier.verticalScroll(rememberScrollState())) {
            ZonesScreen(saved.toList(), ZoneConfig(), {}, { z, cb -> saved += z; cb(PolygonValidator.validate(z.vertices)) }, {}, {}, fakeMap(pts))
        } } }
        rule.onNodeWithTag("zone-new-GOLD").performClick()
        rule.onNodeWithTag("zone-save").performScrollTo().assertIsNotEnabled()
        rule.onNodeWithTag("draw-mode-false").performScrollTo().performClick()
        repeat(4) { rule.onNodeWithTag("fake-map").performScrollTo().performClick() }
        rule.onNodeWithTag("zone-vertex-count").performScrollTo().assertTextContains("4 vértices", substring = true)
        rule.onNodeWithTag("zone-name").performScrollTo().performTextReplacement("Equipetrol")
        rule.onNodeWithTag("zone-save").performScrollTo().assertIsEnabled().performClick()
        assertEquals(1, saved.size)
        assertEquals("Equipetrol", saved[0].name)
        assertEquals(com.rutafiltro.domain.ZoneType.GOLD, saved[0].type)
        assertEquals(4, saved[0].vertices.size)
    }

    @Test fun zonesFreehandDrawing() {
        val saved = mutableListOf<Zone>()
        rule.setContent { RutaFiltroTheme { Box(Modifier.verticalScroll(rememberScrollState())) {
            ZonesScreen(emptyList(), ZoneConfig(), {}, { z, cb -> saved += z; cb(PolygonValidator.validate(z.vertices)) }, {}, {}, fakeMap(listOf(SantaCruz.CENTER)))
        } } }
        assertTrue(rule.onAllNodesWithTag("fake-trace").fetchSemanticsNodes().isEmpty()) // sin editar, no hay trazo
        rule.onNodeWithTag("zone-new-RED").performClick()
        rule.onNodeWithTag("fake-trace").performScrollTo().performClick()
        rule.onNodeWithTag("zone-save").performScrollTo().assertIsEnabled().performClick()
        assertEquals(1, saved.size)
        assertTrue(saved[0].vertices.size >= 8)
    }

    @Test fun tierFixedToggleChangesUnit() {
        var cfg by mutableStateOf(TierConfig())
        rule.setContent { RutaFiltroTheme { Box(Modifier.verticalScroll(rememberScrollState())) { TiersScreen(cfg) { cfg = it } } } }
        rule.onNodeWithTag("tier-fixed-0-true").performScrollTo().performClick()
        assertTrue(cfg.tiers[0].fixed)
        rule.onNodeWithTag("tier-price-0").performScrollTo().performTextReplacement("12")
        assertEquals(12.0, cfg.tiers[0].pricePerKm, 1e-9)
    }

    @Test fun settingsShowsHonestIntegrationStatus() {
        rule.setContent { RutaFiltroTheme { Box(Modifier.verticalScroll(rememberScrollState())) { SettingsScreen(true, false, {}, {}) } } }
        assertEquals(2, rule.onAllNodesWithTag("integration-NOT_AVAILABLE").fetchSemanticsNodes().size)
        rule.onNodeWithText("API oficial de inDrive para conductores").assertIsDisplayed()
    }

    @Test fun demandMapRefusesWithInsufficientData() {
        rule.setContent { RutaFiltroTheme { HistoryScreen(emptyList(), DemandAggregator.aggregate(emptyList()), false, {}, {}, fakeMap(listOf(SantaCruz.CENTER))) } }
        rule.onNodeWithTag("hist-view-true").performClick()
        rule.onNodeWithTag("demand-insufficient").assertIsDisplayed()
        assertTrue(rule.onAllNodesWithTag("fake-map").fetchSemanticsNodes().isEmpty())
    }
}
