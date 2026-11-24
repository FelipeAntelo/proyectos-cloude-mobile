package com.rutafiltro.overlay

import android.content.Context
import android.content.Intent
import android.view.WindowManager
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rutafiltro.RutaFiltroApp
import com.rutafiltro.automation.EngineState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowLooper
import org.robolectric.shadows.ShadowSettings

@RunWith(AndroidJUnit4::class)
class OverlayServiceTest {
    private val app get() = ApplicationProvider.getApplicationContext<RutaFiltroApp>()

    private fun windowViews(c: Context): Int {
        val wm = c.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return org.robolectric.shadow.api.Shadow.extract<org.robolectric.shadows.ShadowWindowManagerImpl>(wm).views.size
    }

    @Test fun startsForegroundWithBubbleAndStopsEverything() {
        ShadowSettings.setCanDrawOverlays(true)
        val controller = Robolectric.buildService(OverlayService::class.java).create()
        val service = controller.get()
        val before = 0
        ShadowLooper.idleMainLooper()
        assertTrue(OverlayService.running.value)
        val n = shadowOf(service).lastForegroundNotification
        assertNotNull("notificación persistente", n)
        assertTrue(n!!.flags and android.app.Notification.FLAG_ONGOING_EVENT != 0)
        assertEquals("solo la burbuja (panel cerrado)", before + 1, windowViews(service))

        app.container.engine.activate()
        assertEquals(EngineState.OBSERVING, app.container.engine.status.value.state)
        controller.withIntent(Intent(app, OverlayService::class.java).setAction(OverlayService.ACTION_TOGGLE_PAUSE)).startCommand(0, 1)
        assertEquals(EngineState.PAUSED, app.container.engine.status.value.state)
        controller.withIntent(Intent(app, OverlayService::class.java).setAction(OverlayService.ACTION_TOGGLE_PAUSE)).startCommand(0, 2)
        assertEquals(EngineState.OBSERVING, app.container.engine.status.value.state)

        controller.withIntent(Intent(app, OverlayService::class.java).setAction(OverlayService.ACTION_STOP)).startCommand(0, 3)
        assertTrue(shadowOf(service).isStoppedBySelf)
        assertEquals(EngineState.DISABLED, app.container.engine.status.value.state)
        controller.destroy()
        assertFalse(OverlayService.running.value)
        assertEquals(before, windowViews(service))
    }

    @Test fun withoutPermissionStopsItself() {
        ShadowSettings.setCanDrawOverlays(false)
        val controller = Robolectric.buildService(OverlayService::class.java).create()
        assertTrue(shadowOf(controller.get()).isStoppedBySelf)
        controller.destroy()
    }

    @Test fun screenOffSuspendsRefresh() {
        ShadowSettings.setCanDrawOverlays(true)
        val controller = Robolectric.buildService(OverlayService::class.java).create()
        val service = controller.get()
        service.sendBroadcast(Intent(Intent.ACTION_SCREEN_OFF))
        ShadowLooper.idleMainLooper()
        assertFalse("pantalla apagada => autorefresco suspendido", app.container.engine.isInteractive.value)
        service.sendBroadcast(Intent(Intent.ACTION_SCREEN_ON))
        ShadowLooper.idleMainLooper()
        assertTrue(app.container.engine.isInteractive.value)
        controller.destroy()
    }
}
