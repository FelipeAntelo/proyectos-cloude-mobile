package com.rutafiltro.data

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rutafiltro.TestData
import com.rutafiltro.automation.Outcome
import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.domain.Decision
import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.ProfileKind
import com.rutafiltro.domain.RuleId
import com.rutafiltro.domain.TierMode
import com.rutafiltro.domain.ZoneType
import com.rutafiltro.maps.PolygonIssue
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PersistenceTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var db: AppDatabase

    @Before fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), AppDatabase::class.java).allowMainThreadQueries().build()
    }
    @After fun tearDown() = db.close()

    @Test fun defaultProfilesSeededOnce() = runBlocking {
        val repo = ProfileRepository(db)
        repo.ensureDefaults(); repo.ensureDefaults()
        val list = repo.profiles.first()
        assertEquals(5, list.size)
        assertEquals(listOf(ProfileKind.CITY, ProfileKind.NIGHT, ProfileKind.SHORT, ProfileKind.LONG, ProfileKind.CUSTOM), list.map { it.kind })
    }

    @Test fun settingsRoundTrip() = runBlocking {
        val repo = ProfileRepository(db)
        val id = repo.ensureDefaults()
        val p = repo.get(id)!!
        val changed = p.settings.copy(fare = p.settings.fare.copy(minFareBs = 13.5), tiers = p.settings.tiers.copy(mode = TierMode.PROGRESSIVE))
        repo.updateSettings(id, changed)
        assertEquals(changed, repo.get(id)!!.settings)
    }

    @Test fun zonesPerProfileAndDuplicate() = runBlocking {
        val profiles = ProfileRepository(db); val zones = ZoneRepository(db)
        val id = profiles.ensureDefaults()
        val z = TestData.square("Centro", ZoneType.GOLD, -17.78, -63.18)
        assertTrue(zones.save(id, z).isEmpty())
        assertEquals(listOf(z), zones.zones(id).first())
        val copy = profiles.duplicate(id)!!
        val copied = zones.zones(copy).first()
        assertEquals(1, copied.size)
        assertEquals(z.vertices, copied.first().vertices)
        assertFalse(copied.first().id == z.id)
        // Borrar el perfil copia sus zonas
        assertTrue(profiles.delete(copy))
        assertTrue(zones.zones(copy).first().isEmpty())
        assertEquals(1, zones.zones(id).first().size)
    }

    @Test fun invalidZoneIsNotSaved() = runBlocking {
        val id = ProfileRepository(db).ensureDefaults()
        val zones = ZoneRepository(db)
        val bad = TestData.square("x", ZoneType.RED, -17.78, -63.18).copy(vertices = listOf(GeoPoint(-17.78, -63.18), GeoPoint(-17.77, -63.18)))
        assertTrue(PolygonIssue.TOO_FEW_VERTICES in zones.save(id, bad))
        assertTrue(zones.zones(id).first().isEmpty())
    }

    @Test fun cannotDeleteLastProfile() = runBlocking {
        val repo = ProfileRepository(db)
        repo.ensureDefaults()
        val all = repo.profiles.first()
        all.dropLast(1).forEach { assertTrue(repo.delete(it.id)) }
        assertFalse(repo.delete(all.last().id))
    }

    @Test fun historyCapAndOrder() = runBlocking {
        val h = HistoryRepository(db, cap = 10)
        for (i in 1..25) h.add(rec("r$i", i.toLong(), simulated = i % 2 == 0))
        val recent = h.recent(100).first()
        assertEquals(10, recent.size)
        assertEquals("r25", recent.first().requestId)
        assertEquals(Outcome.PREPARED, recent.first().outcome) // r25 es impar => real => preparada
        assertEquals(Outcome.SENT_SIMULATED, recent[1].outcome)
        assertEquals(5, h.pickups(includeSimulated = false, since = 0).first().size)
        h.clear(); assertEquals(0, h.count())
    }

    @Test fun corruptSettingsJsonFallsBackToDefaults() = runBlocking {
        val id = db.profiles().insert(ProfileEntity(name = "X", kind = "NOPE", settingsJson = "{not json"))
        val p = ProfileRepository(db).get(id)!!
        assertEquals(ProfileKind.CUSTOM, p.kind)
        assertEquals(com.rutafiltro.domain.ProfileSettings(), p.settings)
    }

    @Test fun dataStoreSettingsPersist() = runBlocking {
        val file = tmp.newFile("s.preferences_pb").also { it.delete() }
        val store = PreferenceDataStoreFactory.create { file }
        val repo = SettingsRepository(store)
        assertEquals(AppSettings(), repo.settings.first())
        repo.setActiveProfile(7); repo.setSourceMode(SourceMode.MANUAL); repo.setOverlayPosition(10, 20); repo.setLastEngineState("PAUSED")
        val s = repo.settings.first()
        assertEquals(7L, s.activeProfileId); assertEquals(SourceMode.MANUAL, s.sourceMode)
        assertEquals(10, s.overlayX); assertEquals("PAUSED", s.lastEngineState)
    }

    private fun rec(id: String, t: Long, simulated: Boolean) = ProcessedRecord(
        id, t, "test", simulated, "P", Decision.ACCEPT, RuleId.OK, "ok", if (simulated) Outcome.SENT_SIMULATED else Outcome.PREPARED,
        20.0, 20.0, 18.0, 7.0, 6.0, 3.3, 2.8, -17.78, -63.18, -17.76, -63.16,
    )
}
