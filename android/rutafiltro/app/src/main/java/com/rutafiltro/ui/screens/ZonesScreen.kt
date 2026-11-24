package com.rutafiltro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.GoldMode
import com.rutafiltro.domain.RedZoneTarget
import com.rutafiltro.domain.UnknownPolicy
import com.rutafiltro.domain.Zone
import com.rutafiltro.domain.ZoneConfig
import com.rutafiltro.domain.ZoneType
import com.rutafiltro.maps.MapModel
import com.rutafiltro.maps.PolygonIssue
import com.rutafiltro.maps.ZoneDraft
import com.rutafiltro.ui.components.ChoiceRow
import com.rutafiltro.ui.components.SectionCard
import com.rutafiltro.ui.components.SwitchRow
import com.rutafiltro.ui.theme.RfColors

fun zoneColor(t: ZoneType): Color = when (t) { ZoneType.RED -> RfColors.Red; ZoneType.GREEN -> RfColors.Green; ZoneType.GOLD -> RfColors.Gold }
fun zoneTypeLabel(t: ZoneType) = when (t) { ZoneType.RED -> "Roja (bloqueo)"; ZoneType.GREEN -> "Verde (favorita)"; ZoneType.GOLD -> "Dorada (operación)" }

typealias MapSlot = @Composable (model: MapModel, onClick: (GeoPoint, (GeoPoint) -> Float) -> Unit, modifier: Modifier) -> Unit

