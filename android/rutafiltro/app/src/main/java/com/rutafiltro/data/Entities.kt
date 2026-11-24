package com.rutafiltro.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "profiles")
data class ProfileEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val kind: String,
    /** ProfileSettings serializado en JSON (tarifas, tramos, filtros, zonas-config, automatización). */
    val settingsJson: String,
    val position: Int = 0,
)

@Entity(tableName = "zones", indices = [Index("profileId")])
data class ZoneEntity(
    @PrimaryKey val id: String,
    val profileId: Long,
    val name: String,
    val type: String,
    val verticesJson: String,
    val enabled: Boolean,
    val priority: Int,
    val redTarget: String,
)

@Entity(tableName = "history", indices = [Index("atMillis"), Index("requestId")])
data class HistoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val requestId: String,
    val atMillis: Long,
    val sourceId: String,
    val simulated: Boolean,
    val profileName: String,
    val decision: String,
    val rule: String,
    val reason: String,
    val outcome: String,
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
    val dismissed: Boolean,
)
