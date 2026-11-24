package com.rutafiltro.maps

import com.rutafiltro.domain.GeoPoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GeometryTest {
    private val sq = listOf(GeoPoint(0.0, 0.0), GeoPoint(0.0, 1.0), GeoPoint(1.0, 1.0), GeoPoint(1.0, 0.0))
    // Forma de "C" (cóncava)
    private val concave = listOf(
        GeoPoint(0.0, 0.0), GeoPoint(0.0, 3.0), GeoPoint(1.0, 3.0), GeoPoint(1.0, 1.0),
        GeoPoint(2.0, 1.0), GeoPoint(2.0, 3.0), GeoPoint(3.0, 3.0), GeoPoint(3.0, 0.0),
    )

    @Test fun insideOutside() {
        assertTrue(Geometry.contains(sq, GeoPoint(0.5, 0.5)))
        assertFalse(Geometry.contains(sq, GeoPoint(1.5, 0.5)))
        assertFalse(Geometry.contains(sq, GeoPoint(-0.1, 0.5)))
    }

    @Test fun edgeAndVertexAreInside() {
        assertTrue(Geometry.contains(sq, GeoPoint(0.0, 0.5)))
        assertTrue(Geometry.contains(sq, GeoPoint(1.0, 1.0)))
    }

    @Test fun concavePolygon() {
        assertTrue(Geometry.contains(concave, GeoPoint(0.5, 2.0)))
        assertFalse(Geometry.contains(concave, GeoPoint(1.5, 2.0))) // en la "boca" de la C
        assertTrue(Geometry.contains(concave, GeoPoint(1.5, 0.5)))
    }

    @Test fun invalidPointOrPolygon() {
        assertFalse(Geometry.contains(sq, GeoPoint(Double.NaN, 0.5)))
        assertFalse(Geometry.contains(sq.take(2), GeoPoint(0.5, 0.5)))
    }

    @Test fun realSantaCruzSquare() {
        val c = SantaCruz.CENTER
        val d = 0.01
        val z = listOf(GeoPoint(c.lat - d, c.lng - d), GeoPoint(c.lat - d, c.lng + d), GeoPoint(c.lat + d, c.lng + d), GeoPoint(c.lat + d, c.lng - d))
        assertTrue(Geometry.contains(z, c))
        assertFalse(Geometry.contains(z, GeoPoint(-17.75, -63.18)))
        // ~2.2 km de lado => ~4.7 km²
        assertEquals(4.7, Geometry.areaKm2(z), 0.3)
    }

    @Test fun haversine() {
        // 1 grado de latitud ~ 111.2 km
        assertEquals(111.2, Geometry.haversineKm(GeoPoint(0.0, 0.0), GeoPoint(1.0, 0.0)), 0.2)
        assertEquals(0.0, Geometry.haversineKm(SantaCruz.CENTER, SantaCruz.CENTER), 1e-9)
    }

    @Test fun selfIntersection() {
        val bowtie = listOf(GeoPoint(0.0, 0.0), GeoPoint(1.0, 1.0), GeoPoint(0.0, 1.0), GeoPoint(1.0, 0.0))
        assertTrue(Geometry.isSelfIntersecting(bowtie))
        assertFalse(Geometry.isSelfIntersecting(sq))
        assertFalse(Geometry.isSelfIntersecting(concave))
    }
}
