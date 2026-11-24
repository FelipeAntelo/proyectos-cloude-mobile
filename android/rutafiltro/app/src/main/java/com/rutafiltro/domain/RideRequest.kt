package com.rutafiltro.domain

/**
 * Solicitud de viaje normalizada, independiente del origen de datos.
 *
 * Todos los campos que un origen real podría no entregar son anulables: el motor
 * NUNCA rellena valores faltantes con supuestos. Un campo nulo significa "desconocido".
 */
data class RideRequest(
    /** Identificador estable dentro del origen (se usa para deduplicar). */
    val id: String,
    /** Origen de datos que produjo la solicitud (p.ej. "simulador", "manual"). */
    val sourceId: String,
    /** true si la solicitud es sintética (simulador). Se arrastra hasta el historial. */
    val simulated: Boolean,
    val receivedAtMillis: Long,
    /** Precio propuesto por el pasajero, en Bs. */
    val passengerPriceBs: Double? = null,
    /** Distancia conductor → punto de recogida, km. */
    val pickupDistanceKm: Double? = null,
    /** Tiempo estimado hasta el pasajero, minutos. */
    val pickupEtaMin: Double? = null,
    /** Distancia del trayecto con pasajero, km. */
    val tripDistanceKm: Double? = null,
    /** Duración estimada del trayecto con pasajero, minutos. */
    val tripDurationMin: Double? = null,
    /** Calificación del pasajero (0–5). */
    val passengerRating: Double? = null,
    /** Paradas adicionales (sin contar origen ni destino). */
    val extraStops: Int? = null,
    /** Texto/comentario del pasajero; null = desconocido, "" = sin descripción. */
    val description: String? = null,
    val pickup: GeoPoint? = null,
    val dropoff: GeoPoint? = null,
)
