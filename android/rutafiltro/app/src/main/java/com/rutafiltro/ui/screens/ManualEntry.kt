package com.rutafiltro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rutafiltro.domain.RideRequest
import com.rutafiltro.integration.ManualRideSource
import com.rutafiltro.ui.components.OptionalDecimalField
import com.rutafiltro.ui.components.parseDecimal
import com.rutafiltro.ui.theme.RfColors

/**
 * Formulario rápido: el conductor transcribe lo que ve en inDrive. Campos vacíos =
 * desconocidos (el motor no los inventa). Usado en Inicio y en el panel flotante.
 */
@Composable
fun ManualEntryForm(onSubmit: (RideRequest) -> Unit, compact: Boolean = false) {
    var price by rememberSaveable { mutableStateOf("") }
    var pickupKm by rememberSaveable { mutableStateOf("") }
    var eta by rememberSaveable { mutableStateOf("") }
    var tripKm by rememberSaveable { mutableStateOf("") }
    var tripMin by rememberSaveable { mutableStateOf("") }
    var rating by rememberSaveable { mutableStateOf("") }
    var stops by rememberSaveable { mutableStateOf("") }
    var trips by rememberSaveable { mutableStateOf("") }
    var comment by rememberSaveable { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Datos que ve en inDrive (vacío = desconocido)", style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OptionalDecimalField("Precio", price, { price = it }, Modifier.weight(1f), "Bs", tag = "manual-price")
            OptionalDecimalField("Recogida", pickupKm, { pickupKm = it }, Modifier.weight(1f), "km", tag = "manual-pickup")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OptionalDecimalField("Trayecto", tripKm, { tripKm = it }, Modifier.weight(1f), "km", tag = "manual-trip")
            OptionalDecimalField("Llegada", eta, { eta = it }, Modifier.weight(1f), "min")
        }
        if (!compact) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OptionalDecimalField("Duración", tripMin, { tripMin = it }, Modifier.weight(1f), "min")
            OptionalDecimalField("Calif.", rating, { rating = it }, Modifier.weight(1f), "★")
            OptionalDecimalField("Paradas", stops, { stops = it }, Modifier.weight(1f))
        }
        if (!compact) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OptionalDecimalField("Viajes", trips, { trips = it }, Modifier.weight(1f))
            androidx.compose.material3.OutlinedTextField(comment, { comment = it.take(200) }, label = { Text("Comentario") }, singleLine = true, modifier = Modifier.weight(2f))
        }
        Button(
            onClick = {
                val now = System.currentTimeMillis()
                onSubmit(RideRequest(
                    id = "man-$now", sourceId = ManualRideSource.ID, simulated = false, receivedAtMillis = now,
                    passengerPriceBs = parseDecimal(price), pickupDistanceKm = parseDecimal(pickupKm), pickupEtaMin = parseDecimal(eta),
                    tripDistanceKm = parseDecimal(tripKm), tripDurationMin = parseDecimal(tripMin), passengerRating = parseDecimal(rating),
                    extraStops = parseDecimal(stops)?.toInt(), passengerTrips = parseDecimal(trips)?.toInt(),
                    // En el modo compacto no se pregunta el comentario: queda desconocido (null).
                    description = if (compact) null else comment,
                ))
            },
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("manual-evaluate"),
        ) { Text("Evaluar solicitud") }
    }
}
