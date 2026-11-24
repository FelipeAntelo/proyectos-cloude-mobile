package com.rutafiltro.overlay

import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import androidx.compose.ui.platform.ComposeView
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.rutafiltro.R
import com.rutafiltro.RutaFiltroApp
import com.rutafiltro.automation.EngineState
import com.rutafiltro.container
import com.rutafiltro.ui.MainActivity
import com.rutafiltro.ui.Section
import com.rutafiltro.ui.theme.RutaFiltroTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Servicio en primer plano del control flotante.
 *
 * - Ventana 1: burbuja circular movible (siempre visible mientras corre el servicio).
 * - Ventana 2: panel (se abre/cierra con la burbuja; cerrarlo NO detiene el servicio).
 * - Notificación persistente con Pausar/Reanudar y Detener.
 * - Batería: sin wakelocks ni sondeos; la notificación solo se actualiza al cambiar el estado;
 *   con la pantalla apagada se suspende el autorefresco del motor.
 */
class OverlayService : LifecycleService(), SavedStateRegistryOwner {
    private val savedStateController = SavedStateRegistryController.create(this)
    override val savedStateRegistry: SavedStateRegistry get() = savedStateController.savedStateRegistry

    private lateinit var wm: WindowManager
    private var bubble: ComposeView? = null
    private var panel: ComposeView? = null
    private lateinit var bubbleParams: WindowManager.LayoutParams
    private val panelOpen = MutableStateFlow(false)

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                Intent.ACTION_SCREEN_OFF -> container.engine.setInteractive(false)
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> container.engine.setInteractive(true)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        savedStateController.performAttach()
        savedStateController.performRestore(null)
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        startInForeground(buildNotification(container.engine.status.value.state))
        _running.value = true
        ContextCompat.registerReceiver(this, screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_USER_PRESENT)
        }, ContextCompat.RECEIVER_NOT_EXPORTED)
        if (Settings.canDrawOverlays(this)) showBubble() else stopSelf()
        lifecycleScope.launch {
            container.engine.status.map { it.state to it.sourceIsReal }.distinctUntilChanged().collect { (s, _) ->
                getSystemService(android.app.NotificationManager::class.java).notify(NOTIF_ID, buildNotification(s))
            }
        }
        lifecycleScope.launch { panelOpen.collect { if (it) showPanel() else hidePanel() } }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_TOGGLE_PAUSE -> container.engine.let { if (it.status.value.state == EngineState.PAUSED) it.resume() else it.pause() }
            ACTION_STOP -> stopEverything()
        }
        return START_NOT_STICKY
    }

    private fun startInForeground(n: Notification) {
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, NOTIF_ID, n, type)
    }

    private fun overlayType() = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY

    private fun ComposeView.attachOwners() {
        setViewTreeLifecycleOwner(this@OverlayService)
        setViewTreeSavedStateRegistryOwner(this@OverlayService)
    }

    private fun showBubble() {
        if (bubble != null) return
        val s = container.appSettings.value
        bubbleParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.TOP or Gravity.START; x = s.overlayX; y = s.overlayY }
        bubble = ComposeView(this).apply {
            attachOwners()
            setContent {
                RutaFiltroTheme {
                    FloatingBubble(
                        engine = container.engine,
                        onTap = { panelOpen.value = !panelOpen.value },
                        onDrag = { dx, dy ->
                            bubbleParams.x = (bubbleParams.x + dx).toInt().coerceAtLeast(0)
                            bubbleParams.y = (bubbleParams.y + dy).toInt().coerceAtLeast(0)
                            runCatching { wm.updateViewLayout(this, bubbleParams) }
                        },
                        onDragEnd = { lifecycleScope.launch { container.settings.setOverlayPosition(bubbleParams.x, bubbleParams.y) } },
                    )
                }
            }
        }
        wm.addView(bubble, bubbleParams)
    }

    private fun showPanel() {
        if (panel != null) return
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
            // Enfocable (para escribir en modo manual) pero sin capturar toques fuera del panel.
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.BOTTOM
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }
        panel = ComposeView(this).apply {
            attachOwners()
            setContent {
                RutaFiltroTheme {
                    OverlayPanel(
                        container = container,
                        onClose = { panelOpen.value = false },
                        onOpenSettings = { openApp(Section.SETTINGS.ordinal) },
                        onOpenApp = { openApp(0) },
                        onStopService = { stopEverything() },
                    )
                }
            }
        }
        wm.addView(panel, params)
    }

    private fun hidePanel() {
        panel?.let { runCatching { wm.removeView(it) } }
        panel = null
    }

    private fun openApp(section: Int) {
        panelOpen.value = false
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_SECTION, section))
    }

    /** Detiene TODO: motor desactivado + servicio terminado. */
    private fun stopEverything() {
        container.engine.deactivate()
        stopSelf()
    }

    override fun onDestroy() {
        hidePanel()
        bubble?.let { runCatching { wm.removeView(it) } }
        bubble = null
        runCatching { unregisterReceiver(screenReceiver) }
        container.engine.setInteractive(true)
        _running.value = false
        super.onDestroy()
    }

    private fun buildNotification(state: EngineState): Notification {
        val sim = !container.engine.status.value.sourceIsReal
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val toggle = PendingIntent.getService(this, 1, Intent(this, OverlayService::class.java).setAction(ACTION_TOGGLE_PAUSE), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 2, Intent(this, OverlayService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, RutaFiltroApp.CHANNEL_OVERLAY)
            .setSmallIcon(R.drawable.ic_stat_rutafiltro)
            .setContentTitle("RutaFiltro · ${com.rutafiltro.ui.components.stateLabel(state, sim)}")
            .setContentText(if (sim) "Modo simulación: sin ofertas reales" else "Control flotante activo")
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .setContentIntent(open)
            .addAction(0, if (state == EngineState.PAUSED) "Reanudar" else "Pausar", toggle)
            .addAction(0, "Detener", stop)
            .build()
    }

    companion object {
        const val NOTIF_ID = 42
        const val ACTION_TOGGLE_PAUSE = "com.rutafiltro.TOGGLE_PAUSE"
        const val ACTION_STOP = "com.rutafiltro.STOP"
        private val _running = MutableStateFlow(false)
        val running: StateFlow<Boolean> = _running.asStateFlow()

        fun start(c: Context) = ContextCompat.startForegroundService(c, Intent(c, OverlayService::class.java))
        fun stop(c: Context) = c.startService(Intent(c, OverlayService::class.java).setAction(ACTION_STOP))
    }
}

