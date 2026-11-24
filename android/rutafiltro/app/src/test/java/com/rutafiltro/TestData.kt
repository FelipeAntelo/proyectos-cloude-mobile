package com.rutafiltro

import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.RideRequest
import com.rutafiltro.domain.Zone
import com.rutafiltro.domain.ZoneType

object TestData {
    fun req(
        id: String = "r1",
        price: Double? = 30.0,
        pickupKm: Double? = 1.0,
        etaMin: Double? = 3.0,
        tripKm: Double? = 6.0,
        tripMin: Double? = 15.0,
        rating: Double? = 4.9,
        stops: Int? = 0,
        description: String? = "",
        pickup: GeoPoint? = GeoPoint(-17.78, -63.18),
        dropoff: GeoPoint? = GeoPoint(-17.76, -63.16),
        simulated: Boolean = true,
    ) = RideRequest(id, "test", simulated, 0L, price, pickupKm, etaMin, tripKm, tripMin, rating, stops, description, pickup, dropoff)

    /** Cuadrado alrededor de (lat,lng) con medio lado d (grados). */
    fun square(id: String, type: ZoneType, lat: Double, lng: Double, d: Double = 0.01, priority: Int = 3,
               red: com.rutafiltro.domain.RedZoneTarget = com.rutafiltro.domain.RedZoneTarget.BOTH) =
        Zone(id, id, type, listOf(GeoPoint(lat - d, lng - d), GeoPoint(lat - d, lng + d), GeoPoint(lat + d, lng + d), GeoPoint(lat + d, lng - d)),
            priority = priority, redTarget = red)
}
