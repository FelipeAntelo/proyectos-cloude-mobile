package com.rutafiltro.automation

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** Cuándo avisar (pura, probada): solo ofertas preparadas o enviadas, una vez por registro. */
object AlertPolicy {
    fun shouldAlert(record: ProcessedRecord, enabled: Boolean): Boolean =
        enabled && record.outcome in setOf(Outcome.PREPARED, Outcome.SENT, Outcome.SENT_SIMULATED)
}

/** "Audio del viaje": tono corto + vibración. Sin archivos de audio ni red. */
class Alerter(context: Context) {
    private val app = context.applicationContext
    private val tone = runCatching { ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80) }.getOrNull()

    fun alert() {
        runCatching { tone?.startTone(ToneGenerator.TONE_PROP_BEEP2, 250) }
        runCatching {
            val v: Vibrator? = if (Build.VERSION.SDK_INT >= 31)
                app.getSystemService(VibratorManager::class.java)?.defaultVibrator
            else @Suppress("DEPRECATION") app.getSystemService(Vibrator::class.java)
            v?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 120, 80, 120), -1))
        }
    }
}
