package com.rutafiltro.integration

data class SinkCapabilities(
    /** true solo si una oferta enviada llega a un pasajero real. */
    val isReal: Boolean,
    /** true si puede enviar sin intervención humana mediante un mecanismo autorizado. */
    val canSendAutomatically: Boolean,
)

data class OutgoingOffer(val requestId: String, val priceBs: Double, val isCounterOffer: Boolean, val simulatedRequest: Boolean)

sealed interface SendResult {
    /** [simulated] = true: la oferta NO salió del teléfono; solo se registró. */
    data class Sent(val simulated: Boolean) : SendResult
    data class Failed(val message: String) : SendResult
}

/** Destino de ofertas. */
interface OfferSink {
    val id: String
    val capabilities: SinkCapabilities
    suspend fun send(offer: OutgoingOffer): SendResult
}
