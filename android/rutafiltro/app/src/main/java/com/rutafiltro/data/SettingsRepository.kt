package com.rutafiltro.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** Una única instancia de DataStore por archivo (DataStore prohíbe dos activas sobre el mismo). */
private object DataStoreHolder {
    private val stores = HashMap<String, DataStore<Preferences>>()
    @Synchronized fun get(context: Context): DataStore<Preferences> {
        val file = context.applicationContext.preferencesDataStoreFile("rutafiltro_settings")
        return stores.getOrPut(file.absolutePath) { PreferenceDataStoreFactory.create(produceFile = { file }) }
    }
}

/** Origen de datos elegido por el conductor. */
enum class SourceMode(val label: String) { SIMULATOR("Simulador"), MANUAL("Manual (panel flotante)") }

data class AppSettings(
    val activeProfileId: Long = -1,
    val sourceMode: SourceMode = SourceMode.SIMULATOR,
    /** Último estado del motor (informativo: al reiniciar la app el motor arranca DESACTIVADO). */
    val lastEngineState: String = "DISABLED",
    val overlayX: Int = 24,
    val overlayY: Int = 320,
    val demandIncludeSimulated: Boolean = false,
)

/** Preferencias simples de la app (DataStore). Perfiles, zonas e historial van en Room. */
class SettingsRepository(private val store: DataStore<Preferences>) {
    constructor(context: Context) : this(DataStoreHolder.get(context))

    private object K {
        val profile = longPreferencesKey("active_profile")
        val source = stringPreferencesKey("source_mode")
        val engine = stringPreferencesKey("last_engine_state")
        val ox = intPreferencesKey("overlay_x")
        val oy = intPreferencesKey("overlay_y")
        val demandSim = booleanPreferencesKey("demand_include_sim")
    }

    val settings: Flow<AppSettings> = store.data.map { p ->
        AppSettings(
            activeProfileId = p[K.profile] ?: -1,
            sourceMode = runCatching { SourceMode.valueOf(p[K.source] ?: "") }.getOrDefault(SourceMode.SIMULATOR),
            lastEngineState = p[K.engine] ?: "DISABLED",
            overlayX = p[K.ox] ?: 24,
            overlayY = p[K.oy] ?: 320,
            demandIncludeSimulated = p[K.demandSim] ?: false,
        )
    }

    suspend fun setActiveProfile(id: Long) = store.edit { it[K.profile] = id }
    suspend fun setSourceMode(m: SourceMode) = store.edit { it[K.source] = m.name }
    suspend fun setLastEngineState(s: String) = store.edit { it[K.engine] = s }
    suspend fun setOverlayPosition(x: Int, y: Int) = store.edit { it[K.ox] = x; it[K.oy] = y }
    suspend fun setDemandIncludeSimulated(v: Boolean) = store.edit { it[K.demandSim] = v }
}
