package com.rutafiltro.automation

import com.rutafiltro.domain.Decision
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.domain.RuleId
import com.rutafiltro.domain.Zone

enum class EngineState(val label: String) {
    DISABLED("Desactivado"),
    OBSERVING("Observando"),
    ANALYZING("Analizando"),
    OFFER_PREPARED("Oferta preparada"),
    OFFER_SENT("Oferta enviada"),
    PAUSED("Pausado"),
    ERROR("Error");

    val isRunning get() = this == OBSERVING || this == ANALYZING || this == OFFER_PREPARED || this == OFFER_SENT
}

/** Resultado final de procesar una solicitud. */
enum class Outcome(val label: String) {
    REJECTED("Descartada"),
    NEEDS_REVIEW("Datos insuficientes"),
    PREPARED("Oferta preparada"),
    SENT("Oferta enviada"),
    /** La oferta solo se registró en el simulador: nunca llegó a un pasajero. */
    SENT_SIMULATED("Oferta SIMULADA"),
    SEND_FAILED("Envío fallido"),
    LIMIT_REACHED("Límite de ofertas alcanzado"),
}

/** Reglas vigentes: perfil activo + sus zonas. */
data class RulesSnapshot(
    val profileId: Long,
    val profileName: String,
    val settings: ProfileSettings,
    val zones: List<Zone>,
)

data class ProcessedRecord(
    val requestId: String,
    val atMillis: Long,
    val sourceId: String,
    val simulated: Boolean,
    val profileName: String,
    val decision: Decision,
    val rule: RuleId,
    val reason: String,
    val outcome: Outcome,
    val offerBs: Double?,
    val passengerBs: Double?,
    val requiredBs: Double?,
    val totalKm: Double?,
    val tripKm: Double?,
    val bsPerKmTrip: Double?,
    val bsPerKmTotal: Double?,
    val pickupLat: Double?,
    val pickupLng: Double?,
    val dropoffLat: Double?,
    val dropoffLng: Double?,
    val dismissed: Boolean = false,
    val zonePriority: Int = 0,
)

data class EngineStatus(
    val state: EngineState = EngineState.DISABLED,
    val message: String = "Motor desactivado",
    val sourceName: String = "",
    val sourceIsReal: Boolean = false,
    val sinkCanSendAutomatically: Boolean = false,
    val sinkIsReal: Boolean = false,
    val sessionOfferAttempts: Int = 0,
    val maxOffersPerSession: Int = 0,
    val processed: Int = 0,
    val duplicatesIgnored: Int = 0,
    /** Solicitudes perdidas por cola llena (sobrecarga). Nunca se ocultan. */
    val droppedOverload: Int = 0,
    val activeTrip: Boolean = false,
    val prepared: ProcessedRecord? = null,
    val lastError: String? = null,
)
