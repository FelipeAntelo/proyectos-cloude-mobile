package com.rutafiltro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rutafiltro.domain.Profile
import com.rutafiltro.domain.ProfileKind
import com.rutafiltro.ui.components.SectionCard
import com.rutafiltro.ui.components.fmtBs
import com.rutafiltro.ui.theme.RfColors

fun kindLabel(k: ProfileKind) = when (k) {
    ProfileKind.CITY -> "Ciudad"; ProfileKind.NIGHT -> "Nocturno"; ProfileKind.SHORT -> "Cortos"; ProfileKind.LONG -> "Largos"; ProfileKind.CUSTOM -> "Personalizado"
}

@Composable
fun ProfilesScreen(
    profiles: List<Profile>, activeId: Long?,
    onSelect: (Long) -> Unit, onRename: (Long, String) -> Unit, onDuplicate: (Long) -> Unit,
    onDelete: (Long) -> Unit, onReset: (Long) -> Unit,
) {
    var renaming by remember { mutableStateOf<Profile?>(null) }
    var confirmReset by remember { mutableStateOf<Profile?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Cada perfil guarda sus tarifas, tramos, filtros, zonas y modo automático.", style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        profiles.forEach { p ->
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = p.id == activeId, onClick = { onSelect(p.id) }, modifier = Modifier.testTag("profile-radio-${p.id}"))
                    Column(Modifier.weight(1f)) {
                        Text(p.name, style = MaterialTheme.typography.titleMedium)
                        Text("${kindLabel(p.kind)} · mín ${fmtBs(p.settings.fare.minFareBs)} · ${fmtBs(p.settings.fare.minPricePerKm)}/km",
                            style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedButton(onClick = { renaming = p }, modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Renombrar") }
                    OutlinedButton(onClick = { onDuplicate(p.id) }, modifier = Modifier.weight(1f).heightIn(min = 44.dp).testTag("profile-dup-${p.id}")) { Text("Duplicar") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedButton(onClick = { confirmReset = p }, modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Restablecer") }
                    OutlinedButton(onClick = { onDelete(p.id) }, enabled = profiles.size > 1, modifier = Modifier.weight(1f).heightIn(min = 44.dp)) { Text("Eliminar", color = RfColors.Red) }
                }
            }
        }
    }
    renaming?.let { p ->
        var name by remember(p.id) { mutableStateOf(p.name) }
        AlertDialog(
            onDismissRequest = { renaming = null },
            title = { Text("Renombrar perfil") },
            text = { OutlinedTextField(name, { name = it.take(40) }, singleLine = true, modifier = Modifier.fillMaxWidth()) },
            confirmButton = { TextButton(onClick = { onRename(p.id, name); renaming = null }) { Text("Guardar") } },
            dismissButton = { TextButton(onClick = { renaming = null }) { Text("Cancelar") } },
        )
    }
    confirmReset?.let { p ->
        AlertDialog(
            onDismissRequest = { confirmReset = null },
            title = { Text("Restablecer \"${p.name}\"") },
            text = { Text("Vuelve a los valores base del tipo ${kindLabel(p.kind)}. Las zonas se conservan.") },
            confirmButton = { TextButton(onClick = { onReset(p.id); confirmReset = null }) { Text("Restablecer") } },
            dismissButton = { TextButton(onClick = { confirmReset = null }) { Text("Cancelar") } },
        )
    }
}
