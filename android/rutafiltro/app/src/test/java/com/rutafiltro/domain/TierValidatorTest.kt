package com.rutafiltro.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TierValidatorTest {
    private fun codes(vararg t: Tier, infinite: Boolean = true) =
        TierValidator.validate(TierConfig(infiniteLastTier = infinite, tiers = t.toList())).map { it.code }

    @Test fun defaultsAreValid() = assertTrue(TierValidator.validate(TierConfig()).isEmpty())

    @Test fun unorderedInputIsAccepted() =
        assertTrue(codes(Tier(3.0, null, 3.0), Tier(0.0, 3.0, 4.0)).isEmpty())

    @Test fun gap() = assertEquals(listOf(TierIssueCode.GAP), codes(Tier(0.0, 3.0, 4.0), Tier(4.0, null, 3.0)))

    @Test fun overlap() = assertEquals(listOf(TierIssueCode.OVERLAP), codes(Tier(0.0, 5.0, 4.0), Tier(4.0, null, 3.0)))

    @Test fun firstNotZero() = assertTrue(TierIssueCode.FIRST_NOT_ZERO in codes(Tier(1.0, null, 3.0)))

    @Test fun invalidPriceAndRange() {
        val c = codes(Tier(0.0, 3.0, 0.0), Tier(3.0, 2.0, 3.0), Tier(2.0, null, 1.0))
        assertTrue(TierIssueCode.INVALID_PRICE in c)
        assertTrue(TierIssueCode.INVALID_RANGE in c)
    }

    @Test fun openTierInMiddle() = assertTrue(TierIssueCode.OPEN_NOT_LAST in codes(Tier(0.0, null, 4.0), Tier(3.0, null, 3.0)))

    @Test fun infiniteFlagConsistency() {
        assertEquals(listOf(TierIssueCode.LAST_MUST_BE_OPEN), codes(Tier(0.0, 3.0, 4.0), infinite = true))
        assertEquals(listOf(TierIssueCode.LAST_MUST_BE_CLOSED), codes(Tier(0.0, null, 4.0), infinite = false))
        assertTrue(codes(Tier(0.0, 3.0, 4.0), infinite = false).isEmpty())
    }

    @Test fun empty() = assertEquals(listOf(TierIssueCode.EMPTY), codes())

    @Test fun disabledSkipsValidation() =
        assertTrue(TierValidator.validate(TierConfig(enabled = false, tiers = emptyList())).isEmpty())
}
