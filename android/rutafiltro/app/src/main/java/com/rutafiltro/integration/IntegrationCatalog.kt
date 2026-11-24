package com.rutafiltro.integration

enum class IntegrationStatus { AVAILABLE, SIMULATED, NOT_AVAILABLE }

data class IntegrationInfo(val name: String, val status: IntegrationStatus, val detail: String)

/**
 * Estado verificado de las integraciones. Se muestra tal cual en Configuración.
 * No se declara operativa ninguna integración que no exista.
 */
object IntegrationCatalog {
    val entries = listOf(
        IntegrationInfo(
            "API oficial de inDrive para conductores",
            IntegrationStatus.NOT_AVAILABLE,
            "No se encontró una API pública o programa de socios que permita a apps de terceros " +
                "leer solicitudes ni enviar ofertas. Sin ella no hay lectura ni envío automático real.",
        ),
        IntegrationInfo(
            "Automatización de la interfaz de inDrive (accesibilidad)",
            IntegrationStatus.NOT_AVAILABLE,
            "No implementada a propósito: leer o pulsar la app de inDrive sin autorización del " +
                "operador no es un mecanismo autorizado. La interfaz RideSource/OfferSink permite " +
                "conectar un adaptador si inDrive lo autoriza.",
        ),
        IntegrationInfo(
            "Entrada manual en panel flotante",
            IntegrationStatus.AVAILABLE,
            "El conductor escribe precio y distancias que ve en inDrive; RutaFiltro calcula y " +
                "prepara la oferta. El envío lo hace el conductor en inDrive.",
        ),
        IntegrationInfo(
            "Simulador de solicitudes y ofertas",
            IntegrationStatus.SIMULATED,
            "Flujo completo con datos sintéticos de Santa Cruz. Las ofertas se registran como SIMULADAS.",
        ),
    )
}
