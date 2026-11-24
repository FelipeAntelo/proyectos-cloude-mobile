package com.rutafiltro.maps

import com.rutafiltro.domain.GeoPoint

/** Referencias de Santa Cruz de la Sierra, Bolivia. */
object SantaCruz {
    /** Plaza 24 de Septiembre. */
    val CENTER = GeoPoint(-17.78363, -63.18212)
    const val DEFAULT_ZOOM = 12.5

    /** Caja aproximada del área urbana (para el simulador). */
    const val MIN_LAT = -17.86
    const val MAX_LAT = -17.70
    const val MIN_LNG = -63.26
    const val MAX_LNG = -63.10
}
