package com.rutafiltro.maps

import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.domain.GeoPoint
import kotlin.math.floor

data class DemandCell(val center: GeoPoint, val count: Int, val share: Double)

/**
 * Mapa de demanda a partir EXCLUSIVAMENTE de solicitudes registradas localmente.
 * No es demanda real de inDrive: es la muestra de solicitudes que este teléfono vio.
 */
data class DemandGrid(
    val cells: List<DemandCell>,
    val totalSamples: Int,
    val realSamples: Int,
    val simulatedSamples: Int,
    val sufficient: Boolean,
) {
    /** Etiqueta honesta del origen de los datos. */
    val label: String get() = when {
        totalSamples == 0 -> "Sin datos"
        simulatedSamples > 0 && realSamples == 0 -> "SIMULACIÓN (datos sintéticos)"
        simulatedSamples > 0 -> "Mixto: $realSamples observadas + $simulatedSamples SIMULADAS"
        else -> "Estadística local: $realSamples solicitudes observadas"
    }
}

object DemandAggregator {
    const val CELL_DEG = 0.005 // ~550 m en Santa Cruz
    const val MIN_SAMPLES = 30
    const val MIN_CELL_COUNT = 3

    fun aggregate(records: List<ProcessedRecord>): DemandGrid {
        val pts = records.mapNotNull { r ->
            val lat = r.pickupLat; val lng = r.pickupLng
            if (lat == null || lng == null) null else Triple(GeoPoint(lat, lng), r.simulated, r.requestId)
        }.filter { it.first.isValid }.distinctBy { it.third }
        val total = pts.size
        val sim = pts.count { it.second }
        val groups = pts.groupBy { (p, _, _) -> floor(p.lat / CELL_DEG).toLong() to floor(p.lng / CELL_DEG).toLong() }
        val cells = groups.filter { it.value.size >= MIN_CELL_COUNT }.map { (k, v) ->
            DemandCell(GeoPoint((k.first + 0.5) * CELL_DEG, (k.second + 0.5) * CELL_DEG), v.size, v.size.toDouble() / total)
        }.sortedByDescending { it.count }
        return DemandGrid(cells, total, total - sim, sim, total >= MIN_SAMPLES)
    }
}
