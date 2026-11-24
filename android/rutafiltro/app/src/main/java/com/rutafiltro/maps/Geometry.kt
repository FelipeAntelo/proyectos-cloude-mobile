package com.rutafiltro.maps

import com.rutafiltro.domain.GeoPoint
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Geometría plana sobre lat/lng, suficiente para polígonos a escala de ciudad
 * (el error de proyección en ~30 km a la latitud de Santa Cruz es despreciable para
 * pertenencia a zonas). No se usa para polígonos que crucen el antimeridiano.
 */
object Geometry {
    private const val EARTH_RADIUS_KM = 6371.0088

    /**
     * Point-in-polygon por ray casting. Un punto exactamente sobre un borde o vértice
     * se considera DENTRO (regla inclusiva, documentada y probada).
     */
    fun contains(polygon: List<GeoPoint>, p: GeoPoint): Boolean {
        if (polygon.size < 3 || !p.isValid) return false
        val n = polygon.size
        for (i in 0 until n) {
            if (onSegment(polygon[i], polygon[(i + 1) % n], p)) return true
        }
        var inside = false
        var j = n - 1
        for (i in 0 until n) {
            val xi = polygon[i].lng; val yi = polygon[i].lat
            val xj = polygon[j].lng; val yj = polygon[j].lat
            if ((yi > p.lat) != (yj > p.lat)) {
                val xCross = (xj - xi) * (p.lat - yi) / (yj - yi) + xi
                if (p.lng < xCross) inside = !inside
            }
            j = i
        }
        return inside
    }

    fun haversineKm(a: GeoPoint, b: GeoPoint): Double {
        val dLat = Math.toRadians(b.lat - a.lat)
        val dLng = Math.toRadians(b.lng - a.lng)
        val h = sin(dLat / 2).let { it * it } +
            cos(Math.toRadians(a.lat)) * cos(Math.toRadians(b.lat)) * sin(dLng / 2).let { it * it }
        return 2 * EARTH_RADIUS_KM * asin(sqrt(h.coerceIn(0.0, 1.0)))
    }

    /** Área aproximada en km² (proyección equirectangular local + fórmula del cordón). */
    fun areaKm2(polygon: List<GeoPoint>): Double {
        if (polygon.size < 3) return 0.0
        val lat0 = Math.toRadians(polygon.map { it.lat }.average())
        val kx = 111.320 * cos(lat0)
        val ky = 110.574
        var s = 0.0
        for (i in polygon.indices) {
            val a = polygon[i]; val b = polygon[(i + 1) % polygon.size]
            s += (a.lng * kx) * (b.lat * ky) - (b.lng * kx) * (a.lat * ky)
        }
        return kotlin.math.abs(s) / 2.0
    }

    fun centroid(polygon: List<GeoPoint>): GeoPoint =
        GeoPoint(polygon.map { it.lat }.average(), polygon.map { it.lng }.average())

    internal fun onSegment(a: GeoPoint, b: GeoPoint, p: GeoPoint, eps: Double = 1e-9): Boolean {
        val cross = (b.lng - a.lng) * (p.lat - a.lat) - (b.lat - a.lat) * (p.lng - a.lng)
        if (kotlin.math.abs(cross) > eps) return false
        return p.lng in (minOf(a.lng, b.lng) - eps)..(maxOf(a.lng, b.lng) + eps) &&
            p.lat in (minOf(a.lat, b.lat) - eps)..(maxOf(a.lat, b.lat) + eps)
    }

    private fun orient(a: GeoPoint, b: GeoPoint, c: GeoPoint): Int {
        val v = (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)
        return when { v > 1e-12 -> 1; v < -1e-12 -> -1; else -> 0 }
    }

    /** true si los segmentos ab y cd se intersecan (incluye contacto y colinealidad). */
    fun segmentsIntersect(a: GeoPoint, b: GeoPoint, c: GeoPoint, d: GeoPoint): Boolean {
        val o1 = orient(a, b, c); val o2 = orient(a, b, d)
        val o3 = orient(c, d, a); val o4 = orient(c, d, b)
        if (o1 != o2 && o3 != o4) return true
        if (o1 == 0 && onSegment(a, b, c)) return true
        if (o2 == 0 && onSegment(a, b, d)) return true
        if (o3 == 0 && onSegment(c, d, a)) return true
        if (o4 == 0 && onSegment(c, d, b)) return true
        return false
    }

    /** true si algún par de aristas NO adyacentes se cruza (polígono no simple). */
    fun isSelfIntersecting(polygon: List<GeoPoint>): Boolean {
        val n = polygon.size
        if (n < 4) return false
        for (i in 0 until n) {
            val a = polygon[i]; val b = polygon[(i + 1) % n]
            for (j in i + 1 until n) {
                if (j == i || (j + 1) % n == i || (i + 1) % n == j) continue
                val c = polygon[j]; val d = polygon[(j + 1) % n]
                if (segmentsIntersect(a, b, c, d)) return true
            }
        }
        return false
    }
}
