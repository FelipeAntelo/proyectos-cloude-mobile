package com.rutafiltro.overlay

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rutafiltro.RutaFiltroApp
import com.rutafiltro.automation.EngineState
import com.rutafiltro.ui.theme.RutaFiltroTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OverlayPanelUiTest {
    @get:Rule val rule = createComposeRule()

    @Test fun panelControlsEngineAndCloseDoesNotStop() {
        val c = ApplicationProvider.getApplicationContext<RutaFiltroApp>().container
        var closed = 0; var stopped = 0; var tapped = 0
        rule.setContent { RutaFiltroTheme {
            androidx.compose.foundation.layout.Column {
                FloatingBubble(c.engine, onTap = { tapped++ }, onDrag = { _, _ -> }, onDragEnd = {})
                OverlayPanel(c, onClose = { closed++ }, onOpenSettings = {}, onOpenApp = {}, onStopService = { stopped++ })
            }
        } }
        rule.onNodeWithText("OFF").assertExists()
        rule.onNodeWithTag("bubble").performClick()
        assertEquals(1, tapped)
        rule.onNodeWithTag("btn-activate").assertIsEnabled().performClick()
        rule.waitForIdle()
        assert(c.engine.status.value.state.isRunning)
        rule.onNodeWithTag("btn-pause").performClick()
        assertEquals(EngineState.PAUSED, c.engine.status.value.state)
        rule.onNodeWithText("II").assertExists()
        rule.onNodeWithTag("panel-close").performClick()
        assertEquals(1, closed)
        assertEquals("cerrar el panel no detiene el motor", EngineState.PAUSED, c.engine.status.value.state)
        rule.onNodeWithTag("panel-stop").performScrollTo().performClick()
        assertEquals(1, stopped)
        c.engine.deactivate()
    }
}
