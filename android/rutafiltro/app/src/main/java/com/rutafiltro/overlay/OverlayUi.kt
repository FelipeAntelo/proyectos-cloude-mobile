package com.rutafiltro.overlay

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.rutafiltro.AppContainer
import com.rutafiltro.automation.AutomationEngine
import com.rutafiltro.automation.EngineState
import com.rutafiltro.data.SourceMode
import com.rutafiltro.ui.components.SimBanner
import com.rutafiltro.ui.components.stateColor
import com.rutafiltro.ui.screens.EngineControls
import com.rutafiltro.ui.screens.ManualEntryForm
import com.rutafiltro.ui.screens.PreparedOfferCard
import com.rutafiltro.ui.screens.RecentList
import com.rutafiltro.ui.screens.StatusHeader
import com.rutafiltro.ui.theme.RfColors
import kotlinx.coroutines.launch

/** Burbuja circular de 56 dp: color = estado. Arrastrar para mover, tocar para abrir el panel. */
@Composable
fun FloatingBubble(engine: AutomationEngine, onTap: () -> Unit, onDrag: (Float, Float) -> Unit, onDragEnd: () -> Unit) {
    val status by engine.status.collectAsState()
    val c = stateColor(status.state)
    Box(
        Modifier.padding(4.dp).size(56.dp)
            .background(RfColors.Graphite, CircleShape)
            .border(3.dp, c, CircleShape)
            .pointerInput(Unit) { detectDragGestures(onDragEnd = onDragEnd) { change, drag -> change.consume(); onDrag(drag.x, drag.y) } }
            .pointerInput(Unit) { detectTapGestures(onTap = { onTap() }) }
            .testTag("bubble"),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            when (status.state) {
                EngineState.DISABLED -> "OFF"; EngineState.PAUSED -> "II"; EngineState.ERROR -> "!"
                EngineState.OFFER_PREPARED -> "Bs"; else -> "ON"
            },
            color = c, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
fun OverlayPanel(container: AppContainer, onClose: () -> Unit, onOpenSettings: () -> Unit, onOpenApp: () -> Unit, onStopService: () -> Unit) {
    val engine = container.engine
    val status by engine.status.collectAsState()
    val recent by engine.recent.collectAsState()
    val active by container.activeProfile.collectAsState()
    val app by container.appSettings.collectAsState()
    val scope = rememberCoroutineScope()
    val profiles by container.profiles.profiles.collectAsState(initial = emptyList())
    // El panel vive en su propia ventana (fuera de Scaffold/Surface): fijar color de contenido claro.
    androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides RfColors.Text) {
    Column(
        Modifier.fillMaxWidth().navigationBarsPadding().padding(8.dp)
            .background(RfColors.Surface, RoundedCornerShape(18.dp))
            .border(1.dp, RfColors.Outline, RoundedCornerShape(18.dp))
            .heightIn(max = 560.dp)
            .verticalScroll(rememberScrollState())
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("RutaFiltro", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            TextButton(onClick = onClose, modifier = Modifier.heightIn(min = 44.dp).testTag("panel-close")) { Text("Cerrar panel") }
        }
        if (app.sourceMode == SourceMode.SIMULATOR) SimBanner()
        StatusHeader(status)
        EngineControls(status, engine::activate, engine::pause, engine::resume, engine::deactivate)
        status.prepared?.let { PreparedOfferCard(it, engine::clearPrepared) }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(profiles, key = { it.id }) { p ->
                FilterChip(
                    selected = p.id == active?.id, onClick = { scope.launch { container.settings.setActiveProfile(p.id) } },
                    label = { Text(p.name) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = RfColors.Lime, selectedLabelColor = RfColors.OnLime),
                    modifier = Modifier.heightIn(min = 44.dp),
                )
            }
        }
        if (app.sourceMode == SourceMode.MANUAL && status.state.isRunning) {
            ManualEntryForm(onSubmit = { r -> scope.launch { container.manualSource.submit(r) } }, compact = true)
        }
        Text("Últimas operaciones", style = MaterialTheme.typography.labelLarge)
        RecentList(recent, max = 4)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onOpenSettings, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Configuración") }
            OutlinedButton(onClick = onOpenApp, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Abrir app") }
        }
        OutlinedButton(onClick = onStopService, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("panel-stop")) {
            Text("Detener servicio por completo", color = RfColors.Red)
        }
    }
    }
}

