package com.rutafiltro.domain

enum class TierIssueCode { EMPTY, FIRST_NOT_ZERO, INVALID_PRICE, INVALID_RANGE, GAP, OVERLAP, OPEN_NOT_LAST, LAST_MUST_BE_OPEN, LAST_MUST_BE_CLOSED }

data class TierIssue(val index: Int, val code: TierIssueCode, val message: String)

/**
 * Valida que los tramos formen una partición continua de [0, ∞) (o de [0, último toKm]
 * si "tramos infinitos" está desactivado): sin huecos, sin solapes, precios positivos.
 * Los tramos se evalúan ORDENADOS por fromKm; el índice reportado es el del orden original.
 */
object TierValidator {
    private const val EPS = 1e-6

    fun validate(config: TierConfig): List<TierIssue> {
        if (!config.enabled) return emptyList()
        val tiers = config.tiers
        if (tiers.isEmpty()) return listOf(TierIssue(-1, TierIssueCode.EMPTY, "Agregue al menos un tramo"))
        val issues = mutableListOf<TierIssue>()
        tiers.forEachIndexed { i, t ->
            if (!(t.pricePerKm > 0) || t.pricePerKm.isInfinite()) {
                issues += TierIssue(i, TierIssueCode.INVALID_PRICE, "Tramo ${i + 1}: el precio por km debe ser mayor que 0")
            }
            if (t.fromKm.isNaN() || t.fromKm < 0 || (t.toKm != null && (t.toKm.isNaN() || t.toKm <= t.fromKm + EPS))) {
                issues += TierIssue(i, TierIssueCode.INVALID_RANGE, "Tramo ${i + 1}: el límite superior debe ser mayor que el inferior")
            }
        }
        val order = tiers.indices.sortedBy { tiers[it].fromKm }
        val first = tiers[order.first()]
        if (kotlin.math.abs(first.fromKm) > EPS) {
            issues += TierIssue(order.first(), TierIssueCode.FIRST_NOT_ZERO, "El primer tramo debe empezar en 0 km")
        }
        for (k in 0 until order.size - 1) {
            val a = tiers[order[k]]
            val b = tiers[order[k + 1]]
            val aTo = a.toKm
            if (aTo == null) {
                issues += TierIssue(order[k], TierIssueCode.OPEN_NOT_LAST, "Solo el último tramo puede ser abierto (sin límite)")
                continue
            }
            when {
                b.fromKm > aTo + EPS -> issues += TierIssue(order[k + 1], TierIssueCode.GAP,
                    "Hueco sin cobertura entre ${fmt(aTo)} y ${fmt(b.fromKm)} km")
                b.fromKm < aTo - EPS -> issues += TierIssue(order[k + 1], TierIssueCode.OVERLAP,
                    "Solape: el tramo desde ${fmt(b.fromKm)} km pisa el tramo que llega a ${fmt(aTo)} km")
            }
        }
        val last = tiers[order.last()]
        if (config.infiniteLastTier && last.toKm != null) {
            issues += TierIssue(order.last(), TierIssueCode.LAST_MUST_BE_OPEN,
                "Con tramos infinitos activo, el último tramo debe quedar abierto (\"o más\")")
        }
        if (!config.infiniteLastTier && last.toKm == null) {
            issues += TierIssue(order.last(), TierIssueCode.LAST_MUST_BE_CLOSED,
                "Con tramos infinitos desactivado, el último tramo necesita límite superior")
        }
        return issues
    }

    private fun fmt(v: Double) = if (v == Math.floor(v)) v.toLong().toString() else "%.2f".format(v)
}
