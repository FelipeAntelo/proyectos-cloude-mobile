package com.rutafiltro.data

import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.domain.DefaultProfiles
import com.rutafiltro.domain.Profile
import com.rutafiltro.domain.ProfileKind
import com.rutafiltro.domain.ProfileSettings
import com.rutafiltro.domain.Zone
import com.rutafiltro.maps.PolygonIssue
import com.rutafiltro.maps.PolygonValidator
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

class ProfileRepository(private val db: AppDatabase) {
    private val dao = db.profiles()

    val profiles: Flow<List<Profile>> = dao.observeAll().map { l -> l.map { it.toDomain() } }

    /** Crea los 5 perfiles base si la tabla está vacía. Devuelve el id del primero. */
    suspend fun ensureDefaults(): Long {
        if (dao.count() == 0) {
            DefaultProfiles.all().forEachIndexed { i, (name, pair) ->
                dao.insert(ProfileEntity(name = name, kind = pair.first.name, settingsJson = JsonCodec.encodeSettings(pair.second), position = i))
            }
        }
        return dao.all().first().id
    }

    suspend fun get(id: Long): Profile? = dao.byId(id)?.toDomain()

    suspend fun updateSettings(id: Long, settings: ProfileSettings) {
        val e = dao.byId(id) ?: return
        dao.update(e.copy(settingsJson = JsonCodec.encodeSettings(settings)))
    }

    suspend fun rename(id: Long, name: String) {
        val clean = name.trim().take(40)
        if (clean.isEmpty()) return
        val e = dao.byId(id) ?: return
        dao.update(e.copy(name = clean))
    }

    /** Duplica un perfil con sus zonas. */
    suspend fun duplicate(id: Long): Long? {
        val e = dao.byId(id) ?: return null
        val newId = dao.insert(e.copy(id = 0, name = (e.name + " (copia)").take(40), kind = ProfileKind.CUSTOM.name, position = dao.count()))
        val zones = db.zones().forProfile(id).map { it.copy(id = UUID.randomUUID().toString(), profileId = newId) }
        db.zones().insertAll(zones)
        return newId
    }

    /** No se permite borrar el último perfil. */
    suspend fun delete(id: Long): Boolean {
        if (dao.count() <= 1) return false
        db.zones().deleteForProfile(id)
        dao.delete(id)
        return true
    }
}

class ZoneRepository(db: AppDatabase) {
    private val dao = db.zones()

    fun zones(profileId: Long): Flow<List<Zone>> = dao.observe(profileId).map { l -> l.map { it.toDomain() } }

    /** Guarda solo polígonos válidos; si no, devuelve los problemas y no guarda nada. */
    suspend fun save(profileId: Long, zone: Zone): List<PolygonIssue> {
        val issues = PolygonValidator.validate(zone.vertices)
        if (issues.isNotEmpty()) return issues
        val name = zone.name.trim().ifEmpty { "Zona" }.take(40)
        dao.upsert(zone.copy(name = name).toEntity(profileId))
        return emptyList()
    }

    suspend fun setEnabled(profileId: Long, zone: Zone, enabled: Boolean) = dao.upsert(zone.copy(enabled = enabled).toEntity(profileId))

    suspend fun delete(id: String) = dao.delete(id)
}

class HistoryRepository(db: AppDatabase, private val cap: Int = 5_000) {
    private val dao = db.history()

    fun recent(limit: Int = 200): Flow<List<ProcessedRecord>> = dao.observeRecent(limit).map { l -> l.map { it.toDomain() } }

    fun pickups(includeSimulated: Boolean, since: Long): Flow<List<ProcessedRecord>> =
        dao.observePickups(includeSimulated, since).map { l -> l.map { it.toDomain() } }

    suspend fun add(r: ProcessedRecord) = dao.insertAndCap(r.toEntity(), cap)
    suspend fun clear() = dao.clear()
    suspend fun count() = dao.count()
}
