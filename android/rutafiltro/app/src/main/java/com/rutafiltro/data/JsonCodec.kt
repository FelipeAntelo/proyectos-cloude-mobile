package com.rutafiltro.data

import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.ProfileSettings
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

object JsonCodec {
    val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; allowSpecialFloatingPointValues = false }

    fun encodeSettings(s: ProfileSettings) = json.encodeToString(ProfileSettings.serializer(), s)

    /** Ante JSON corrupto o de una versión incompatible, se vuelve a valores por defecto seguros. */
    fun decodeSettings(raw: String): ProfileSettings =
        runCatching { json.decodeFromString(ProfileSettings.serializer(), raw) }.getOrElse { ProfileSettings() }

    private val pts = ListSerializer(GeoPoint.serializer())
    fun encodePoints(p: List<GeoPoint>) = json.encodeToString(pts, p)
    fun decodePoints(raw: String): List<GeoPoint> = runCatching { json.decodeFromString(pts, raw) }.getOrElse { emptyList() }
}
