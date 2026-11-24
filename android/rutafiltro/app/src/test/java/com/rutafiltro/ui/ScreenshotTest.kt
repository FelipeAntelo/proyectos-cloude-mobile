package com.rutafiltro.ui

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rutafiltro.RutaFiltroApp
import com.rutafiltro.overlay.OverlayPanel
import com.rutafiltro.ui.screens.OverlayUiState
import com.rutafiltro.ui.theme.RfColors
import com.rutafiltro.ui.theme.RutaFiltroTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** Capturas reales de las pantallas (Robolectric Native Graphics). El mapa es un marcador: MapLibre no corre en JVM. */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xxhdpi")
class ScreenshotTest {
    @get:Rule val rule = createAndroidComposeRule<androidx.activity.ComponentActivity>()
    private val out = File(System.getProperty("user.dir"), "build/screenshots").apply { mkdirs() }

    private fun save(name: String) {
        rule.waitForIdle()
        val root = rule.activity.window.decorView
        val bmp = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        root.draw(android.graphics.Canvas(bmp))
        File(out, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun allSections() {
        val c = ApplicationProvider.getApplicationContext<RutaFiltroApp>().container
        val end = System.currentTimeMillis() + 10_000
        while (c.activeProfile.value == null && System.currentTimeMillis() < end) Thread.sleep(25)
        val vm = MainViewModel(c)
        rule.setContent { RutaFiltroTheme {
            RutaFiltroRoot(vm, OverlayUiState(true, false), true, RootCallbacks({}, {}, {}, {}), map = { _, _, m ->
                Box(m.background(RfColors.SurfaceHigh), contentAlignment = Alignment.Center) { Text("[ mapa MapLibre · Santa Cruz ]", color = RfColors.TextDim) }
            })
        } }
        Thread.sleep(300)
        save("01-inicio")
        Section.entries.drop(1).forEachIndexed { i, s ->
            rule.onNodeWithTag("tab-${s.name}").performClick()
            Thread.sleep(150)
            save("%02d-%s".format(i + 2, s.name.lowercase()))
        }
    }

    @Test fun overlayPanel() {
        val c = ApplicationProvider.getApplicationContext<RutaFiltroApp>().container
        c.engine.activate()
        rule.setContent { RutaFiltroTheme { Box(Modifier.fillMaxSize().background(RfColors.Graphite)) {
            OverlayPanel(c, {}, {}, {}, {})
        } } }
        Thread.sleep(300)
        save("09-panel-flotante")
        c.engine.deactivate()
    }
}
