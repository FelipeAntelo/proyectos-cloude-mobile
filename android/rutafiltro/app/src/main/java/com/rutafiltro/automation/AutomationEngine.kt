package com.rutafiltro.automation

import com.rutafiltro.domain.AutoMode
import com.rutafiltro.domain.Decision
import com.rutafiltro.domain.Evaluation
import com.rutafiltro.domain.RuleEngine
import com.rutafiltro.integration.OfferSink
import com.rutafiltro.integration.OutgoingOffer
import com.rutafiltro.integration.RideSource
import com.rutafiltro.integration.SendResult
import com.rutafiltro.integration.SourceEvent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Orquestador: origen → reglas → oferta → registro.
 *
 * Garantías (cubiertas por pruebas):
 * - Cada solicitud se procesa UNA vez dentro de la ventana de deduplicación.
 * - Como máximo un intento de envío por solicitud (sin reintentos infinitos).
 * - Nunca más de `maxOffersPerSession` intentos por sesión; al alcanzarlo, PAUSADO.
 * - Nunca se envía con decisión INSUFFICIENT_DATA ni con precio ambiguo.
 * - Nunca se envía una solicitud simulada a un destino real ni viceversa.
 * - Viaje activo => PAUSADO; error crítico o 3 fallos seguidos => ERROR.
 * - Todo el procesamiento ocurre en un único worker: sin carreras en contadores.
 */
