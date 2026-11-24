package com.rutafiltro.domain

import kotlinx.serialization.Serializable

@Serializable
enum class ZoneType { RED, GREEN, GOLD }

/** Qué extremo del viaje bloquea una zona roja. */
@Serializable
enum class RedZoneTarget { PICKUP, DROPOFF, BOTH }

@Serializable
data class Zone(
    val id: String,
    val name: String,
    val type: ZoneType,
    val vertices: List<GeoPoint>,
    val enabled: Boolean = true,
    /** Solo zonas verdes/doradas: 1 (baja) … 5 (alta). */
    val priority: Int = 3,
    /** Solo zonas rojas. */
    val redTarget: RedZoneTarget = RedZoneTarget.BOTH,
)

/**
 * - [OFF]: las zonas doradas no se usan.
 * - [PREFERRED]: suman prioridad, no excluyen.
 * - [EXCLUSIVE]: la recogida DEBE estar dentro de alguna zona dorada.
 */
@Serializable
enum class GoldMode { OFF, PREFERRED, EXCLUSIVE }

@Serializable
data class ZoneConfig(
    val goldMode: GoldMode = GoldMode.OFF,
    /** En modo exclusivo: ¿el destino puede quedar fuera de las zonas doradas? */
    val goldAllowDropoffOutside: Boolean = true,
    /**
     * Si una zona activa necesita una coordenada que la solicitud no trae:
     * REJECT => se rechaza; IGNORE => esa regla de zona no se aplica.
     */
    val unknownCoordinates: UnknownPolicy = UnknownPolicy.REJECT,
)
