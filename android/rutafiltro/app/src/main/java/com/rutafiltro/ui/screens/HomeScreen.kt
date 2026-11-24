package com.rutafiltro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.rutafiltro.automation.EngineState
import com.rutafiltro.automation.EngineStatus
import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.data.SourceMode
import com.rutafiltro.domain.AutoMode
import com.rutafiltro.domain.Profile
import com.rutafiltro.domain.RideRequest
import com.rutafiltro.domain.TierValidator
import com.rutafiltro.ui.components.ChoiceRow
import com.rutafiltro.ui.components.KeyValue
import com.rutafiltro.ui.components.Pill
import com.rutafiltro.ui.components.SectionCard
import com.rutafiltro.ui.components.SimBanner
import com.rutafiltro.ui.components.fmtBs
import com.rutafiltro.ui.components.fmtNum
import com.rutafiltro.ui.components.stateColor
import com.rutafiltro.ui.components.stateLabel
import com.rutafiltro.ui.theme.RfColors

data class OverlayUiState(val permissionGranted: Boolean, val running: Boolean)

@Composable
fun EngineControls(status: EngineStatus, onActivate: () -> Unit, onPause: () -> Unit, onResume: () -> Unit, onDeactivate: () -> Unit) {
    val st = status.state
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = if (st == EngineState.PAUSED) onResume else onActivate,
            enabled = st == EngineState.DISABLED || st == EngineState.ERROR || st == EngineState.PAUSED,
            modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("btn-activate"),
        ) { Text(if (st == EngineState.PAUSED) "Reanudar" else "Activar") }
        OutlinedButton(
            onClick = onPause, enabled = st.isRunning,
            modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("btn-pause"),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 6.dp),
        ) { Text("Pausar", maxLines = 1) }
        OutlinedButton(
            onClick = onDeactivate, enabled = st != EngineState.DISABLED,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = RfColors.Red),
            modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("btn-deactivate"),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 6.dp),
        ) { Text("Desactivar", maxLines = 1, softWrap = false) }
    }
}

@Composable
fun StatusHeader(status: EngineStatus) {
    val simulated = !status.sourceIsReal
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(14.dp).background(stateColor(status.state), CircleShape))
        Column(Modifier.weight(1f)) {
            Text(stateLabel(status.state, simulated), style = MaterialTheme.typography.titleLarge, color = stateColor(status.state),
                modifier = Modifier.testTag("engine-state"))
            Text(status.message, style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        }
    }
}

@Composable
fun PreparedOfferCard(r: ProcessedRecord, onDone: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(RfColors.Gold.copy(alpha = 0.12f), MaterialTheme.shapes.medium).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text("Oferta preparada (ingrésela usted en inDrive)", color = RfColors.Gold, style = MaterialTheme.typography.labelLarge)
        Text(fmtBs(r.offerBs), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.testTag("prepared-price"))
        Text("Pasajero ${fmtBs(r.passengerBs)} · exigida ${fmtBs(r.requiredBs)}", style = MaterialTheme.typography.bodySmall)
        Text("Bs/km con pasajero ${fmtNum(r.bsPerKmTrip)} · Bs/km total ${fmtNum(r.bsPerKmTotal)}", style = MaterialTheme.typography.bodySmall)
        Text(r.reason, style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        OutlinedButton(onClick = onDone, modifier = Modifier.heightIn(min = 44.dp)) { Text("Listo") }
    }
}