@Composable
fun ZonesScreen(
    zones: List<Zone>,
    config: ZoneConfig,
    onConfig: (ZoneConfig) -> Unit,
    onSave: (Zone, (List<PolygonIssue>) -> Unit) -> Unit,
    onToggle: (Zone) -> Unit,
    onDelete: (String) -> Unit,
    map: MapSlot,
) {
    var draft by remember { mutableStateOf<ZoneDraft?>(null) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var freehand by remember { mutableStateOf(true) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val d = draft
        Box(Modifier.fillMaxWidth().height(340.dp).clip(RoundedCornerShape(14.dp)).background(RfColors.SurfaceHigh)) {
            map(
                MapModel(zones = zones.filter { it.id != d?.id }, draft = d?.vertices ?: emptyList(), draftType = d?.type ?: ZoneType.RED, selectedVertex = d?.selected,
                    onFreehand = if (d != null && freehand) { trace -> draft = draft?.fromFreehand(trace) } else null),
                { p, dist -> draft = draft?.onTap(p, dist) },
                Modifier.fillMaxWidth().height(340.dp),
            )
        }
        if (d == null) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ZoneType.entries.forEach { t ->
                    Button(onClick = { draft = ZoneDraft(type = t, name = ZoneDraft.defaultName(t)); saveError = null },
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("zone-new-$t"),
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = zoneColor(t), contentColor = Color.Black)) {
                        Text(when (t) { ZoneType.RED -> "+ Roja"; ZoneType.GREEN -> "+ Verde"; ZoneType.GOLD -> "+ Dorada" })
                    }
                }
            }
            Text("Elija el tipo de zona y dibuje con el dedo sobre el mapa. Luego puede ajustar vértices en modo \"Por puntos\".",
                style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        } else {
            ChoiceRow(listOf(true, false), freehand, { if (it) "Trazo libre" else "Por puntos" }, { freehand = it }, tagPrefix = "draw-mode")
            Text(if (freehand) "Arrastre el dedo para rodear la zona; al soltar se cierra el polígono. El mapa no se mueve en este modo."
                else "Toque para agregar vértices. Toque un vértice para seleccionarlo y luego otro punto para moverlo.",
                style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
            ZoneDraftEditor(d, saveError, onChange = { draft = it }, onCancel = { draft = null; saveError = null }, onSave = {
                onSave(d.toZone()) { issues ->
                    if (issues.isEmpty()) { draft = null; saveError = null } else saveError = issues.joinToString(" · ") { it.message }
                }
            })
        }
        SectionCard("Zonas doradas") {
            ChoiceRow(GoldMode.entries, config.goldMode, { when (it) { GoldMode.OFF -> "No usar"; GoldMode.PREFERRED -> "Preferente"; GoldMode.EXCLUSIVE -> "Exclusiva" } },
                { onConfig(config.copy(goldMode = it)) }, tagPrefix = "gold")
            Text(
                when (config.goldMode) {
                    GoldMode.OFF -> "Las zonas doradas se dibujan pero no afectan la selección."
                    GoldMode.PREFERRED -> "Recogidas dentro de zonas doradas suman prioridad."
                    GoldMode.EXCLUSIVE -> "Solo se aceptan recogidas dentro de alguna zona dorada."
                }, style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim,
            )
            if (config.goldMode == GoldMode.EXCLUSIVE) SwitchRow("Destino puede salir de la zona", config.goldAllowDropoffOutside, { onConfig(config.copy(goldAllowDropoffOutside = it)) })
            SwitchRow("Descartar si faltan coordenadas", config.unknownCoordinates == UnknownPolicy.REJECT,
                { onConfig(config.copy(unknownCoordinates = if (it) UnknownPolicy.REJECT else UnknownPolicy.IGNORE)) },
                "Si una zona activa necesita la ubicación y la solicitud no la trae. Apagado: se omite la regla de zona")
        }
        SectionCard("Zonas guardadas (${zones.size})") {
            if (zones.isEmpty()) Text("Ninguna zona todavía", style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
            zones.forEach { z ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("zone-row")) {
                    Box(Modifier.size(12.dp).background(zoneColor(z.type), CircleShape))
                    Column(Modifier.weight(1f)) {
                        Text(z.name, style = MaterialTheme.typography.bodyLarge)
                        Text(buildString {
                            append(zoneTypeLabel(z.type)); append(" · ${z.vertices.size} vértices")
                            if (z.type == ZoneType.RED) append(" · bloquea " + when (z.redTarget) { RedZoneTarget.PICKUP -> "recogida"; RedZoneTarget.DROPOFF -> "destino"; RedZoneTarget.BOTH -> "ambos" })
                            else append(" · prioridad ${z.priority}")
                        }, style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
                    }
                    Switch(checked = z.enabled, onCheckedChange = { onToggle(z) })
                    IconButton(onClick = { draft = ZoneDraft.from(z); saveError = null }, modifier = Modifier.size(44.dp)) { Icon(Icons.Default.Edit, "Editar") }
                    IconButton(onClick = { onDelete(z.id) }, modifier = Modifier.size(44.dp).testTag("zone-del")) { Icon(Icons.Default.Delete, "Eliminar", tint = RfColors.Red) }
                }
            }
        }
    }
}

@Composable
private fun ZoneDraftEditor(d: ZoneDraft, saveError: String?, onChange: (ZoneDraft) -> Unit, onCancel: () -> Unit, onSave: () -> Unit) {
    SectionCard("Editando: ${zoneTypeLabel(d.type)}") {
        OutlinedTextField(d.name, { onChange(d.copy(name = it.take(40))) }, label = { Text("Nombre") }, singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("zone-name"))
        ChoiceRow(ZoneType.entries, d.type, { when (it) { ZoneType.RED -> "Roja"; ZoneType.GREEN -> "Verde"; ZoneType.GOLD -> "Dorada" } }, { onChange(d.copy(type = it)) })
        if (d.type == ZoneType.RED) {
            Text("Bloquear", style = MaterialTheme.typography.labelLarge)
            ChoiceRow(RedZoneTarget.entries, d.redTarget, { when (it) { RedZoneTarget.PICKUP -> "Recogida"; RedZoneTarget.DROPOFF -> "Destino"; RedZoneTarget.BOTH -> "Ambos" } },
                { onChange(d.copy(redTarget = it)) })
        } else {
            Text("Prioridad: ${d.priority}", style = MaterialTheme.typography.labelLarge)
            Slider(d.priority.toFloat(), { onChange(d.copy(priority = it.toInt())) }, valueRange = 1f..5f, steps = 3)
        }
        Text("${d.vertices.size} vértices" + (d.selected?.let { " · vértice ${it + 1} seleccionado: toque el mapa para moverlo" } ?: ""),
            style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("zone-vertex-count"))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onChange(d.undo()) }, enabled = d.history.isNotEmpty(), modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Deshacer") }
            OutlinedButton(onClick = { onChange(d.removeSelected()) }, enabled = d.selected != null, modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Borrar vértice") }
        }
        val issues = d.issues
        if (issues.isNotEmpty()) issues.forEach { Text("• ${it.message}", color = RfColors.Amber, style = MaterialTheme.typography.bodySmall) }
        saveError?.let { Text(it, color = RfColors.Red, style = MaterialTheme.typography.bodySmall) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Cancelar") }
            Button(onClick = onSave, enabled = issues.isEmpty(), modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag("zone-save")) { Text("Guardar") }
        }
    }
}
