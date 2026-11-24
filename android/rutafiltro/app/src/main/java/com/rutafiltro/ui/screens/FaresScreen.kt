package com.rutafiltro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.rutafiltro.domain.Decision
import com.rutafiltro.domain.FareDriver
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.domain.RideRequest
import com.rutafiltro.domain.RuleEngine
import com.rutafiltro.domain.TimePricingMode
import com.rutafiltro.domain.Zone
import com.rutafiltro.ui.components.ChoiceRow
import com.rutafiltro.ui.components.DecimalField
import com.rutafiltro.ui.components.KeyValue
import com.rutafiltro.ui.components.OptionalDecimalField
import com.rutafiltro.ui.components.SectionCard
import com.rutafiltro.ui.components.SwitchRow
import com.rutafiltro.ui.components.fmtBs
import com.rutafiltro.ui.components.fmtNum
import com.rutafiltro.ui.components.parseDecimal
import com.rutafiltro.ui.theme.RfColors

@Composable
fun FaresScreen(settings: ProfileSettings, zones: List<Zone>, onUpdate: ((ProfileSettings) -> ProfileSettings) -> Unit) {
    val f = settings.fare
    val fl = settings.filters
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionCard("Tarifa") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField("Tarifa mínima", f.minFareBs, { v -> onUpdate { it.copy(fare = it.fare.copy(minFareBs = v)) } }, Modifier.weight(1f), "Bs", max = 1000.0, tag = "fare-min")
                DecimalField("Mínimo por km", f.minPricePerKm, { v -> onUpdate { it.copy(fare = it.fare.copy(minPricePerKm = v)) } }, Modifier.weight(1f), "Bs/km", max = 100.0, tag = "fare-km")
            }
            DecimalField("Precio por minuto", f.pricePerMinute, { v -> onUpdate { it.copy(fare = it.fare.copy(pricePerMinute = v)) } }, suffix = "Bs/min", max = 50.0)
            Text("Uso del precio por minuto", style = MaterialTheme.typography.labelLarge)
            ChoiceRow(TimePricingMode.entries, f.timeMode, {
                when (it) { TimePricingMode.DISABLED -> "No usar"; TimePricingMode.ADDITIVE -> "Sumar"; TimePricingMode.SEPARATE_MINIMUM -> "Otro mínimo" }
            }, { v -> onUpdate { it.copy(fare = it.fare.copy(timeMode = v)) } })
            Text(
                when (f.timeMode) {
                    TimePricingMode.DISABLED -> "Exigida = máx(mínima, km totales × Bs/km, tramos)."
                    TimePricingMode.ADDITIVE -> "Exigida = máx(mínima, km × Bs/km, tramos) + minutos totales × Bs/min."
                    TimePricingMode.SEPARATE_MINIMUM -> "Exigida = máx(mínima, km × Bs/km, tramos, minutos totales × Bs/min)."
                } + " Km y minutos totales incluyen la recogida.",
                style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim,
            )
            SwitchRow("Contraofertar", f.counterOfferEnabled, { v -> onUpdate { it.copy(fare = it.fare.copy(counterOfferEnabled = v)) } },
                "Si el pasajero ofrece menos que la exigida, proponer la exigida en vez de descartar")
            SwitchRow("Aceptar decimales", f.acceptDecimals, { v -> onUpdate { it.copy(fare = it.fare.copy(acceptDecimals = v)) } },
                "Apagado: la oferta se redondea hacia arriba a Bs entero. Encendido: a múltiplos de 0,10 Bs")
        }
        SectionCard("Límites de oferta automática") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField("Importe máximo", f.maxAutoOfferBs, { v -> onUpdate { it.copy(fare = it.fare.copy(maxAutoOfferBs = v)) } }, Modifier.weight(1f), "Bs", max = 5000.0)
                DecimalField("Intentos por sesión", f.maxOffersPerSession.toDouble(), { v -> onUpdate { it.copy(fare = it.fare.copy(maxOffersPerSession = v.toInt())) } }, Modifier.weight(1f), max = 500.0, integer = true)
            }
            Text("Ofertas por encima del importe máximo solo se preparan. 0 intentos = sin límite.", style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        }
        SectionCard("Distancias, tiempo y pasajero") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField("Recogida máx.", fl.maxPickupKm, { v -> onUpdate { it.copy(filters = it.filters.copy(maxPickupKm = v)) } }, Modifier.weight(1f), "km", max = 50.0, tag = "max-pickup")
                DecimalField("Llegada máx.", fl.maxPickupMin, { v -> onUpdate { it.copy(filters = it.filters.copy(maxPickupMin = v)) } }, Modifier.weight(1f), "min", max = 120.0)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField("Trayecto máx.", fl.maxTripKm, { v -> onUpdate { it.copy(filters = it.filters.copy(maxTripKm = v)) } }, Modifier.weight(1f), "km", max = 500.0)
                DecimalField("Llegada preferida", fl.preferredPickupMin, { v -> onUpdate { it.copy(filters = it.filters.copy(preferredPickupMin = v)) } }, Modifier.weight(1f), "min", max = 120.0, tag = "pref-eta")
            }
            Text("0 = sin límite. La llegada preferida no descarta: da prioridad a los viajes más cercanos.", style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        }
        SectionCard("Calidad del cliente") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField("Calificación mín.", fl.minPassengerRating, { v -> onUpdate { it.copy(filters = it.filters.copy(minPassengerRating = v)) } }, Modifier.weight(1f), "★", max = 5.0)
                DecimalField("Viajes mínimos", fl.minPassengerTrips.toDouble(), { v -> onUpdate { it.copy(filters = it.filters.copy(minPassengerTrips = v.toInt())) } }, Modifier.weight(1f), max = 10_000.0, integer = true, tag = "min-trips")
            }
            Text("0 = sin filtro.", style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        }
        FareTester(settings, zones)
    }
}