@Composable
fun HomeScreen(
    status: EngineStatus,
    profiles: List<Profile>,
    active: Profile?,
    sourceMode: SourceMode,
    recent: List<ProcessedRecord>,
    overlay: OverlayUiState,
    onActivate: () -> Unit, onPause: () -> Unit, onResume: () -> Unit, onDeactivate: () -> Unit,
    onSelectProfile: (Long) -> Unit,
    onSourceMode: (SourceMode) -> Unit,
    onToggleOverlay: () -> Unit,
    onSimulateOne: () -> Unit, onSimulateBurst: () -> Unit, onSimulateTrip: (Boolean) -> Unit,
    onManualSubmit: (RideRequest) -> Unit,
    onClearPrepared: () -> Unit,
    onSimulateDecline: () -> Unit = {},
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!status.sourceIsReal && status.state != EngineState.DISABLED || sourceMode == SourceMode.SIMULATOR) SimBanner()
        SectionCard {
            StatusHeader(status)
            EngineControls(status, onActivate, onPause, onResume, onDeactivate)
            KeyValue("Procesadas en sesión", status.processed.toString())
            val maxOffers = if (status.state == EngineState.DISABLED) active?.settings?.fare?.maxOffersPerSession ?: 0 else status.maxOffersPerSession
            KeyValue("Intentos de oferta", "${status.sessionOfferAttempts} / ${if (maxOffers > 0) maxOffers else "∞"}")
            if (status.duplicatesIgnored > 0) KeyValue("Duplicadas ignoradas", status.duplicatesIgnored.toString())
            if (status.droppedOverload > 0) KeyValue("Perdidas por sobrecarga", status.droppedOverload.toString(), RfColors.Red)
            if (status.activeTrip) Pill("Viaje activo", RfColors.Amber)
            status.lastError?.let { Text("Último error: $it", color = RfColors.Red, style = MaterialTheme.typography.bodySmall) }
        }
        status.prepared?.let { PreparedOfferCard(it, onClearPrepared) }

        SectionCard("Perfil activo") {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(profiles, key = { it.id }) { p ->
                    FilterChip(
                        selected = p.id == active?.id, onClick = { onSelectProfile(p.id) }, label = { Text(p.name) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = RfColors.Lime, selectedLabelColor = RfColors.OnLime),
                        modifier = Modifier.heightIn(min = 44.dp).testTag("profile-chip-${p.id}"),
                    )
                }
            }
            active?.let { p ->
                val s = p.settings
                KeyValue("Tarifa mínima", fmtBs(s.fare.minFareBs))
                KeyValue("Mínimo por km", "${fmtBs(s.fare.minPricePerKm)}/km")
                KeyValue("Modo", if (s.automation.mode == AutoMode.AUTOMATIC) "Automático" else "Manual")
                if (TierValidator.validate(s.tiers).isNotEmpty()) Text(
                    "Los tramos tienen errores: no se preparará ninguna oferta hasta corregirlos.",
                    color = RfColors.Red, style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        SectionCard("Origen de datos") {
            ChoiceRow(SourceMode.entries, sourceMode, { it.label }, onSourceMode, tagPrefix = "source")
            Text(
                if (sourceMode == SourceMode.SIMULATOR) "Solicitudes sintéticas de Santa Cruz para probar el flujo completo."
                else "Usted transcribe la solicitud; RutaFiltro calcula y prepara la oferta. El envío lo hace usted en inDrive.",
                style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim,
            )
            if (status.state != EngineState.DISABLED) Text("Desactive el motor para cambiar de origen.", style = MaterialTheme.typography.bodySmall, color = RfColors.Amber)
            if (sourceMode == SourceMode.SIMULATOR) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onSimulateOne, modifier = Modifier.weight(1f).heightIn(min = 44.dp).testTag("sim-one")) { Text("1 solicitud") }
                    OutlinedButton(onClick = onSimulateBurst, modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Ráfaga ×10") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onSimulateTrip(true) }, modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Iniciar viaje") }
                    OutlinedButton(onClick = { onSimulateTrip(false) }, modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Terminar viaje") }
                }
                OutlinedButton(onClick = onSimulateDecline, modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp)) { Text("Pasajero rechazó la última oferta") }
            } else {
                ManualEntryForm(onManualSubmit)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onSimulateTrip(true) }, modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Tengo viaje activo") }
                    OutlinedButton(onClick = { onSimulateTrip(false) }, modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Viaje terminado") }
                }
            }
        }

        SectionCard("Control flotante") {
            Text(
                if (!overlay.permissionGranted) "Requiere permiso \"Mostrar sobre otras apps\"."
                else if (overlay.running) "Activo: botón flotante visible sobre otras apps." else "Detenido.",
                style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim,
            )
            Button(onClick = onToggleOverlay, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("btn-overlay")) {
                Text(when {
                    !overlay.permissionGranted -> "Conceder permiso"
                    overlay.running -> "Detener control flotante"
                    else -> "Iniciar control flotante"
                })
            }
        }

        SectionCard("Últimas operaciones") { RecentList(recent, max = 5) }
    }
}
