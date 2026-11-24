package com.rutafiltro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rutafiltro.domain.FareCalculator
import com.rutafiltro.domain.Tier
import com.rutafiltro.domain.TierConfig
import com.rutafiltro.domain.TierMode
import com.rutafiltro.domain.TierValidator
import com.rutafiltro.ui.components.ChoiceRow
import com.rutafiltro.ui.components.DecimalField
import com.rutafiltro.ui.components.KeyValue
import com.rutafiltro.ui.components.SectionCard
import com.rutafiltro.ui.components.SwitchRow
import com.rutafiltro.ui.components.fmtBs
import com.rutafiltro.ui.components.fmtNum
import com.rutafiltro.ui.theme.RfColors

/** Operaciones de edición de tramos (puras, probadas en TierEditingTest). */
object TierEditing {
    fun sorted(c: TierConfig) = c.copy(tiers = c.tiers.sortedBy { it.fromKm })

    /** Cambia el límite superior del tramo i y encadena el inicio del siguiente (evita huecos). */
    fun setUpper(c: TierConfig, i: Int, toKm: Double): TierConfig {
        val t = c.tiers.toMutableList()
        t[i] = t[i].copy(toKm = toKm)
        if (i + 1 < t.size) t[i + 1] = t[i + 1].copy(fromKm = toKm)
        return c.copy(tiers = t)
    }

    /** Cambia un tramo entre "fijo" (precio total del rango) y "por km". */
    fun setFixed(c: TierConfig, i: Int, fixed: Boolean) = c.copy(tiers = c.tiers.toMutableList().also { it[i] = it[i].copy(fixed = fixed) })

    fun setPrice(c: TierConfig, i: Int, price: Double) = c.copy(tiers = c.tiers.toMutableList().also { it[i] = it[i].copy(pricePerKm = price) })

    /** Agrega un tramo al final: cierra el último (si era abierto) en from+5 km. */
    fun add(c: TierConfig): TierConfig {
        val t = sorted(c).tiers.toMutableList()
        if (t.isEmpty()) return c.copy(tiers = listOf(Tier(0.0, if (c.infiniteLastTier) null else 5.0, 3.0)))
        val last = t.last()
        val lastTo = last.toKm ?: (last.fromKm + 5.0)
        t[t.lastIndex] = last.copy(toKm = lastTo)
        t += Tier(lastTo, if (c.infiniteLastTier) null else lastTo + 5.0, last.pricePerKm)
        return c.copy(tiers = t)
    }

    /** Elimina el tramo i y une los vecinos para no dejar huecos. */
    fun remove(c: TierConfig, i: Int): TierConfig {
        val t = sorted(c).tiers.toMutableList()
        if (i !in t.indices) return c
        val removed = t.removeAt(i)
        if (t.isEmpty()) return c.copy(tiers = t)
        if (i == 0) t[0] = t[0].copy(fromKm = 0.0)
        else if (i <= t.lastIndex) t[i] = t[i].copy(fromKm = t[i - 1].toKm ?: removed.fromKm)
        else t[t.lastIndex] = t.last().copy(toKm = if (c.infiniteLastTier) null else removed.toKm)
        return c.copy(tiers = t)
    }

    fun setInfinite(c: TierConfig, infinite: Boolean): TierConfig {
        val t = sorted(c).tiers.toMutableList()
        if (t.isNotEmpty()) {
            val last = t.last()
            t[t.lastIndex] = if (infinite) last.copy(toKm = null) else last.copy(toKm = last.toKm ?: (last.fromKm + 10.0))
        }
        return c.copy(infiniteLastTier = infinite, tiers = t)
    }
}

@Composable
fun TiersScreen(config: TierConfig, onChange: (TierConfig) -> Unit) {
    val c = TierEditing.sorted(config)
    val issues = TierValidator.validate(c)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionCard("Tramos de distancia") {
            SwitchRow("Usar tramos", c.enabled, { onChange(c.copy(enabled = it)) }, "La tarifa por tramos es uno de los mínimos del cálculo")
            Text("Cada tramo puede ser de precio fijo (total del rango, p. ej. 0–3 km = Bs 12) o por km. Se pueden combinar.",
                style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
            Text("Cálculo", style = MaterialTheme.typography.labelLarge)
            ChoiceRow(TierMode.entries, c.mode, { if (it == TierMode.FULL_BAND) "Banda completa" else "Progresivo" }, { onChange(c.copy(mode = it)) }, tagPrefix = "tiermode")
            Text(
                if (c.mode == TierMode.FULL_BAND) "Toda la distancia al precio del tramo donde cae el total."
                else "Cada porción de distancia a su tramo (como escalones).",
                style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim,
            )
            SwitchRow("Tramos infinitos", c.infiniteLastTier, { onChange(TierEditing.setInfinite(c, it)) },
                "El último tramo cubre cualquier distancia. Apagado: viajes más largos se descartan", tag = "tier-infinite")
        }
        SectionCard {
            c.tiers.forEachIndexed { i, t ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${fmtNum(t.fromKm)} –", modifier = Modifier.size(width = 52.dp, height = 24.dp))
                    if (t.toKm == null) Text("∞ km", modifier = Modifier.weight(1f))
                    else DecimalField("Hasta", t.toKm, { onChange(TierEditing.setUpper(c, i, it)) }, Modifier.weight(1f), "km", max = 1000.0, tag = "tier-to-$i")
                    DecimalField(if (t.fixed) "Total" else "Precio", t.pricePerKm, { onChange(TierEditing.setPrice(c, i, it)) }, Modifier.weight(1f),
                        if (t.fixed) "Bs" else "Bs/km", max = if (t.fixed) 2000.0 else 100.0, tag = "tier-price-$i")
                    IconButton(onClick = { onChange(TierEditing.remove(c, i)) }, modifier = Modifier.size(44.dp).testTag("tier-del-$i")) {
                        Icon(Icons.Default.Delete, "Eliminar tramo", tint = RfColors.Red)
                    }
                }
                ChoiceRow(listOf(false, true), t.fixed, { if (it) "Precio fijo" else "Por km" }, { onChange(TierEditing.setFixed(c, i, it)) }, tagPrefix = "tier-fixed-$i")
            }
            OutlinedButton(onClick = { onChange(TierEditing.add(c)) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("tier-add")) { Text("Agregar tramo") }
            if (issues.isEmpty()) Text("Tramos válidos: cobertura continua sin solapes.", color = RfColors.Green, style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("tier-ok"))
            issues.forEach { Text("• ${it.message}", color = RfColors.Red, style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("tier-issue")) }
        }
        if (issues.isEmpty() && c.enabled) SectionCard("Vista previa (solo tramos)") {
            listOf(2.0, 5.0, 8.0, 12.0, 20.0, 35.0).forEach { km ->
                KeyValue("$km km".replace(".0 ", " "), FareCalculator.tierFare(km, c)?.let { fmtBs(FareCalculator.roundUp(it, true)) } ?: "fuera de tramos")
            }
        }
    }
}
