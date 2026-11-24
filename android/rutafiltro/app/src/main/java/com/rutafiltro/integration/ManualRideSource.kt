package com.rutafiltro.integration

import com.rutafiltro.domain.RideRequest
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

/**
 * Origen MANUAL: el conductor transcribe en el panel flotante los datos que ve en
 * inDrive (precio, km, recogida…). Son datos reales, pero RutaFiltro no puede enviar
 * nada: el resultado es una oferta PREPARADA que el conductor ingresa él mismo en inDrive.
 */
class ManualRideSource : RideSource {
    override val id = ID
    override val displayName = "Manual (datos ingresados por el conductor)"
    override val capabilities = SourceCapabilities(isReal = true, supportsDismiss = false, supportsRefresh = false, minRefreshSeconds = 0)
    private val _events = MutableSharedFlow<SourceEvent>(extraBufferCapacity = 16)
    override val events: SharedFlow<SourceEvent> = _events

    suspend fun submit(request: RideRequest) = _events.emit(SourceEvent.Request(request.copy(sourceId = ID, simulated = false)))
    suspend fun setTripActive(active: Boolean) = _events.emit(SourceEvent.TripActive(active))

    companion object { const val ID = "manual" }
}

/** Sin envío posible: el motor deja la oferta en estado PREPARADA. */
object ManualOfferSink : OfferSink {
    override val id = "manual"
    override val capabilities = SinkCapabilities(isReal = true, canSendAutomatically = false)
    override suspend fun send(offer: OutgoingOffer): SendResult = SendResult.Failed("Este origen no permite enviar ofertas")
}
