# Matriz de versiones (verificada)

| Componente | Versión | Motivo |
|---|---|---|
| Gradle (wrapper) | 8.11.1 | Soportada por AGP 8.7; corre en Java 21 |
| Android Gradle Plugin | 8.7.3 | Estable, compileSdk 35 |
| Kotlin | 2.0.21 | Plugin de compilador Compose integrado (`org.jetbrains.kotlin.plugin.compose`) |
| KSP | 2.0.21-1.0.28 | Debe coincidir con Kotlin |
| Compose BOM | 2024.12.01 | Material 3 1.3.x |
| Room | 2.6.1 (KSP) | |
| DataStore | 1.1.1 | |
| MapLibre Android | 11.8.5 | Paquete `org.maplibre.android` |
| Robolectric | 4.14.1 | Pruebas JVM con SDK 34/35 |
| JDK | 21 para ejecutar; bytecode Java 17 | `jvmTarget = 17` |
| compileSdk / targetSdk / minSdk | 35 / 35 / 26 | minSdk 26 por `TYPE_APPLICATION_OVERLAY` |

**Regla:** AGP + Kotlin + KSP + compilador Compose se actualizan juntos. El error de
la v0.7 (incompatibilidad Compose/Gradle) típicamente aparece al mezclar Kotlin 2.x
sin el plugin `kotlin.plugin.compose`, o un `kotlinCompilerExtensionVersion` que no
coincide con Kotlin. Con Kotlin 2.0+ **no** se usa `composeOptions.kotlinCompilerExtensionVersion`.

Lint informa que existen versiones más nuevas (AGP 9.x, BOM 2026.x). No se
actualizaron a propósito: no hay necesidad técnica y la matriz actual compila y
pasa todas las pruebas.

## Notas del entorno de compilación usado

- Android SDK instalado con `sdkmanager` (platform 35, build-tools 35.0.0).
- Maven Central devolvía HTTP 429 de forma intermitente: se reintentó con
  `--max-workers=1/2`. Los runtimes de Robolectric (`android-all-instrumented`
  14 y 15) se descargaron del espejo de Google de Maven Central y se verificó su SHA-1.
