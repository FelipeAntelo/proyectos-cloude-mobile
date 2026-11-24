package com.rutafiltro.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.ContextCompat
import com.rutafiltro.container
import com.rutafiltro.maps.ZoneMap
import com.rutafiltro.overlay.OverlayService
import com.rutafiltro.ui.screens.OverlayUiState
import com.rutafiltro.ui.theme.RutaFiltroTheme

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels { MainViewModel.Factory(container) }
    private val overlayGranted = mutableStateOf(false)
    private val notifGranted = mutableStateOf(false)
    private val notifLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { refreshPermissions() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val initial = intent.getIntExtra(EXTRA_SECTION, 0)
        setContent {
            RutaFiltroTheme {
                val running by OverlayService.running.collectAsState()
                RutaFiltroRoot(
                    vm = vm,
                    overlay = OverlayUiState(overlayGranted.value, running),
                    notificationsGranted = notifGranted.value,
                    callbacks = RootCallbacks(
                        onToggleOverlay = ::toggleOverlay,
                        onRequestOverlay = ::requestOverlay,
                        onRequestNotifications = ::requestNotifications,
                        toast = { Toast.makeText(this, it, Toast.LENGTH_SHORT).show() },
                    ),
                    map = { model, onClick, modifier -> ZoneMap(model, onClick, modifier) },
                    initialSection = initial,
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshPermissions()
        container.engine.setInteractive(true)
    }

    private fun refreshPermissions() {
        overlayGranted.value = Settings.canDrawOverlays(this)
        notifGranted.value = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestOverlay() {
        startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
    }

    private fun requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun toggleOverlay() {
        if (!Settings.canDrawOverlays(this)) { requestOverlay(); return }
        if (OverlayService.running.value) OverlayService.stop(this)
        else {
            if (!notifGranted.value) requestNotifications()
            OverlayService.start(this)
        }
    }

    companion object { const val EXTRA_SECTION = "section" }
}
