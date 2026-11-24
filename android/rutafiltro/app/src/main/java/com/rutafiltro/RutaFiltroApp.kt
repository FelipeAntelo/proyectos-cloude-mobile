package com.rutafiltro

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class RutaFiltroApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_OVERLAY, "Control flotante", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Notificación persistente mientras el control flotante está activo"
                    setShowBadge(false)
                }
            )
        }
    }

    companion object { const val CHANNEL_OVERLAY = "overlay" }
}

val android.content.Context.container: AppContainer get() = (applicationContext as RutaFiltroApp).container
