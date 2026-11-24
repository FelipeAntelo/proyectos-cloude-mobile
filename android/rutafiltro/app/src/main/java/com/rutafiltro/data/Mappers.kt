package com.rutafiltro.data

import com.rutafiltro.automation.Outcome
import com.rutafiltro.automation.ProcessedRecord
import com.rutafiltro.domain.Decision
import com.rutafiltro.domain.Profile
import com.rutafiltro.domain.ProfileKind
import com.rutafiltro.domain.RedZoneTarget
import com.rutafiltro.domain.RuleId
import com.rutafiltro.domain.Zone
import com.rutafiltro.domain.ZoneType

private inline fun <reified E : Enum<E>> enumOr(name: String, default: E): E =
    runCatching { enumValueOf<E>(name) }.getOrDefault(default)

fun ProfileEntity.toDomain() = Profile(id, name, enumOr(kind, ProfileKind.CUSTOM), JsonCodec.decodeSettings(settingsJson))

fun ZoneEntity.toDomain() = Zone(id, name, enumOr(type, ZoneType.RED), JsonCodec.decodePoints(verticesJson), enabled, priority, enumOr(redTarget, RedZoneTarget.BOTH))

fun Zone.toEntity(profileId: Long) = ZoneEntity(id, profileId, name, type.name, JsonCodec.encodePoints(vertices), enabled, priority.coerceIn(1, 5), redTarget.name)

fun ProcessedRecord.toEntity() = HistoryEntity(
    requestId = requestId, atMillis = atMillis, sourceId = sourceId, simulated = simulated, profileName = profileName,
    decision = decision.name, rule = rule.name, reason = reason, outcome = outcome.name, offerBs = offerBs,
    passengerBs = passengerBs, requiredBs = requiredBs, totalKm = totalKm, tripKm = tripKm, bsPerKmTrip = bsPerKmTrip,
    bsPerKmTotal = bsPerKmTotal, pickupLat = pickupLat, pickupLng = pickupLng, dropoffLat = dropoffLat,
    dropoffLng = dropoffLng, dismissed = dismissed,
)

fun HistoryEntity.toDomain() = ProcessedRecord(
    requestId, atMillis, sourceId, simulated, profileName, enumOr(decision, Decision.INSUFFICIENT_DATA),
    enumOr(rule, RuleId.DATA_INVALID), reason, enumOr(outcome, Outcome.NEEDS_REVIEW), offerBs, passengerBs, requiredBs,
    totalKm, tripKm, bsPerKmTrip, bsPerKmTotal, pickupLat, pickupLng, dropoffLat, dropoffLng, dismissed,
)
