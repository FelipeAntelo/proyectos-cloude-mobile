package com.rutafiltro.maps

import com.rutafiltro.domain.GeoPoint

enum class PolygonIssue(val message: String) {
    TOO_FEW_VERTICES("Se necesitan al menos 3 vértices"),
    TOO_MANY_VERTICES("Máximo ${PolygonValidator.MAX_VERTICES} vértices"),
    INVALID_COORDINATE("Hay coordenadas inválidas"),
    DUPLICATE_VERTEX("Hay vértices repetidos"),
    SELF_INTERSECTING("Los lados del polígono se cruzan"),
    ZERO_AREA("El polígono no tiene área (vértices alineados)"),
    TOO_LARGE("La zona supera ${PolygonValidator.MAX_SPAN_KM.toInt()} km de extensión"),
}

object PolygonValidator {
    const val MAX_VERTICES = 60
    const val MAX_SPAN_KM = 80.0
    /** Área mínima: 0,0005 km² (~ 22 m × 22 m). */
    const val MIN_AREA_KM2 = 0.0005

    fun validate(vertices: List<GeoPoint>): List<PolygonIssue> {
        val issues = mutableListOf<PolygonIssue>()
        if (vertices.size < 3) issues += PolygonIssue.TOO_FEW_VERTICES
        if (vertices.size > MAX_VERTICES) issues += PolygonIssue.TOO_MANY_VERTICES
        if (vertices.any { !it.isValid }) {
            issues += PolygonIssue.INVALID_COORDINATE
            return issues
        }
        if (vertices.size != vertices.distinctBy { (it.lat * 1e7).toLong() to (it.lng * 1e7).toLong() }.size) {
            issues += PolygonIssue.DUPLICATE_VERTEX
        }
        if (vertices.size >= 3) {
            if (Geometry.isSelfIntersecting(vertices)) issues += PolygonIssue.SELF_INTERSECTING
            if (Geometry.areaKm2(vertices) < MIN_AREA_KM2) issues += PolygonIssue.ZERO_AREA
            val span = vertices.maxOf { a -> vertices.maxOf { b -> Geometry.haversineKm(a, b) } }
            if (span > MAX_SPAN_KM) issues += PolygonIssue.TOO_LARGE
        }
        return issues
    }

    fun isValid(vertices: List<GeoPoint>) = validate(vertices).isEmpty()
}
