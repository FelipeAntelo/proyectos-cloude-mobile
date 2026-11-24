package com.rutafiltro.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.rutafiltro.AppContainer
import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.data.SourceMode
import com.rutafiltro.domain.DefaultProfiles
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.domain.RideRequest
import com.rutafiltro.domain.Zone
import com.rutafiltro.maps.DemandAggregator
import com.rutafiltro.maps.DemandGrid
import com.rutafiltro.maps.PolygonIssue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModel(val c: AppContainer) : ViewModel() {
    val profiles = c.profiles.profiles.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val activeProfile = c.activeProfile
    val zones = c.activeZones
    val status = c.engine.status
    val recent = c.engine.recent
    val appSettings = c.appSettings
    val history: StateFlow<List<ProcessedRecord>> = c.history.recent(500).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val demand: StateFlow<DemandGrid> = appSettings.map { it.demandIncludeSimulated }.distinctUntilChanged()
        .flatMapLatest { sim -> c.history.pickups(sim, System.currentTimeMillis() - 30L * 24 * 3600 * 1000) }
        .map { DemandAggregator.aggregate(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DemandAggregator.aggregate(emptyList()))

    fun updateSettings(transform: (ProfileSettings) -> ProfileSettings) {
        val p = activeProfile.value ?: return
        viewModelScope.launch { c.profiles.updateSettings(p.id, transform(p.settings)) }
    }

    fun selectProfile(id: Long) = viewModelScope.launch { c.settings.setActiveProfile(id) }
    fun renameProfile(id: Long, name: String) = viewModelScope.launch { c.profiles.rename(id, name) }
    fun duplicateProfile(id: Long) = viewModelScope.launch { c.profiles.duplicate(id)?.let { c.settings.setActiveProfile(it) } }
    fun deleteProfile(id: Long, onResult: (Boolean) -> Unit) = viewModelScope.launch {
        val ok = c.profiles.delete(id)
        if (ok && activeProfile.value?.id == id) profiles.value.firstOrNull { it.id != id }?.let { c.settings.setActiveProfile(it.id) }
        onResult(ok)
    }
    fun resetProfile(id: Long) = viewModelScope.launch {
        val p = c.profiles.get(id) ?: return@launch
        val base = DefaultProfiles.all().firstOrNull { it.second.first == p.kind }?.second?.second ?: ProfileSettings()
        c.profiles.updateSettings(id, base)
    }

    fun saveZone(zone: Zone, onResult: (List<PolygonIssue>) -> Unit) {
        val p = activeProfile.value ?: return
        viewModelScope.launch { onResult(c.zones.save(p.id, zone)) }
    }
    fun toggleZone(zone: Zone) { val p = activeProfile.value ?: return; viewModelScope.launch { c.zones.setEnabled(p.id, zone, !zone.enabled) } }
    fun deleteZone(id: String) = viewModelScope.launch { c.zones.delete(id) }

    fun activate() = c.engine.activate()
    fun pause() = c.engine.pause()
    fun resume() = c.engine.resume()
    fun deactivate() = c.engine.deactivate()
    fun clearPrepared() = c.engine.clearPrepared()

    fun simulateOne() = viewModelScope.launch { c.simulator.burst(1) }
    fun simulateBurst(n: Int) = viewModelScope.launch { c.simulator.burst(n) }
    fun simulateTrip(active: Boolean) = viewModelScope.launch { c.simulator.setTripActive(active); c.manualSource.setTripActive(active) }
    /** Simulador: el pasajero no aceptó la última oferta simulada (dispara un reintento si está permitido). */
    fun simulateDecline() = viewModelScope.launch {
        recent.value.firstOrNull { it.outcome == com.rutafiltro.automation.Outcome.SENT_SIMULATED }?.let { c.simulator.declineOffer(it.requestId) }
    }
    fun submitManual(r: RideRequest) = viewModelScope.launch { c.manualSource.submit(r) }

    fun setSourceMode(m: SourceMode, onResult: (Boolean) -> Unit) = viewModelScope.launch { onResult(c.setSourceMode(m)) }
    fun setDemandIncludeSimulated(v: Boolean) = viewModelScope.launch { c.settings.setDemandIncludeSimulated(v) }
    fun clearHistory() = viewModelScope.launch { c.history.clear() }

    class Factory(private val c: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = MainViewModel(c) as T
    }
}
