package com.rutafiltro.automation

import com.rutafiltro.TestData.req
import com.rutafiltro.TestData.square
import com.rutafiltro.domain.AutoMode
import com.rutafiltro.domain.AutomationConfig
import com.rutafiltro.domain.FareConfig
import com.rutafiltro.domain.FilterConfig
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.domain.TierConfig
import com.rutafiltro.domain.ZoneType
import com.rutafiltro.integration.ManualOfferSink
import com.rutafiltro.integration.ManualRideSource
import com.rutafiltro.integration.OfferSink
import com.rutafiltro.integration.OutgoingOffer
import com.rutafiltro.integration.RideSource
import com.rutafiltro.integration.SendResult
import com.rutafiltro.integration.SimulatedOfferSink
import com.rutafiltro.integration.SimulatedRideSource
import com.rutafiltro.integration.SinkCapabilities
import com.rutafiltro.integration.SourceCapabilities
import com.rutafiltro.integration.SourceEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AutomationEngineTest {

    private fun settings(mode: AutoMode = AutoMode.AUTOMATIC, maxOffers: Int = 20, aggressive: Boolean = false, refresh: Boolean = false) = ProfileSettings(
        fare = FareConfig(minFareBs = 10.0, minPricePerKm = 3.0, maxAutoOfferBs = 60.0, maxOffersPerSession = maxOffers),
        tiers = TierConfig(enabled = false),
        filters = FilterConfig(),
        automation = AutomationConfig(mode = mode, aggressiveReject = aggressive, autoRefreshEnabled = refresh, autoRefreshSeconds = 5),
    )

    private class Harness(
        val scope: TestScope,
        s: ProfileSettings,
        val source: SimulatedRideSource = SimulatedRideSource(seed = 1, clock = { scope.testScheduler.currentTime }),
        val sink: OfferSink = SimulatedOfferSink(),
        zones: List<com.rutafiltro.domain.Zone> = emptyList(),
    ) {
        val rules = MutableStateFlow(RulesSnapshot(1, "Test", s, zones))
        val saved = mutableListOf<ProcessedRecord>()
        val engine = AutomationEngine(scope.backgroundScope, rules, source, sink, recorder = { saved += it },
            clock = { scope.testScheduler.currentTime })
        fun start() { engine.activate(); scope.runCurrent() }
        suspend fun emit(r: com.rutafiltro.domain.RideRequest) { source.emit(r); scope.runCurrent() }
        val state get() = engine.status.value.state
    }

    @Test fun manualModePreparesNeverSends() = runTest {
        val h = Harness(this, settings(mode = AutoMode.MANUAL))
        h.start()
        assertEquals(EngineState.OBSERVING, h.state)
        h.emit(req("a", price = 30.0))
        assertEquals(EngineState.OFFER_PREPARED, h.state)
        assertEquals(Outcome.PREPARED, h.saved.single().outcome)
        assertEquals(0, (h.sink as SimulatedOfferSink).sent.size)
        assertEquals("a", h.engine.status.value.prepared!!.requestId)
        h.engine.clearPrepared()
        assertEquals(EngineState.OBSERVING, h.state)
        assertEquals(
            listOf(EngineState.DISABLED, EngineState.OBSERVING, EngineState.ANALYZING, EngineState.OFFER_PREPARED, EngineState.OBSERVING),
            h.engine.transitions.value,
        )
    }

    @Test fun automaticSimulatedSendIsLabelledSimulated() = runTest {
        val h = Harness(this, settings())
        h.start()
        h.emit(req("a", price = 30.0))
        assertEquals(EngineState.OFFER_SENT, h.state)
        assertEquals(Outcome.SENT_SIMULATED, h.saved.single().outcome)
        assertEquals(1, h.engine.status.value.sessionOfferAttempts)
        advanceTimeBy(5_000); runCurrent()
        assertEquals(EngineState.OBSERVING, h.state)
    }

    @Test fun duplicatesAreProcessedOnce() = runTest {
        val h = Harness(this, settings())
        h.start()
        repeat(3) { h.emit(req("same", price = 30.0)) }
        assertEquals(1, h.saved.size)
        assertEquals(2, h.engine.status.value.duplicatesIgnored)
        assertEquals(1, (h.sink as SimulatedOfferSink).sent.size)
    }

    @Test fun sessionLimitPausesAndBlocksResume() = runTest {
        val h = Harness(this, settings(maxOffers = 3))
        h.start()
        for (i in 1..10) h.emit(req("r$i", price = 30.0))
        assertEquals(3, (h.sink as SimulatedOfferSink).sent.size)
        assertEquals(EngineState.PAUSED, h.state)
        h.engine.resume()
        assertEquals(EngineState.PAUSED, h.state)
        assertTrue(h.engine.status.value.message.contains("Límite"))
        h.engine.deactivate(); h.start()
        assertEquals(0, h.engine.status.value.sessionOfferAttempts)
    }

    @Test fun limitInsideOneBatchMarksTheRest() = runTest {
        val h = Harness(this, settings(maxOffers = 2))
        h.start()
        for (i in 1..5) h.source.emit(req("b$i", price = 30.0))
        runCurrent()
        assertEquals(2, (h.sink as SimulatedOfferSink).sent.size)
        assertEquals(3, h.saved.count { it.outcome == Outcome.LIMIT_REACHED })
        assertEquals(EngineState.PAUSED, h.state)
    }

    @Test fun insufficientDataNeverSent() = runTest {
        val h = Harness(this, settings())
        h.start()
        h.emit(req("x", price = null))
        h.emit(req("y", tripKm = null))
        assertTrue(h.saved.all { it.outcome == Outcome.NEEDS_REVIEW })
        assertEquals(0, (h.sink as SimulatedOfferSink).sent.size)
        assertFalse(h.saved.any { it.dismissed })
    }

    @Test fun aggressiveRejectDismissesInsufficientWithLimit() = runTest {
        val s = settings(aggressive = true).let { it.copy(automation = it.automation.copy(aggressiveMaxDismissPerMinute = 2)) }
        val h = Harness(this, s)
        h.start()
        for (i in 1..4) h.emit(req("x$i", price = null))
        assertTrue(h.saved.all { it.outcome == Outcome.REJECTED })
        assertEquals(2, h.saved.count { it.dismissed })
        assertEquals(setOf("x1", "x2"), h.source.dismissed)
    }

    @Test fun rejectedAreClearedWhenSourceSupportsIt() = runTest {
        val h = Harness(this, settings())
        h.start()
        h.emit(req("far", pickupKm = 9.0))
        assertEquals(Outcome.REJECTED, h.saved.single().outcome)
        assertTrue(h.saved.single().dismissed)
    }

    @Test fun activeTripPausesAndResumes() = runTest {
        val h = Harness(this, settings())
        h.start()
        h.source.setTripActive(true); runCurrent()
        assertEquals(EngineState.PAUSED, h.state)
        h.emit(req("during", price = 30.0))
        assertTrue(h.saved.isEmpty())
        h.engine.resume()
        assertEquals(EngineState.PAUSED, h.state) // no reanuda con viaje activo
        h.source.setTripActive(false); runCurrent()
        assertEquals(EngineState.OBSERVING, h.state)
    }

    @Test fun userPauseNotResumedByTripEnd() = runTest {
        val h = Harness(this, settings())
        h.start()
        h.engine.pause()
        h.source.setTripActive(true); runCurrent()
        h.source.setTripActive(false); runCurrent()
        assertEquals(EngineState.PAUSED, h.state)
    }

    @Test fun criticalErrorStopsEngineAndCanRestart() = runTest {
        val h = Harness(this, settings())
        h.start()
        h.source.raiseError("se perdió la conexión", critical = true); runCurrent()
        assertEquals(EngineState.ERROR, h.state)
        h.emit(req("after", price = 30.0))
        assertTrue(h.saved.isEmpty())
        h.start()
        assertEquals(EngineState.OBSERVING, h.state)
        h.emit(req("after2", price = 30.0))
        assertEquals(1, h.saved.size)
    }

    @Test fun nonCriticalErrorKeepsRunning() = runTest {
        val h = Harness(this, settings())
        h.start()
        h.source.raiseError("lento", critical = false); runCurrent()
        assertEquals(EngineState.OBSERVING, h.state)
        assertEquals("lento", h.engine.status.value.lastError)
    }

    @Test fun threeFailuresGoToErrorWithoutRetries() = runTest {
        val failing = object : OfferSink {
            override val id = "f"
            override val capabilities = SinkCapabilities(isReal = false, canSendAutomatically = true)
            var calls = 0
            override suspend fun send(offer: OutgoingOffer): SendResult { calls++; return SendResult.Failed("x") }
        }
        val h = Harness(this, settings(), sink = failing)
        h.start()
        for (i in 1..5) h.emit(req("f$i", price = 30.0))
        assertEquals(EngineState.ERROR, h.state)
        assertEquals(3, failing.calls) // un intento por solicitud, se detiene al 3er fallo
    }

    @Test fun simulatedRequestNeverGoesToRealSink() = runTest {
        val real = object : OfferSink {
            override val id = "real"
            override val capabilities = SinkCapabilities(isReal = true, canSendAutomatically = true)
            var calls = 0
            override suspend fun send(offer: OutgoingOffer): SendResult { calls++; return SendResult.Sent(false) }
        }
        val h = Harness(this, settings(), sink = real)
        h.start()
        h.emit(req("s", price = 30.0, simulated = true))
        assertEquals(0, real.calls)
        assertEquals(Outcome.PREPARED, h.saved.single().outcome)
    }

    @Test fun overMaxAutoOfferIsOnlyPrepared() = runTest {
        val h = Harness(this, settings())
        h.start()
        h.emit(req("big", price = 90.0))
        assertEquals(Outcome.PREPARED, h.saved.single().outcome)
        assertTrue(h.saved.single().reason.contains("máximo"))
    }

    @Test fun manualSourceAutomaticModeOnlyPrepares() = runTest {
        val src = ManualRideSource()
        val rules = MutableStateFlow(RulesSnapshot(1, "T", settings(), emptyList()))
        val saved = mutableListOf<ProcessedRecord>()
        val e = AutomationEngine(backgroundScope, rules, src, ManualOfferSink, { saved += it }, { testScheduler.currentTime })
        e.activate(); runCurrent()
        src.submit(req("m", price = 30.0, simulated = true)); runCurrent()
        assertEquals(Outcome.PREPARED, saved.single().outcome)
        assertFalse(saved.single().simulated) // el origen manual marca datos reales
        assertEquals(EngineState.OFFER_PREPARED, e.status.value.state)
    }

    @Test fun simultaneousRequestsPrioritizeGreenZone() = runTest {
        val green = square("Favorita", ZoneType.GREEN, -17.70, -63.10, priority = 5)
        val h = Harness(this, settings(maxOffers = 1), zones = listOf(green))
        h.start()
        h.source.emit(req("normal", price = 40.0))
        h.source.emit(req("fav", price = 30.0, pickup = com.rutafiltro.domain.GeoPoint(-17.70, -63.10)))
        runCurrent()
        assertEquals("fav", (h.sink as SimulatedOfferSink).sent.single().requestId)
    }

    @Test fun overloadIsCountedNotHidden() = runTest {
        val h = Harness(this, settings().let { it.copy(fare = it.fare.copy(maxOffersPerSession = 0)) })
        h.start()
        // 300 eventos sin ceder el hilo: la cola (256) se desborda y se contabiliza.
        val events = (1..300).map { req("o$it", price = 30.0) }
        val flow = h.source
        for (r in events) flow.emit(r)
        runCurrent()
        val st = h.engine.status.value
        assertTrue(h.saved.size <= AutomationEngine.QUEUE_CAPACITY)
        assertTrue(st.processed + st.droppedOverload <= 300)
    }

    @Test fun deactivateIgnoresFurtherRequests() = runTest {
        val h = Harness(this, settings())
        h.start()
        h.engine.deactivate()
        assertEquals(EngineState.DISABLED, h.state)
        h.emit(req("z", price = 30.0))
        assertTrue(h.saved.isEmpty())
    }

    @Test fun autoRefreshRespectsIntervalAndInteractivity() = runTest {
        var refreshes = 0
        val src = object : RideSource {
            override val id = "fake"; override val displayName = "fake"
            override val capabilities = SourceCapabilities(false, false, true, 2)
            override val events = MutableSharedFlow<SourceEvent>()
            override suspend fun refresh() { refreshes++ }
        }
        val rules = MutableStateFlow(RulesSnapshot(1, "T", settings(refresh = true), emptyList()))
        val e = AutomationEngine(backgroundScope, rules, src, SimulatedOfferSink(), clock = { testScheduler.currentTime })
        e.activate(); runCurrent()
        advanceTimeBy(15_500); runCurrent()
        assertEquals(4, refreshes) // t=0,5,10,15
        e.setInteractive(false)
        advanceTimeBy(30_000); runCurrent()
        assertEquals(4, refreshes)
        e.setInteractive(true); runCurrent()
        assertEquals(5, refreshes)
        e.pause(); advanceTimeBy(30_000); runCurrent()
        assertEquals(5, refreshes)
    }

    @Test fun simulatorMixProducesAllOutcomesWithoutRealSends() = runTest {
        val s = settings().let { it.copy(fare = it.fare.copy(maxOffersPerSession = 0)) }
        val h = Harness(this, s)
        h.start()
        h.source.burst(300); runCurrent()
        assertEquals(300, h.saved.size + h.engine.status.value.droppedOverload)
        assertEquals(0, h.engine.status.value.droppedOverload)
        assertTrue(h.saved.all { it.simulated })
        assertTrue(h.saved.none { it.outcome == Outcome.SENT })
        val outcomes = h.saved.map { it.outcome }.toSet()
        assertTrue(Outcome.SENT_SIMULATED in outcomes)
        assertTrue(Outcome.REJECTED in outcomes)
        assertTrue(Outcome.NEEDS_REVIEW in outcomes)
        val sentIds = (h.sink as SimulatedOfferSink).sent.map { it.requestId }
        assertEquals(sentIds.size, sentIds.toSet().size)
    }

    /** Concurrencia real: 8 hilos emiten 400 eventos con duplicados a la vez. */
    @Test fun realThreadsConcurrencyNoDuplicateSendsAndLimitHolds() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val source = SimulatedRideSource(seed = 7)
        val sink = SimulatedOfferSink()
        val rules = MutableStateFlow(RulesSnapshot(1, "T", settings(maxOffers = 25), emptyList()))
        val saved = java.util.Collections.synchronizedList(mutableListOf<ProcessedRecord>())
        val engine = AutomationEngine(scope, rules, source, sink, { saved += it })
        engine.activate()
        delay(100)
        (0 until 8).map { t ->
            scope.launch { for (i in 0 until 50) source.emit(req("c${(t * 50 + i) % 120}", price = 30.0)) }
        }.joinAll()
        withTimeout(5_000) { while (engine.status.value.processed + engine.status.value.duplicatesIgnored < 400 &&
            engine.status.value.state != EngineState.PAUSED) delay(20) }
        delay(200)
        val ids = sink.sent.map { it.requestId }
        assertEquals(ids.size, ids.toSet().size)
        assertEquals(25, ids.size)
        assertEquals(EngineState.PAUSED, engine.status.value.state)
        val uniqueRecorded = saved.map { it.requestId }
        assertEquals(uniqueRecorded.size, uniqueRecorded.toSet().size)
        scope.cancel()
    }
}
