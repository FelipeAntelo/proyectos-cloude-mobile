package com.rutafiltro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rutafiltro.domain.AutoMode
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.domain.UnknownPolicy
import com.rutafiltro.ui.components.ChoiceRow
import com.rutafiltro.ui.components.DecimalField
import com.rutafiltro.ui.components.SectionCard
import com.rutafiltro.ui.components.SwitchRow
import com.rutafiltro.ui.theme.RfColors

@Composable
fun AutoScreen(settings: ProfileSettings, sinkCanSend: Boolean, onUpdate: ((ProfileSettings) -> ProfileSettings) -> Unit) {
    val a = settings.automation
    val f = settings.filters
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionCard("Modo") {
            ChoiceRow(AutoMode.entries, a.mode, { if (it == AutoMode.MANUAL) "Manual" else "Automático" },
                { v -> onUpdate { it.copy(automation = it.automation.copy(mode = v)) } }, tagPrefix = "mode")
            Text(
                if (a.mode == AutoMode.MANUAL) "Evalúa y prepara la oferta; usted decide y la envía en inDrive."
                else "\"Ofertas sin intervención manual\": envía solo si el destino de ofertas lo permite.",
                style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim,
            )
            Text(
                if (sinkCanSend) "Origen actual: simulador. Los envíos se registran como SIMULADOS."
                else "Origen actual sin envío automático: las ofertas quedan PREPARADAS. No existe integración autorizada con inDrive.",
                style = MaterialTheme.typography.bodySmall, color = if (sinkCanSend) RfColors.Sim else RfColors.Amber,
            )
        }
        SectionCard("Filtros adicionales") {
            SwitchRow("Omitir paradas adicionales", f.skipExtraStops, { v -> onUpdate { it.copy(filters = it.filters.copy(skipExtraStops = v)) } })
            if (f.skipExtraStops) DecimalField("Omitir desde (paradas)", f.maxExtraStopsThreshold.toDouble(),
                { v -> onUpdate { it.copy(filters = it.filters.copy(maxExtraStopsThreshold = v.toInt())) } }, min = 1.0, max = 10.0, integer = true)
            SwitchRow("Omitir solicitudes con descripción", f.skipWithDescription, { v -> onUpdate { it.copy(filters = it.filters.copy(skipWithDescription = v)) } },
                "Cualquier comentario. Para rechazar solo algunos, use las palabras de abajo")
            KeywordsField(f.rejectKeywords) { list -> onUpdate { it.copy(filters = it.filters.copy(rejectKeywords = list)) } }
            Text("Datos desconocidos", style = MaterialTheme.typography.labelLarge)
            PolicyRow("Recogida / llegada", f.unknownPickup) { v -> onUpdate { it.copy(filters = it.filters.copy(unknownPickup = v)) } }
            PolicyRow("Calificación", f.unknownRating) { v -> onUpdate { it.copy(filters = it.filters.copy(unknownRating = v)) } }
            PolicyRow("Paradas", f.unknownStops) { v -> onUpdate { it.copy(filters = it.filters.copy(unknownStops = v)) } }
            PolicyRow("Descripción", f.unknownDescription) { v -> onUpdate { it.copy(filters = it.filters.copy(unknownDescription = v)) } }
            Text("Precio o distancia del trayecto desconocidos nunca generan oferta.", style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        }
        SectionCard("Descartes") {
            SwitchRow("Limpiar viajes descartados", a.clearDiscarded, { v -> onUpdate { it.copy(automation = it.automation.copy(clearDiscarded = v)) } },
                "Oculta las descartadas si el origen lo permite (hoy solo el simulador)")
            SwitchRow("Rechazo agresivo", a.aggressiveReject, { v -> onUpdate { it.copy(automation = it.automation.copy(aggressiveReject = v)) } },
                "Datos insuficientes = descartar de inmediato (en vez de dejar para revisión)")
            DecimalField("Máx. descartes visuales por minuto", a.aggressiveMaxDismissPerMinute.toDouble(),
                { v -> onUpdate { it.copy(automation = it.automation.copy(aggressiveMaxDismissPerMinute = v.toInt())) } }, min = 1.0, max = 120.0, integer = true)
        }
        SectionCard("Intentos y aviso") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField("Intentos por viaje", a.maxAttemptsPerRequest.toDouble(),
                    { v -> onUpdate { it.copy(automation = it.automation.copy(maxAttemptsPerRequest = v.toInt())) } }, Modifier.weight(1f), min = 1.0, max = 5.0, integer = true, tag = "attempts")
                DecimalField("Incremento", a.retryIncrementBs,
                    { v -> onUpdate { it.copy(automation = it.automation.copy(retryIncrementBs = v)) } }, Modifier.weight(1f), "Bs", max = 100.0)
            }
            Text("Si el pasajero no acepta, se vuelve a ofertar sumando el incremento, sin pasar el importe máximo. Requiere que el origen avise el rechazo (hoy, el simulador).",
                style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
            SwitchRow("Audio del viaje", a.soundAlert, { v -> onUpdate { it.copy(automation = it.automation.copy(soundAlert = v)) } },
                "Tono y vibración cuando hay una oferta preparada o enviada", tag = "sound")
        }
        SectionCard("Autorefresco") {
            SwitchRow("Autorefrescar", a.autoRefreshEnabled, { v -> onUpdate { it.copy(automation = it.automation.copy(autoRefreshEnabled = v)) } },
                "Solo si el origen admite refresco; se suspende con pantalla apagada o motor en pausa")
            Text("Intervalo: ${a.autoRefreshSeconds} s", style = MaterialTheme.typography.bodyMedium)
            Slider(value = a.autoRefreshSeconds.toFloat(), onValueChange = { v -> onUpdate { it.copy(automation = it.automation.copy(autoRefreshSeconds = v.toInt())) } },
                valueRange = 2f..60f, steps = 57)
            DecimalField("Ventana anti-duplicados", a.dedupWindowSeconds.toDouble(),
                { v -> onUpdate { it.copy(automation = it.automation.copy(dedupWindowSeconds = v.toInt())) } }, suffix = "s", min = 10.0, max = 3600.0, integer = true)
        }
    }
}

/** Palabras separadas por coma: "mascota, sin propina, muchas paradas". */
@Composable
private fun KeywordsField(value: List<String>, onChange: (List<String>) -> Unit) {
    var text by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(value.joinToString(", ")) }
    androidx.compose.material3.OutlinedTextField(
        value = text,
        onValueChange = { t -> text = t; onChange(parseKeywords(t)) },
        label = { Text("Rechazar comentarios con estas palabras") },
        placeholder = { Text("mascota, sin propina, muchas paradas") },
        supportingText = { Text("Separadas por coma. No distingue mayúsculas ni tildes.") },
        modifier = Modifier.fillMaxWidth().testTag("keywords"),
    )
}

fun parseKeywords(t: String): List<String> = t.split(',', ';', '\n').map { it.trim() }.filter { it.isNotEmpty() }.distinct().take(50)

@Composable
private fun PolicyRow(label: String, value: UnknownPolicy, onChange: (UnknownPolicy) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
    }
    ChoiceRow(UnknownPolicy.entries, value, { if (it == UnknownPolicy.REJECT) "Descartar" else "Ignorar filtro" }, onChange)
}
