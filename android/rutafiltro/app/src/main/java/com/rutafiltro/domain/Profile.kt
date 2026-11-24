package com.rutafiltro.domain

import kotlinx.serialization.Serializable

@Serializable
enum class ProfileKind { CITY, NIGHT, SHORT, LONG, CUSTOM }

/** Conjunto completo de reglas. Las zonas se guardan aparte (tabla propia) por perfil. */
@Serializable
data class ProfileSettings(
    val fare: FareConfig = FareConfig(),
    val tiers: TierConfig = TierConfig(),
    val filters: FilterConfig = FilterConfig(),
    val zones: ZoneConfig = ZoneConfig(),
    val automation: AutomationConfig = AutomationConfig(),
)

data class Profile(
    val id: Long,
    val name: String,
    val kind: ProfileKind,
    val settings: ProfileSettings,
)

object DefaultProfiles {
    fun all(): List<Pair<String, Pair<ProfileKind, ProfileSettings>>> = listOf(
        "Ciudad" to (ProfileKind.CITY to ProfileSettings()),
        "Horario nocturno" to (ProfileKind.NIGHT to ProfileSettings(
            fare = FareConfig(minFareBs = 15.0, minPricePerKm = 3.8, maxAutoOfferBs = 80.0),
            filters = FilterConfig(maxPickupKm = 2.5, minPassengerRating = 4.7, skipWithDescription = true),
        )),
        "Viajes cortos" to (ProfileKind.SHORT to ProfileSettings(
            fare = FareConfig(minFareBs = 10.0, minPricePerKm = 4.0, maxAutoOfferBs = 35.0),
            filters = FilterConfig(maxPickupKm = 2.0, maxTripKm = 6.0),
        )),
        "Viajes largos" to (ProfileKind.LONG to ProfileSettings(
            fare = FareConfig(minFareBs = 25.0, minPricePerKm = 2.8, maxAutoOfferBs = 150.0),
            filters = FilterConfig(maxPickupKm = 4.0, maxPickupMin = 12.0, maxTripKm = 60.0),
        )),
        "Personalizado" to (ProfileKind.CUSTOM to ProfileSettings()),
    )
}
