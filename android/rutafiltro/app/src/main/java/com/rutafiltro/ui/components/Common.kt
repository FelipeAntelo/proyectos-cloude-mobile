package com.rutafiltro.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.rutafiltro.automation.EngineState
import com.rutafiltro.automation.Outcome
import com.rutafiltro.ui.theme.RfColors
import java.util.Locale

fun fmtNum(v: Double?, decimals: Int = 2): String {
    if (v == null) return "—"
    if (v == Math.floor(v) && !v.isInfinite()) return v.toLong().toString()
    return String.format(Locale.US, "%.${decimals}f", v).trimEnd('0').trimEnd('.')
}
fun fmtBs(v: Double?) = if (v == null) "—" else "Bs ${fmtNum(v)}"

/** Acepta coma o punto decimal. */
fun parseDecimal(s: String): Double? = s.trim().replace(',', '.').toDoubleOrNull()?.takeIf { !it.isNaN() && !it.isInfinite() }

@Composable
fun SectionCard(title: String? = null, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(14.dp))
            .border(1.dp, RfColors.Outline, RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (title != null) Text(title, style = MaterialTheme.typography.titleMedium)
        content()
    }
}

@Composable
fun DecimalField(
    label: String,
    value: Double,
    onValue: (Double) -> Unit,
    modifier: Modifier = Modifier,
    suffix: String = "",
    min: Double = 0.0,
    max: Double = 100_000.0,
    integer: Boolean = false,
    tag: String? = null,
) {
    var text by remember { mutableStateOf(fmtNum(value)) }
    LaunchedEffect(value) { if (parseDecimal(text) != value) text = fmtNum(value) }
    val parsed = parseDecimal(text)
    val error = when {
        parsed == null -> "Número inválido"
        parsed < min || parsed > max -> "Entre ${fmtNum(min)} y ${fmtNum(max)}"
        integer && parsed != Math.floor(parsed) -> "Debe ser entero"
        else -> null
    }
    OutlinedTextField(
        value = text,
        onValueChange = { t ->
            text = t
            val p = parseDecimal(t)
            if (p != null && p in min..max && (!integer || p == Math.floor(p))) onValue(p)
        },
        label = { Text(label) },
        suffix = if (suffix.isNotEmpty()) ({ Text(suffix) }) else null,
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (integer) KeyboardType.Number else KeyboardType.Decimal),
        modifier = modifier.fillMaxWidth().let { if (tag != null) it.testTag(tag) else it },
    )
}

/** Campo opcional (vacío = desconocido). */
@Composable
fun OptionalDecimalField(label: String, text: String, onText: (String) -> Unit, modifier: Modifier = Modifier, suffix: String = "", tag: String? = null) {
    val invalid = text.isNotBlank() && parseDecimal(text) == null
    OutlinedTextField(
        value = text, onValueChange = onText, label = { Text(label) },
        suffix = if (suffix.isNotEmpty()) ({ Text(suffix) }) else null,
        isError = invalid, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = modifier.let { if (tag != null) it.testTag(tag) else it },
    )
}

@Composable
fun SwitchRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit, subtitle: String? = null, enabled: Boolean = true, tag: String? = null) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 8.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = RfColors.TextDim)
        }
        Switch(
            checked = checked, onCheckedChange = onChange, enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = RfColors.Lime, checkedThumbColor = RfColors.OnLime),
            modifier = if (tag != null) Modifier.testTag(tag) else Modifier,
        )
    }
}

@Composable
fun <T> ChoiceRow(options: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit, tagPrefix: String? = null) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { o ->
            FilterChip(
                selected = o == selected, onClick = { onSelect(o) }, label = { Text(label(o)) },
                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = RfColors.Lime, selectedLabelColor = RfColors.OnLime),
                modifier = Modifier.heightIn(min = 44.dp).let { if (tagPrefix != null) it.testTag("$tagPrefix-$o") else it },
            )
        }
    }
}

@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier) {
    Box(modifier.background(color.copy(alpha = 0.18f), RoundedCornerShape(50)).border(1.dp, color.copy(alpha = 0.6f), RoundedCornerShape(50))
        .padding(horizontal = 10.dp, vertical = 3.dp)) {
        Text(text, color = color, style = MaterialTheme.typography.labelMedium)
    }
}

fun stateColor(s: EngineState) = when (s) {
    EngineState.DISABLED -> RfColors.TextDim
    EngineState.OBSERVING, EngineState.ANALYZING -> RfColors.Lime
    EngineState.OFFER_PREPARED -> RfColors.Gold
    EngineState.OFFER_SENT -> RfColors.Green
    EngineState.PAUSED -> RfColors.Amber
    EngineState.ERROR -> RfColors.Red
}

fun outcomeColor(o: Outcome) = when (o) {
    Outcome.REJECTED, Outcome.SEND_FAILED -> RfColors.Red
    Outcome.NEEDS_REVIEW, Outcome.LIMIT_REACHED -> RfColors.Amber
    Outcome.PREPARED -> RfColors.Gold
    Outcome.SENT -> RfColors.Green
    Outcome.SENT_SIMULATED -> RfColors.Sim
}

/** Etiqueta del estado que NUNCA dice "enviada" si la oferta fue simulada. */
fun stateLabel(s: EngineState, simulated: Boolean) =
    if (s == EngineState.OFFER_SENT && simulated) "Oferta SIMULADA registrada" else s.label

@Composable
fun KeyValue(key: String, value: String, valueColor: Color = MaterialTheme.colorScheme.onSurface, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(key, color = RfColors.TextDim, style = MaterialTheme.typography.bodyMedium)
        Text(value, color = valueColor, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun RowScope.Spacer1() = androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))

@Composable
fun SimBanner(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().background(RfColors.Sim.copy(alpha = 0.16f), RoundedCornerShape(10.dp)).padding(10.dp)) {
        Text("SIMULACIÓN — ninguna oferta llega a pasajeros reales", color = RfColors.Sim, style = MaterialTheme.typography.labelLarge)
    }
}
