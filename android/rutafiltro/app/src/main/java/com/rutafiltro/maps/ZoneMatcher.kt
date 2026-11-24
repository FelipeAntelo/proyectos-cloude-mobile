package com.rutafiltro.maps

import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.Zone
import com.rutafiltro.domain.ZoneType

/** Zonas activas y geométricamente válidas que contienen un punto. */
object ZoneMatcher {
    fun usable(zones: List<Zone>): List<Zone> =
        zones.filter { it.enabled && PolygonValidator.isValid(it.vertices) }

    fun containing(zones: List<Zone>, type: ZoneType, p: GeoPoint?): List<Zone> =
        if (p == null || !p.isValid) emptyList()
        else zones.filter { it.type == type && Geometry.contains(it.vertices, p) }
}
