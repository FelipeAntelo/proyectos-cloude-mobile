package com.rutafiltro.maps

import com.rutafiltro.domain.GeoPoint
import org.junit.Assert.assertTrue
import org.junit.Test

class PolygonValidatorTest {
    private val c = SantaCruz.CENTER
    private fun p(dl: Double, dg: Double) = GeoPoint(c.lat + dl, c.lng + dg)

    @Test fun validSquare() = assertTrue(PolygonValidator.validate(listOf(p(0.0, 0.0), p(0.0, 0.01), p(0.01, 0.01), p(0.01, 0.0))).isEmpty())

    @Test fun tooFew() = assertTrue(PolygonIssue.TOO_FEW_VERTICES in PolygonValidator.validate(listOf(p(0.0, 0.0), p(0.0, 0.01))))

    @Test fun collinear() = assertTrue(PolygonIssue.ZERO_AREA in PolygonValidator.validate(listOf(p(0.0, 0.0), p(0.0, 0.01), p(0.0, 0.02))))

    @Test fun duplicate() = assertTrue(PolygonIssue.DUPLICATE_VERTEX in PolygonValidator.validate(listOf(p(0.0, 0.0), p(0.0, 0.01), p(0.01, 0.01), p(0.0, 0.0))))

    @Test fun bowtie() = assertTrue(PolygonIssue.SELF_INTERSECTING in PolygonValidator.validate(listOf(p(0.0, 0.0), p(0.01, 0.01), p(0.0, 0.01), p(0.01, 0.0))))

    @Test fun invalidCoordinate() = assertTrue(PolygonIssue.INVALID_COORDINATE in PolygonValidator.validate(listOf(p(0.0, 0.0), GeoPoint(95.0, 0.0), p(0.01, 0.01))))

    @Test fun tooLarge() = assertTrue(PolygonIssue.TOO_LARGE in PolygonValidator.validate(listOf(p(0.0, 0.0), p(0.0, 1.0), p(1.0, 1.0))))
}
