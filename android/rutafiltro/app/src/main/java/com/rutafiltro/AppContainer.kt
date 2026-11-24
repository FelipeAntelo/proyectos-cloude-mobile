package com.rutafiltro

import android.content.Context
import com.rutafiltro.automation.AutomationEngine
import com.rutafiltro.automation.EngineState
import com.rutafiltro.automation.RulesSnapshot
import com.rutafiltro.data.AppDatabase
import com.rutafiltro.data.HistoryRepository
import com.rutafiltro.data.ProfileRepository
import com.rutafiltro.data.SettingsRepository
import com.rutafiltro.data.SourceMode
import com.rutafiltro.data.ZoneRepository
import com.rutafiltro.domain.Profile
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.domain.Zone
import com.rutafiltro.integration.ManualOfferSink
import com.rutafiltro.integration.ManualRideSource
import com.rutafiltro.integration.SimulatedOfferSink
import com.rutafiltro.integration.SimulatedRideSource
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Inyección de dependencias manual (sin frameworks): un único grafo por proceso. */
@OptIn(ExperimentalCoroutinesApi::class)
class AppContainer(context: Context, val db: AppDatabase = AppDatabase.build(context)) {
    /** Un fallo de E/S en segundo plano (disco lleno, etc.) se registra, no cierra la app. */
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default + CoroutineExceptionHandler { _, e ->
        android.util.Log.w("RutaFiltro", "Error en segundo plano", e)
    })

    val profiles = ProfileRepository(db)
    val zones = ZoneRepository(db)
    val history = HistoryRepository(db)
    val settings = SettingsRepository(context)

    val simulator = SimulatedRideSource()
    val simulatorSink = SimulatedOfferSink()
    val manualSource = ManualRideSource()

    val appSettings = settings.settings.stateIn(appScope, SharingStarted.Eagerly, com.rutafiltro.data.AppSettings())

    val activeProfile: StateFlow<Profile?> = combine(settings.settings, profiles.profiles) { s, list ->
        list.firstOrNull { it.id == s.activeProfileId } ?: list.firstOrNull()
    }.stateIn(appScope, SharingStarted.Eagerly, null)

    val activeZones: StateFlow<List<Zone>> = activeProfile.map { it?.id }.distinctUntilChanged()
        .flatMapLatest { id -> if (id == null) flowOf(emptyList()) else zones.zones(id) }
        .stateIn(appScope, SharingStarted.Eagerly, emptyList())

    val rules: StateFlow<RulesSnapshot> = combine(activeProfile, activeZones) { p, z ->
        RulesSnapshot(p?.id ?: -1, p?.name ?: "—", p?.settings ?: ProfileSettings(), z)
    }.stateIn(appScope, SharingStarted.Eagerly, RulesSnapshot(-1, "—", ProfileSettings(), emptyList()))

    private val alerter by lazy { com.rutafiltro.automation.Alerter(context) }

    val engine = AutomationEngine(appScope, rules, simulator, simulatorSink, recorder = { r ->
        history.add(r)
        if (com.rutafiltro.automation.AlertPolicy.shouldAlert(r, rules.value.settings.automation.soundAlert)) alerter.alert()
    })

    init {
        appScope.launch {
            val first = profiles.ensureDefaults()
            val s = settings.settings.first()
            if (s.activeProfileId < 0 || profiles.get(s.activeProfileId) == null) settings.setActiveProfile(first)
            applySourceMode(s.sourceMode)
        }
        appScope.launch {
            engine.status.map { it.state }.distinctUntilChanged().collect { runCatching { settings.setLastEngineState(it.name) } }
        }
    }

    /** Cambia el origen de datos. Solo con el motor desactivado (devuelve false si no). */
    fun applySourceMode(mode: SourceMode): Boolean = when (mode) {
        SourceMode.SIMULATOR -> engine.configure(simulator, simulatorSink)
        SourceMode.MANUAL -> engine.configure(manualSource, ManualOfferSink)
    }

    suspend fun setSourceMode(mode: SourceMode): Boolean {
        if (engine.status.value.state != EngineState.DISABLED) return false
        if (!applySourceMode(mode)) return false
        settings.setSourceMode(mode)
        return true
    }
}
