package com.rutafiltro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rutafiltro.automation.Outcome
import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.maps.DemandAggregator
import com.rutafiltro.maps.DemandGrid
import com.rutafiltro.maps.MapModel
import com.rutafiltro.ui.components.ChoiceRow
import com.rutafiltro.ui.components.KeyValue
import com.rutafiltro.ui.components.SectionCard
import com.rutafiltro.ui.components.SwitchRow
import com.rutafiltro.ui.components.fmtNum
import com.rutafiltro.ui.theme.RfColors

enum class HistoryFilter(val label: String) { ALL("Todas"), OFFERS("Ofertas"), DISCARDED("Descartadas"), REAL("Reales"), SIM("Simuladas") }

fun filterHistory(items: List<ProcessedRecord>, f: HistoryFilter) = when (f) {
    HistoryFilter.ALL -> items
    HistoryFilter.OFFERS -> items.filter { it.outcome in setOf(Outcome.PREPARED, Outcome.SENT, Outcome.SENT_SIMULATED) }
    HistoryFilter.DISCARDED -> items.filter { it.outcome == Outcome.REJECTED || it.outcome == Outcome.NEEDS_REVIEW }
    HistoryFilter.REAL -> items.filter { !it.simulated }
    HistoryFilter.SIM -> items.filter { it.simulated }
}

@Composable
fun HistoryScreen(
    items: List<ProcessedRecord>, demand: DemandGrid, includeSimulated: Boolean,
    onIncludeSimulated: (Boolean) -> Unit, onClear: () -> Unit, map: MapSlot,
) {
    var showDemand by remember { mutableStateOf(false) }
    var filter by remember { mutableStateOf(HistoryFilter.ALL) }
    var confirm by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ChoiceRow(listOf(false, true), showDemand, { if (it) "Mapa de demanda" else "Registro" }, { showDemand = it }, tagPrefix = "hist-view")
        if (showDemand) {
            SectionCard("Mapa de demanda") {
                Text(demand.label, color = if (demand.simulatedSamples > 0) RfColors.Sim else RfColors.Lime, style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.testTag("demand-label"))
                Text("Construido solo con solicitudes registradas en este teléfono (últimos 30 días). No es la demanda real de inDrive.",
                    style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
                SwitchRow("Incluir solicitudes simuladas", includeSimulated, onIncludeSimulated)
                if (!demand.sufficient) Text("Datos insuficientes: ${demand.totalSamples} de ${DemandAggregator.MIN_SAMPLES} solicitudes mínimas. No se muestra el mapa.",
                    color = RfColors.Amber, style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("demand-insufficient"))
            }
            if (demand.sufficient) {
                Box(Modifier.fillMaxWidth().height(340.dp).clip(RoundedCornerShape(14.dp))) {
                    map(MapModel(demand = demand.cells), { _, _ -> }, Modifier.fillMaxWidth().height(340.dp))
                }
                SectionCard("Celdas con más solicitudes (~550 m)") {
                    demand.cells.take(8).forEach { c -> KeyValue("${fmtNum(c.center.lat, 4)}, ${fmtNum(c.center.lng, 4)}", "${c.count} (${fmtNum(c.share * 100, 1)} %)") }
                }
            }
        } else {
            ChoiceRow(HistoryFilter.entries.take(3), filter.takeIf { it.ordinal < 3 } ?: HistoryFilter.ALL, { it.label }, { filter = it })
            ChoiceRow(HistoryFilter.entries.drop(3), filter, { it.label }, { filter = it })
            val shown = filterHistory(items, filter)
            SectionCard("${shown.size} registros") {
                if (shown.isEmpty()) Text("Sin registros", color = RfColors.TextDim, style = MaterialTheme.typography.bodySmall)
                shown.take(200).forEachIndexed { i, r ->
                    if (i > 0) HorizontalDivider(color = RfColors.Outline)
                    RecordRow(r)
                }
            }
            OutlinedButton(onClick = { confirm = true }, enabled = items.isNotEmpty(), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text("Borrar historial", color = RfColors.Red)
            }
        }
    }
    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false }, title = { Text("¿Borrar todo el historial?") },
        text = { Text("También vacía el mapa de demanda local.") },
        confirmButton = { TextButton(onClick = { onClear(); confirm = false }) { Text("Borrar") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancelar") } },
    )
}

