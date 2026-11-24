package com.rutafiltro.maps

import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.RedZoneTarget
import com.rutafiltro.domain.Zone
import com.rutafiltro.domain.ZoneType
import java.util.UUID

/** Borrador de polígono en edición. Operaciones puras (probadas en ZoneEditingTest). */
data class ZoneDraft(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val type: ZoneType = ZoneType.RED,
    val vertices: List<GeoPoint> = emptyList(),
    val selected: Int? = null,
    val priority: Int = 3,
    val redTarget: RedZoneTarget = RedZoneTarget.BOTH,
    val enabled: Boolean = true,
    val history: List<List<GeoPoint>> = emptyList(),
) {
    val issues get() = PolygonValidator.validate(vertices)

    private fun withVertices(v: List<GeoPoint>, sel: Int? = null) = copy(vertices = v, selected = sel, history = (history + listOf(vertices)).takeLast(50))

    /**
     * Toque en el mapa:
     * - cerca de un vértice (≤ [hitPx]) → lo selecciona (o lo deselecciona si ya lo estaba);
     * - con un vértice seleccionado → lo mueve al punto tocado;
     * - si no → agrega un vértice al final.
     */
    fun onTap(p: GeoPoint, distancePx: (GeoPoint) -> Float, hitPx: Float = 40f): ZoneDraft {
        val nearest = vertices.indices.minByOrNull { distancePx(vertices[it]) }
        if (nearest != null && distancePx(vertices[nearest]) <= hitPx) {
            return copy(selected = if (selected == nearest) null else nearest)
        }
        val sel = selected
        if (sel != null && sel in vertices.indices) {
            return withVertices(vertices.toMutableList().also { it[sel] = p }, null)
        }
        return withVertices(vertices + p, null)
    }

    fun removeSelected(): ZoneDraft {
        val sel = selected ?: return this
        if (sel !in vertices.indices) return copy(selected = null)
        return withVertices(vertices.toMutableList().also { it.removeAt(sel) }, null)
    }

    fun undo(): ZoneDraft = if (history.isEmpty()) this else copy(vertices = history.last(), history = history.dropLast(1), selected = null)

    fun toZone() = Zone(id, name.trim().ifEmpty { defaultName(type) }, type, vertices, enabled, priority.coerceIn(1, 5), redTarget)

    companion object {
        fun from(z: Zone) = ZoneDraft(z.id, z.name, z.type, z.vertices, null, z.priority, z.redTarget, z.enabled)
        fun defaultName(t: ZoneType) = when (t) { ZoneType.RED -> "Zona roja"; ZoneType.GREEN -> "Zona favorita"; ZoneType.GOLD -> "Zona dorada" }
    }
}
