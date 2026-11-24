package com.rutafiltro.maps

import com.rutafiltro.domain.GeoPoint
import kotlin.math.cos

/** Simplificación de trazos libres (Ramer–Douglas–Peucker) para convertirlos en polígonos editables. */
object Simplify {
    /** Distancia (m) de p al segmento ab, en proyección local. */
    private fun distM(p: GeoPoint, a: GeoPoint, b: GeoPoint): Double {
        val ky = 110_574.0
        val kx = 111_320.0 * cos(Math.toRadians(a.lat))
        val ax = a.lng * kx; val ay = a.lat * ky
        val bx = b.lng * kx; val by = b.lat * ky
        val px = p.lng * kx; val py = p.lat * ky
        val dx = bx - ax; val dy = by - ay
        val len2 = dx * dx + dy * dy
        val t = if (len2 == 0.0) 0.0 else (((px - ax) * dx + (py - ay) * dy) / len2).coerceIn(0.0, 1.0)
        val cx = ax + t * dx; val cy = ay + t * dy
        return kotlin.math.hypot(px - cx, py - cy)
    }

    fun rdp(points: List<GeoPoint>, toleranceM: Double): List<GeoPoint> {
        if (points.size < 3) return points
        var maxD = 0.0; var idx = 0
        for (i in 1 until points.lastIndex) {
            val d = distM(points[i], points.first(), points.last())
            if (d > maxD) { maxD = d; idx = i }
        }
        return if (maxD > toleranceM) rdp(points.subList(0, idx + 1), toleranceM).dropLast(1) + rdp(points.subList(idx, points.size), toleranceM)
        else listOf(points.first(), points.last())
    }

    /**
     * Trazo libre → vértices de polígono: quita el cierre repetido, simplifica y, si aún quedan
     * demasiados vértices, aumenta la tolerancia hasta respetar [maxVertices].
     */
    fun freehandToPolygon(trace: List<GeoPoint>, toleranceM: Double = 30.0, maxVertices: Int = PolygonValidator.MAX_VERTICES): List<GeoPoint> {
        val pts = trace.filter { it.isValid }
        if (pts.size < 3) return pts
        var tol = toleranceM
        var out = rdp(pts, tol)
        while (out.size > maxVertices) { tol *= 1.5; out = rdp(pts, tol) }
        if (out.size > 3 && Geometry.haversineKm(out.first(), out.last()) * 1000 < tol) out = out.dropLast(1)
        return out
    }
}
