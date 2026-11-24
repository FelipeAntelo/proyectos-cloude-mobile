package com.rutafiltro.domain

import kotlinx.serialization.Serializable

/**
 * - [MANUAL]: el motor evalúa y PREPARA la oferta; el conductor decide y la envía él mismo.
 * - [AUTOMATIC]: el motor envía la oferta SOLO si el destino de ofertas declara envío
 *   autorizado (o es el simulador, que registra la oferta como SIMULADA).
 */
@Serializable
enum class AutoMode { MANUAL, AUTOMATIC }

@Serializable
data class AutomationConfig(
    val mode: AutoMode = AutoMode.MANUAL,
    /**
     * Rechazo agresivo: las solicitudes con datos insuficientes se descartan de inmediato
     * (en vez de quedar "pendientes de revisión") y, si el origen lo permite, se ocultan.
     * Límite: como máximo [aggressiveMaxDismissPerMinute] descartes visuales por minuto.
     */
    val aggressiveReject: Boolean = false,
    val aggressiveMaxDismissPerMinute: Int = 30,
    /** Limpiar visualmente solicitudes descartadas (solo si el origen soporta "dismiss"). */
    val clearDiscarded: Boolean = true,
    /** Autorefresco: intervalo en segundos (se respeta el mínimo que declare el origen). */
    val autoRefreshEnabled: Boolean = true,
    val autoRefreshSeconds: Int = 8,
    /**
     * Intentos máximos por viaje: si el origen informa que el pasajero no aceptó una oferta
     * enviada, el motor puede volver a ofertar a la misma solicitud hasta este total.
     */
    val maxAttemptsPerRequest: Int = 1,
    /** Incremento en Bs para cada reintento sobre la misma solicitud (respeta el importe máximo). */
    val retryIncrementBs: Double = 0.0,
    /** Aviso con sonido y vibración cuando hay una oferta preparada o enviada. */
    val soundAlert: Boolean = true,
    /** Ventana de deduplicación: misma solicitud vista en este lapso no se reprocesa. */
    val dedupWindowSeconds: Int = 600,
)