/** Calculadora: aplica TODAS las reglas del perfil a un viaje de prueba. */
@Composable
fun FareTester(settings: ProfileSettings, zones: List<Zone>) {
    var price by rememberSaveable { mutableStateOf("25") }
    var pickup by rememberSaveable { mutableStateOf("1") }
    var trip by rememberSaveable { mutableStateOf("6") }
    var eta by rememberSaveable { mutableStateOf("4") }
    var dur by rememberSaveable { mutableStateOf("15") }
    SectionCard("Probar un viaje") {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OptionalDecimalField("Precio", price, { price = it }, Modifier.weight(1f), "Bs", tag = "test-price")
            OptionalDecimalField("Recogida", pickup, { pickup = it }, Modifier.weight(1f), "km", tag = "test-pickup")
            OptionalDecimalField("Trayecto", trip, { trip = it }, Modifier.weight(1f), "km", tag = "test-trip")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OptionalDecimalField("Llegada", eta, { eta = it }, Modifier.weight(1f), "min")
            OptionalDecimalField("Duración", dur, { dur = it }, Modifier.weight(1f), "min")
        }
        val e = RuleEngine.evaluate(
            RideRequest("prueba", "prueba", true, 0, passengerPriceBs = parseDecimal(price), pickupDistanceKm = parseDecimal(pickup),
                pickupEtaMin = parseDecimal(eta), tripDistanceKm = parseDecimal(trip), tripDurationMin = parseDecimal(dur)),
            settings, zones,
        )
        val color = when (e.decision) { Decision.ACCEPT -> RfColors.Green; Decision.COUNTER_OFFER -> RfColors.Gold; else -> RfColors.Red }
        Text(
            when (e.decision) {
                Decision.ACCEPT -> "ACEPTAR a ${fmtBs(e.offer?.priceBs)}"
                Decision.COUNTER_OFFER -> "CONTRAOFERTAR ${fmtBs(e.offer?.priceBs)}"
                Decision.REJECT -> "DESCARTAR"
                Decision.INSUFFICIENT_DATA -> "DATOS INSUFICIENTES"
            },
            color = color, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.testTag("test-decision"),
        )
        Text(e.reason, style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("test-reason"))
        e.fare?.let { b ->
            KeyValue("Distancia total (recogida + trayecto)", "${fmtNum(b.totalKm, 1)} km")
            KeyValue("Tarifa exigida", fmtBs(b.required), RfColors.Lime)
            KeyValue("Determinada por", when (b.dominant) {
                FareDriver.MIN_FARE -> "tarifa mínima"; FareDriver.PER_KM -> "Bs/km mínimo"; FareDriver.TIER -> "tramos"; FareDriver.TIME_MIN -> "tiempo"
            })
            KeyValue("Componentes", "mín ${fmtNum(b.minFareComponent)} · km ${fmtNum(b.perKmComponent)} · tramo ${fmtNum(b.tierComponent)} · tiempo ${fmtNum(b.timeComponent)}")
        }
        KeyValue("Bs/km con pasajero", fmtNum(e.bsPerKmTrip), RfColors.Lime)
        KeyValue("Bs/km total (incl. recogida)", fmtNum(e.bsPerKmTotal))
        e.offer?.autoBlockReason?.let { Text("Automático: $it", style = MaterialTheme.typography.bodySmall, color = RfColors.Amber) }
    }
}
