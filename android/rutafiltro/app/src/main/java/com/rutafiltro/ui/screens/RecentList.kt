package com.rutafiltro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.ui.components.Pill
import com.rutafiltro.ui.components.fmtBs
import com.rutafiltro.ui.components.fmtNum
import com.rutafiltro.ui.components.outcomeColor
import com.rutafiltro.ui.theme.RfColors
import com.rutafiltro.ui.theme.RfColors.TextDim
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

@Composable
fun RecordRow(r: ProcessedRecord, showDetail: Boolean = true) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(timeFmt.format(Date(r.atMillis)), style = MaterialTheme.typography.bodySmall, color = TextDim)
            Pill(r.outcome.label, outcomeColor(r.outcome))
            if (r.simulated) Pill("SIM", RfColors.Sim)
            androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
            Text(fmtBs(r.offerBs ?: r.passengerBs), style = MaterialTheme.typography.labelLarge)
        }
        Text(r.reason, style = MaterialTheme.typography.bodySmall, maxLines = if (showDetail) 3 else 1, overflow = TextOverflow.Ellipsis)
        if (showDetail) Text(
            "Regla: ${r.rule.label} · ${fmtNum(r.tripKm, 1)} km trayecto / ${fmtNum(r.totalKm, 1)} km total · " +
                "Bs/km ${fmtNum(r.bsPerKmTrip)} (pasajero) · ${fmtNum(r.bsPerKmTotal)} (total)",
            style = MaterialTheme.typography.bodySmall, color = TextDim,
        )
    }
}

@Composable
fun RecentList(items: List<ProcessedRecord>, max: Int = 5, showDetail: Boolean = false) {
    if (items.isEmpty()) {
        Text("Sin operaciones todavía", style = MaterialTheme.typography.bodySmall, color = TextDim)
        return
    }
    items.take(max).forEachIndexed { i, r ->
        if (i > 0) HorizontalDivider(color = RfColors.Outline)
        RecordRow(r, showDetail)
    }
}
