package com.rutafiltro.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rutafiltro.data.SourceMode
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.ui.components.stateColor
import com.rutafiltro.ui.components.stateLabel
import com.rutafiltro.ui.screens.AutoScreen
import com.rutafiltro.ui.screens.FaresScreen
import com.rutafiltro.ui.screens.HistoryScreen
import com.rutafiltro.ui.screens.HomeScreen
import com.rutafiltro.ui.screens.MapSlot
import com.rutafiltro.ui.screens.OverlayUiState
import com.rutafiltro.ui.screens.ProfilesScreen
import com.rutafiltro.ui.screens.SettingsScreen
import com.rutafiltro.ui.screens.TiersScreen
import com.rutafiltro.ui.screens.ZonesScreen
import com.rutafiltro.ui.theme.RfColors

enum class Section(val title: String) { HOME("Inicio"), FARES("Tarifas"), TIERS("Tramos"), AUTO("Auto"), ZONES("Zonas"), PROFILES("Perfiles"), HISTORY("Historial"), SETTINGS("Configuración") }

class RootCallbacks(
    val onToggleOverlay: () -> Unit,
    val onRequestOverlay: () -> Unit,
    val onRequestNotifications: () -> Unit,
    val toast: (String) -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RutaFiltroRoot(
    vm: MainViewModel,
    overlay: OverlayUiState,
    notificationsGranted: Boolean,
    callbacks: RootCallbacks,
    map: MapSlot,
    initialSection: Int = 0,
) {
    var tab by rememberSaveable { mutableIntStateOf(initialSection) }
    val status by vm.status.collectAsState()
    val profiles by vm.profiles.collectAsState()
    val active by vm.activeProfile.collectAsState()
    val zones by vm.zones.collectAsState()
    val recent by vm.recent.collectAsState()
    val app by vm.appSettings.collectAsState()
    val history by vm.history.collectAsState()
    val demand by vm.demand.collectAsState()
    val settings = active?.settings ?: ProfileSettings()
    val update: ((ProfileSettings) -> ProfileSettings) -> Unit = { vm.updateSettings(it) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Column {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("RutaFiltro")
                            Box(Modifier.size(10.dp).background(stateColor(status.state), CircleShape))
                            Text(stateLabel(status.state, !status.sourceIsReal), style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                )
                ScrollableTabRow(
                    selectedTabIndex = tab, edgePadding = 8.dp, containerColor = MaterialTheme.colorScheme.background,
                    indicator = { pos -> TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(pos[tab]), color = RfColors.Lime) },
                ) {
                    Section.entries.forEachIndexed { i, s ->
                        Tab(selected = i == tab, onClick = { tab = i }, text = { Text(s.title) }, modifier = Modifier.testTag("tab-${s.name}"))
                    }
                }
            }
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 12.dp)) {
            when (Section.entries[tab]) {
                Section.HOME -> HomeScreen(
                    status, profiles, active, app.sourceMode, recent, overlay,
                    vm::activate, vm::pause, vm::resume, vm::deactivate,
                    onSelectProfile = { vm.selectProfile(it) },
                    onSourceMode = { m -> vm.setSourceMode(m) { ok -> if (!ok) callbacks.toast("Desactive el motor para cambiar de origen") } },
                    onToggleOverlay = callbacks.onToggleOverlay,
                    onSimulateOne = { vm.simulateOne() }, onSimulateBurst = { vm.simulateBurst(10) }, onSimulateTrip = { vm.simulateTrip(it) },
                    onSimulateDecline = { vm.simulateDecline() },
                    onManualSubmit = { vm.submitManual(it) },
                    onClearPrepared = vm::clearPrepared,
                )
                Section.FARES -> FaresScreen(settings, zones, update)
                Section.TIERS -> TiersScreen(settings.tiers) { t -> update { it.copy(tiers = t) } }
                Section.AUTO -> AutoScreen(settings, app.sourceMode == SourceMode.SIMULATOR, update)
                Section.ZONES -> ZonesScreen(
                    zones, settings.zones, { z -> update { it.copy(zones = z) } },
                    onSave = { z, cb -> vm.saveZone(z, cb) }, onToggle = vm::toggleZone, onDelete = { vm.deleteZone(it) }, map = map,
                )
                Section.PROFILES -> ProfilesScreen(
                    profiles, active?.id, onSelect = { vm.selectProfile(it) }, onRename = { id, n -> vm.renameProfile(id, n) },
                    onDuplicate = { vm.duplicateProfile(it) },
                    onDelete = { id -> vm.deleteProfile(id) { ok -> if (!ok) callbacks.toast("Debe quedar al menos un perfil") } },
                    onReset = { vm.resetProfile(it) },
                )
                Section.HISTORY -> HistoryScreen(history, demand, app.demandIncludeSimulated, { vm.setDemandIncludeSimulated(it) }, { vm.clearHistory() }, map)
                Section.SETTINGS -> SettingsScreen(overlay.permissionGranted, notificationsGranted, callbacks.onRequestOverlay, callbacks.onRequestNotifications)
            }
        }
    }
}
