package com.rutafiltro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rutafiltro.BuildConfig
import com.rutafiltro.integration.IntegrationCatalog
import com.rutafiltro.integration.IntegrationStatus
import com.rutafiltro.ui.components.KeyValue
import com.rutafiltro.ui.components.Pill
import com.rutafiltro.ui.components.SectionCard
import com.rutafiltro.ui.theme.RfColors

@Composable
fun SettingsScreen(
    overlayGranted: Boolean, notificationsGranted: Boolean,
    onRequestOverlay: () -> Unit, onRequestNotifications: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionCard("Permisos") {
            KeyValue("Mostrar sobre otras apps", if (overlayGranted) "Concedido" else "No concedido", if (overlayGranted) RfColors.Green else RfColors.Amber)
            if (!overlayGranted) OutlinedButton(onClick = onRequestOverlay, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Conceder") }
            KeyValue("Notificaciones", if (notificationsGranted) "Concedido" else "No concedido", if (notificationsGranted) RfColors.Green else RfColors.Amber)
            if (!notificationsGranted) OutlinedButton(onClick = onRequestNotifications, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Conceder") }
        }
        SectionCard("Estado de integración con inDrive") {
            IntegrationCatalog.entries.forEach { e ->
                Column(Modifier.fillMaxWidth().testTag("integration-${e.status}"), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Pill(when (e.status) {
                        IntegrationStatus.AVAILABLE -> "Disponible"; IntegrationStatus.SIMULATED -> "Simulado"; IntegrationStatus.NOT_AVAILABLE -> "No disponible"
                    }, when (e.status) { IntegrationStatus.AVAILABLE -> RfColors.Green; IntegrationStatus.SIMULATED -> RfColors.Sim; IntegrationStatus.NOT_AVAILABLE -> RfColors.Red })
                    Text(e.name, style = MaterialTheme.typography.titleMedium)
                    Text(e.detail, style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
                }
            }
        }
        SectionCard("Privacidad") {
            Text("• No se piden ni guardan credenciales de inDrive.\n• Sin telemetría, publicidad ni servidores de licencias.\n" +
                "• Todo (perfiles, zonas, historial) queda en este teléfono.\n• Única conexión de red: descarga de mapas (OpenFreeMap).",
                style = MaterialTheme.typography.bodySmall)
        }
        SectionCard("Licencias y atribución") {
            Text("Mapas: MapLibre Native (BSD-2). Teselas: OpenFreeMap, esquema OpenMapTiles. Datos © colaboradores de OpenStreetMap (ODbL).",
                style = MaterialTheme.typography.bodySmall)
            KeyValue("Versión", BuildConfig.VERSION_NAME)
        }
    }
}
