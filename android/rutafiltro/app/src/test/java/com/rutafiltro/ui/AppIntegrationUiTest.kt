package com.rutafiltro.ui

import androidx.compose.material3.Text
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rutafiltro.RutaFiltroApp
import com.rutafiltro.automation.EngineState
import com.rutafiltro.ui.screens.OverlayUiState
import com.rutafiltro.ui.theme.RutaFiltroTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/** Grafo real (Room + DataStore + motor + simulador) manejado desde la UI. */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w411dp-h891dp")
class AppIntegrationUiTest {
    @get:Rule val rule = createComposeRule()
    private val app get() = ApplicationProvider.getApplicationContext<RutaFiltroApp>()

    /** Espera en tiempo REAL (Room/DataStore escriben en hilos reales, no en el reloj virtual de Compose). */
    private fun waitReal(timeoutMs: Long, cond: () -> Boolean) {
        val end = System.currentTimeMillis() + timeoutMs
        while (!cond()) {
            check(System.currentTimeMillis() < end) { "Condición no satisfecha en $timeoutMs ms" }
            Thread.sleep(25); rule.waitForIdle()
        }
    }

    @After fun tearDown() { app.container.engine.deactivate() }

    @Test fun activateSimulateAndRecordFromUi() {
        val c = app.container
        waitReal(10_000) { c.activeProfile.value != null }
        val vm = MainViewModel(c)
        rule.setContent { RutaFiltroTheme {
            RutaFiltroRoot(vm, OverlayUiState(true, false), true, RootCallbacks({}, {}, {}, {}), map = { _, _, _ -> Text("mapa") })
        } }
        rule.onNodeWithTag("btn-activate").performClick()
        // El autorefresco del simulador puede llevarlo enseguida a ANALIZANDO / OFERTA: basta con "en marcha".
        waitReal(5_000) { c.engine.status.value.state.isRunning }
        // 10 solicitudes sintéticas
        repeat(10) { rule.onNodeWithTag("sim-one").performScrollTo().performClick() }
        waitReal(10_000) { c.engine.status.value.processed + c.engine.status.value.duplicatesIgnored >= 1 }
        val saved = runBlocking { c.history.recent(50).first() }
        assertTrue(saved.isNotEmpty())
        assertTrue("todo lo del simulador queda marcado como simulado", saved.all { it.simulated })
        rule.onNodeWithTag("btn-deactivate").performScrollTo().performClick()
        waitReal(5_000) { c.engine.status.value.state == EngineState.DISABLED }
        rule.onNodeWithTag("engine-state").performScrollTo().assertTextContains("Desactivado")
    }

    @Test fun switchingProfileFromHomeChangesRules() {
        val c = app.container
        waitReal(10_000) { c.activeProfile.value != null }
        val vm = MainViewModel(c)
        rule.setContent { RutaFiltroTheme {
            RutaFiltroRoot(vm, OverlayUiState(true, false), true, RootCallbacks({}, {}, {}, {}), map = { _, _, _ -> Text("mapa") })
        } }
        waitReal(10_000) { vm.profiles.value.size == 5 }
        val night = vm.profiles.value.first { it.name == "Horario nocturno" }
        rule.onNodeWithTag("profile-chip-${night.id}").performScrollTo().performClick()
        waitReal(5_000) { c.rules.value.profileId == night.id }
        assertEquals(15.0, c.rules.value.settings.fare.minFareBs, 1e-9)
    }
}