class AutomationEngine(
    private val scope: CoroutineScope,
    private val rules: StateFlow<RulesSnapshot>,
    source: RideSource,
    sink: OfferSink,
    private val recorder: suspend (ProcessedRecord) -> Unit = {},
    private val clock: () -> Long = System::currentTimeMillis,
    private val sentSettleMillis: Long = 4_000,
    private val preparedTtlMillis: Long = 45_000,
) {
    var source: RideSource = source
        private set
    var sink: OfferSink = sink
        private set

    private val _status = MutableStateFlow(EngineStatus())
    val status: StateFlow<EngineStatus> = _status.asStateFlow()
    private val _recent = MutableStateFlow<List<ProcessedRecord>>(emptyList())
    val recent: StateFlow<List<ProcessedRecord>> = _recent.asStateFlow()
    private val _transitions = MutableStateFlow<List<EngineState>>(listOf(EngineState.DISABLED))
    /** Historial de transiciones (para pruebas y diagnóstico). */
    val transitions: StateFlow<List<EngineState>> = _transitions.asStateFlow()

    /** false cuando la pantalla está apagada / la app inactiva: se suspende el autorefresco. */
    private val interactive = MutableStateFlow(true)

    private var jobs = mutableListOf<Job>()
    private var settleJob: Job? = null
    private var queue = Channel<com.rutafiltro.domain.RideRequest>(QUEUE_CAPACITY)
    private val seen = LinkedHashMap<String, Long>()
    private val sentIds = HashSet<String>()
    private val dismissTimes = ArrayDeque<Long>()
    private var consecutiveFailures = 0
    private var pausedByTrip = false

    val isInteractive: StateFlow<Boolean> get() = interactive.asStateFlow()
    fun setInteractive(value: Boolean) { interactive.value = value }

    /** Cambiar origen/destino solo con el motor desactivado. */
    fun configure(source: RideSource, sink: OfferSink): Boolean {
        if (_status.value.state != EngineState.DISABLED) return false
        this.source = source
        this.sink = sink
        return true
    }

    fun activate() {
        val st = _status.value.state
        if (st != EngineState.DISABLED && st != EngineState.ERROR) return
        stopJobs()
        queue = Channel(QUEUE_CAPACITY)
        seen.clear(); sentIds.clear(); dismissTimes.clear()
        consecutiveFailures = 0; pausedByTrip = false
        _status.value = EngineStatus(
            sourceName = source.displayName,
            sourceIsReal = source.capabilities.isReal,
            sinkCanSendAutomatically = sink.capabilities.canSendAutomatically,
            sinkIsReal = sink.capabilities.isReal,
            maxOffersPerSession = rules.value.settings.fare.maxOffersPerSession,
        )
        transition(EngineState.OBSERVING, "Observando solicitudes de ${source.displayName}")
        val src = source
        jobs += scope.launch { src.events.collect { onEvent(it) } }
        jobs += scope.launch { for (first in queue) processBatch(drain(first)) }
        jobs += scope.launch { refreshLoop(src) }
    }

    fun pause() {
        if (_status.value.state.isRunning) {
            pausedByTrip = false
            transition(EngineState.PAUSED, "Pausado por el conductor")
        }
    }

    fun resume() {
        val s = _status.value
        if (s.state != EngineState.PAUSED) return
        if (s.activeTrip) { _status.update { it.copy(message = "Viaje activo: se reanudará al terminar") }; return }
        if (s.maxOffersPerSession > 0 && s.sessionOfferAttempts >= s.maxOffersPerSession) {
            _status.update { it.copy(message = "Límite de ofertas de la sesión alcanzado. Desactive y active para una nueva sesión.") }
            return
        }
        pausedByTrip = false
        transition(EngineState.OBSERVING, "Observando solicitudes")
    }

    fun deactivate() {
        stopJobs()
        _status.update { it.copy(prepared = null) }
        transition(EngineState.DISABLED, "Motor desactivado")
    }

    /** El conductor ya usó (o descartó) la oferta preparada. */
    fun clearPrepared() {
        _status.update { it.copy(prepared = null) }
        if (_status.value.state == EngineState.OFFER_PREPARED) transition(EngineState.OBSERVING, "Observando solicitudes")
    }

    private fun stopJobs() {
        jobs.forEach { it.cancel() }; jobs.clear()
        settleJob?.cancel(); settleJob = null
        queue.close()
    }

    private fun transition(state: EngineState, message: String) {
        _status.update { it.copy(state = state, message = message) }
        _transitions.update { (it + state).takeLast(200) }
    }

    private suspend fun onEvent(e: SourceEvent) {
        when (e) {
            is SourceEvent.Request -> {
                if (!_status.value.state.isRunning) return
                if (queue.trySend(e.request).isFailure) {
                    _status.update { it.copy(droppedOverload = it.droppedOverload + 1, lastError = "Cola llena: solicitud ${e.request.id} no procesada") }
                }
            }
            is SourceEvent.TripActive -> {
                _status.update { it.copy(activeTrip = e.active) }
                if (e.active && _status.value.state.isRunning) {
                    pausedByTrip = true
                    transition(EngineState.PAUSED, "Viaje activo: motor detenido")
                } else if (!e.active && pausedByTrip && _status.value.state == EngineState.PAUSED) {
                    pausedByTrip = false
                    transition(EngineState.OBSERVING, "Viaje terminado: observando")
                }
            }
            is SourceEvent.Error -> {
                _status.update { it.copy(lastError = e.message) }
                if (e.critical) fail("Error crítico del origen: ${e.message}")
            }
        }
    }

    private fun fail(message: String) {
        jobs.forEach { it.cancel() }; jobs.clear()
        queue.close()
        _status.update { it.copy(lastError = message) }
        transition(EngineState.ERROR, message)
    }

    private fun drain(first: com.rutafiltro.domain.RideRequest): List<com.rutafiltro.domain.RideRequest> {
        val batch = mutableListOf(first)
        while (true) batch += queue.tryReceive().getOrNull() ?: break
        return batch
    }

    private suspend fun processBatch(batch: List<com.rutafiltro.domain.RideRequest>) {
        try {
            if (!_status.value.state.isRunning) return
            val snap = rules.value
            val now = clock()
            val windowMs = snap.settings.automation.dedupWindowSeconds * 1000L
            seen.entries.removeAll { now - it.value > windowMs }
            val fresh = batch.filter { r ->
                if (seen.containsKey(r.id)) { _status.update { it.copy(duplicatesIgnored = it.duplicatesIgnored + 1) }; false }
                else { seen[r.id] = now; true }
            }
            if (fresh.isEmpty()) return
            settleJob?.cancel()
            transition(EngineState.ANALYZING, "Analizando ${fresh.size} solicitud(es)")
            val evals = fresh.map { RuleEngine.evaluate(it, snap.settings, snap.zones) }
            // Simultáneas: primero las ofertables, por prioridad de zona y luego Bs/km total.
            val ordered = evals.sortedWith(
                compareByDescending<Evaluation> { it.offer != null }
                    .thenByDescending { it.zonePriority }
                    .thenByDescending { it.bsPerKmTotal ?: 0.0 }
            )
            var finalState = EngineState.OBSERVING
            var finalMsg = "Observando solicitudes"
            for (ev in ordered) {
                if (_status.value.state == EngineState.ERROR) return
                val r = handle(ev, snap)
                _status.update { it.copy(processed = it.processed + 1) }
                when (r.outcome) {
                    Outcome.SENT, Outcome.SENT_SIMULATED -> { finalState = EngineState.OFFER_SENT; finalMsg = r.outcome.label + " · Bs ${RuleEngine.bs(r.offerBs ?: 0.0)}" }
                    Outcome.PREPARED -> if (finalState != EngineState.OFFER_SENT) { finalState = EngineState.OFFER_PREPARED; finalMsg = "Oferta preparada · Bs ${RuleEngine.bs(r.offerBs ?: 0.0)}" }
                    else -> {}
                }
            }
            val st = _status.value
            when {
                st.state == EngineState.ERROR || st.state == EngineState.PAUSED || st.state == EngineState.DISABLED -> {}
                consecutiveFailures >= MAX_CONSECUTIVE_FAILURES -> fail("$MAX_CONSECUTIVE_FAILURES envíos fallidos seguidos")
                st.maxOffersPerSession > 0 && st.sessionOfferAttempts >= st.maxOffersPerSession ->
                    transition(EngineState.PAUSED, "Límite de ${st.maxOffersPerSession} ofertas por sesión alcanzado")
                else -> {
                    if (finalState == EngineState.OBSERVING && st.prepared != null) {
                        finalState = EngineState.OFFER_PREPARED; finalMsg = "Oferta preparada pendiente"
                    }
                    transition(finalState, finalMsg)
                    scheduleSettle(finalState)
                }
            }
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            fail("Error interno: ${t.message ?: t::class.simpleName}")
        }
    }

    private fun scheduleSettle(state: EngineState) {
        val wait = when (state) {
            EngineState.OFFER_SENT -> sentSettleMillis
            EngineState.OFFER_PREPARED -> preparedTtlMillis
            else -> return
        }
        settleJob = scope.launch {
            delay(wait)
            if (_status.value.state == state) {
                _status.update { it.copy(prepared = null) }
                transition(EngineState.OBSERVING, "Observando solicitudes")
            }
        }
    }

    private suspend fun handle(ev: Evaluation, snap: RulesSnapshot): ProcessedRecord {
        val auto = snap.settings.automation
        val req = ev.request
        fun record(outcome: Outcome, reason: String = ev.reason, dismissed: Boolean = false) = ProcessedRecord(
            requestId = req.id, atMillis = clock(), sourceId = req.sourceId, simulated = req.simulated,
            profileName = snap.profileName, decision = ev.decision, rule = ev.rule, reason = reason, outcome = outcome,
            offerBs = ev.offer?.priceBs, passengerBs = req.passengerPriceBs, requiredBs = ev.fare?.required,
            totalKm = ev.fare?.totalKm, tripKm = req.tripDistanceKm, bsPerKmTrip = ev.bsPerKmTrip, bsPerKmTotal = ev.bsPerKmTotal,
            pickupLat = req.pickup?.lat, pickupLng = req.pickup?.lng, dropoffLat = req.dropoff?.lat, dropoffLng = req.dropoff?.lng,
            dismissed = dismissed, zonePriority = ev.zonePriority,
        )
        val rec: ProcessedRecord = when (ev.decision) {
            Decision.REJECT -> record(Outcome.REJECTED, dismissed = maybeDismiss(req.id, auto.clearDiscarded, auto.aggressiveMaxDismissPerMinute))
            Decision.INSUFFICIENT_DATA ->
                if (auto.aggressiveReject) record(Outcome.REJECTED, "Rechazo agresivo: ${ev.reason}",
                    dismissed = maybeDismiss(req.id, true, auto.aggressiveMaxDismissPerMinute))
                else record(Outcome.NEEDS_REVIEW)
            Decision.ACCEPT, Decision.COUNTER_OFFER -> handleOffer(ev, snap, ::record)
        }
        emit(rec)
        return rec
    }

    private suspend fun handleOffer(
        ev: Evaluation, snap: RulesSnapshot,
        record: (Outcome, String, Boolean) -> ProcessedRecord,
    ): ProcessedRecord {
        val offer = ev.offer ?: return record(Outcome.NEEDS_REVIEW, "Sin plan de oferta", false)
        val st = _status.value
        if (st.maxOffersPerSession > 0 && st.sessionOfferAttempts >= st.maxOffersPerSession) {
            return record(Outcome.LIMIT_REACHED, "Límite de ${st.maxOffersPerSession} ofertas por sesión", false)
        }
        val caps = sink.capabilities
        val blockReason: String? = when {
            snap.settings.automation.mode == AutoMode.MANUAL -> "Modo manual: ingrese la oferta en inDrive"
            !caps.canSendAutomatically -> "Este origen no permite envío automático: ingrese la oferta en inDrive"
            ev.request.simulated == caps.isReal -> "Origen y destino incompatibles (simulado vs. real): no se envía"
            !offer.autoSendAllowed -> offer.autoBlockReason ?: "Envío automático no permitido"
            ev.request.id in sentIds -> "Ya se envió una oferta para esta solicitud"
            else -> null
        }
        if (blockReason != null) {
            val r = record(Outcome.PREPARED, "${ev.reason}. $blockReason", false)
            _status.update { it.copy(prepared = r) }
            return r
        }
        sentIds += ev.request.id
        _status.update { it.copy(sessionOfferAttempts = it.sessionOfferAttempts + 1) }
        return when (val res = sink.send(OutgoingOffer(ev.request.id, offer.priceBs, offer.isCounterOffer, ev.request.simulated))) {
            is SendResult.Sent -> {
                consecutiveFailures = 0
                record(if (res.simulated) Outcome.SENT_SIMULATED else Outcome.SENT, ev.reason, false)
            }
            is SendResult.Failed -> {
                consecutiveFailures++
                record(Outcome.SEND_FAILED, "Envío fallido: ${res.message}", false)
            }
        }
    }

    private suspend fun maybeDismiss(id: String, enabled: Boolean, maxPerMinute: Int): Boolean {
        if (!enabled || !source.capabilities.supportsDismiss) return false
        val now = clock()
        while (dismissTimes.isNotEmpty() && now - dismissTimes.first() > 60_000) dismissTimes.removeFirst()
        if (maxPerMinute > 0 && dismissTimes.size >= maxPerMinute) return false
        dismissTimes.addLast(now)
        return runCatching { source.dismiss(id) }.getOrDefault(false)
    }

    private suspend fun emit(r: ProcessedRecord) {
        _recent.update { (listOf(r) + it).take(RECENT_SIZE) }
        runCatching { recorder(r) }.onFailure { e -> _status.update { it.copy(lastError = "No se pudo guardar historial: ${e.message}") } }
    }

    private suspend fun refreshLoop(src: RideSource) {
        if (!src.capabilities.supportsRefresh) return
        while (true) {
            // Espera (sin sondeo) a que el motor esté en marcha y la pantalla activa.
            combine(_status, interactive) { s, i -> s.state.isRunning && i }.first { it }
            val a = rules.value.settings.automation
            if (a.autoRefreshEnabled) runCatching { src.refresh() }
            val secs = maxOf(a.autoRefreshSeconds, src.capabilities.minRefreshSeconds, MIN_REFRESH_SECONDS)
            delay(secs * 1000L)
        }
    }

    companion object {
        const val QUEUE_CAPACITY = 256
        const val RECENT_SIZE = 30
        const val MAX_CONSECUTIVE_FAILURES = 3
        const val MIN_REFRESH_SECONDS = 2
    }
}
