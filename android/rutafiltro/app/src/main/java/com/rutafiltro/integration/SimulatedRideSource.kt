package com.rutafiltro.integration

import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.RideRequest
import com.rutafiltro.maps.Geometry
import com.rutafiltro.maps.SantaCruz
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlin.math.roundToInt
import kotlin.random.Random

/**
 * Simulador de solicitudes en Santa Cruz de la Sierra. TODO lo que produce lleva
 * simulated = true y sourceId = "simulador"; nunca se presenta como dato real.
 *
 * Genera una mezcla realista de casos: buenos, baratos, lejanos, con paradas,
 * con descripción, con datos faltantes (para probar la política de datos ambiguos).
 */
class SimulatedRideSource(
    seed: Long = System.currentTimeMillis(),
    private val clock: () -> Long = System::currentTimeMillis,
    private val maxPerRefresh: Int = 2,
) : RideSource {
    override val id = ID
    override val displayName = "Simulador (datos sintéticos)"
    override val capabilities = SourceCapabilities(isReal = false, supportsDismiss = true, supportsRefresh = true, minRefreshSeconds = 2)

    private val random = Random(seed)
    private var counter = 0
    private val _events = MutableSharedFlow<SourceEvent>(extraBufferCapacity = 256, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    override val events: SharedFlow<SourceEvent> = _events
    val dismissed = mutableSetOf<String>()

    override suspend fun refresh() {
        repeat(random.nextInt(0, maxPerRefresh + 1)) { _events.emit(SourceEvent.Request(next())) }
    }

    override suspend fun dismiss(requestId: String): Boolean { dismissed += requestId; return true }

    suspend fun emit(request: RideRequest) = _events.emit(SourceEvent.Request(request))
    /** Ráfaga de n solicitudes "simultáneas"; cede el hilo entre emisiones para no desbordar el buffer. */
    suspend fun burst(n: Int) = repeat(n) { _events.emit(SourceEvent.Request(next())); kotlinx.coroutines.yield() }
    suspend fun setTripActive(active: Boolean) = _events.emit(SourceEvent.TripActive(active))
    suspend fun raiseError(message: String, critical: Boolean) = _events.emit(SourceEvent.Error(message, critical))

    fun next(): RideRequest {
        counter++
        val pickup = randomPoint()
        val dropoff = randomPoint()
        val pickupKm = (random.nextDouble(0.2, 4.5) * 10).roundToInt() / 10.0
        val tripKm = ((Geometry.haversineKm(pickup, dropoff) * 1.3).coerceAtLeast(0.8) * 10).roundToInt() / 10.0
        val speedKmh = random.nextDouble(18.0, 32.0)
        // Precio del pasajero: entre 2,2 y 4,8 Bs/km del trayecto, mínimo 8 Bs.
        val price = (tripKm * random.nextDouble(2.2, 4.8)).coerceAtLeast(8.0).roundToInt().toDouble()
        val incomplete = random.nextInt(100) < 8
        return RideRequest(
            id = "sim-${clock()}-$counter",
            sourceId = ID,
            simulated = true,
            receivedAtMillis = clock(),
            passengerPriceBs = if (incomplete && random.nextBoolean()) null else price,
            pickupDistanceKm = pickupKm,
            pickupEtaMin = (pickupKm / speedKmh * 60).roundToInt().toDouble().coerceAtLeast(1.0),
            tripDistanceKm = if (incomplete) null else tripKm,
            tripDurationMin = (tripKm / speedKmh * 60).roundToInt().toDouble().coerceAtLeast(2.0),
            passengerRating = if (random.nextInt(100) < 10) null else ((random.nextDouble(3.8, 5.0) * 100).roundToInt() / 100.0),
            extraStops = listOf(0, 0, 0, 0, 0, 0, 1, 1, 2, 3).random(random),
            description = if (random.nextInt(100) < 15) listOf("Llevo maleta", "Con mascota", "Esperar 5 min", "Somos 4").random(random) else "",
            pickup = pickup,
            dropoff = dropoff,
        )
    }

    private fun randomPoint() = GeoPoint(
        random.nextDouble(SantaCruz.MIN_LAT, SantaCruz.MAX_LAT),
        random.nextDouble(SantaCruz.MIN_LNG, SantaCruz.MAX_LNG),
    )

    companion object { const val ID = "simulador" }
}

/** Destino simulado: registra la oferta como SIMULADA. Nada sale del teléfono. */
class SimulatedOfferSink(private val failEvery: Int = 0) : OfferSink {
    override val id = "simulador"
    override val capabilities = SinkCapabilities(isReal = false, canSendAutomatically = true)
    val sent = mutableListOf<OutgoingOffer>()
    private var n = 0
    override suspend fun send(offer: OutgoingOffer): SendResult {
        n++
        if (failEvery > 0 && n % failEvery == 0) return SendResult.Failed("Fallo simulado")
        synchronized(sent) { sent += offer }
        return SendResult.Sent(simulated = true)
    }
}
