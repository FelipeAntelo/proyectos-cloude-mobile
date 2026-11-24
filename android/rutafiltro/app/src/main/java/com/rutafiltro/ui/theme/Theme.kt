package com.rutafiltro.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object RfColors {
    val Graphite = Color(0xFF0E0F11)
    val Surface = Color(0xFF17191C)
    val SurfaceHigh = Color(0xFF202327)
    val Outline = Color(0xFF2E3238)
    val Lime = Color(0xFFB5E550)       // controles activos (verde lima moderado)
    val OnLime = Color(0xFF14200A)
    val Red = Color(0xFFE5484D)        // bloqueos / zonas rojas
    val Green = Color(0xFF3DBE7A)      // zonas favoritas
    val Gold = Color(0xFFE2B33C)       // zonas doradas
    val Amber = Color(0xFFF0A23B)      // pausado
    val Text = Color(0xFFECEEF0)
    val TextDim = Color(0xFF9AA0A8)
    val Sim = Color(0xFF8E7CF0)        // etiqueta SIMULACIÓN
}

private val scheme = darkColorScheme(
    primary = RfColors.Lime, onPrimary = RfColors.OnLime,
    secondary = RfColors.Green, onSecondary = Color.Black,
    tertiary = RfColors.Gold,
    error = RfColors.Red, onError = Color.White,
    background = RfColors.Graphite, onBackground = RfColors.Text,
    surface = RfColors.Surface, onSurface = RfColors.Text,
    surfaceVariant = RfColors.SurfaceHigh, onSurfaceVariant = RfColors.TextDim,
    surfaceContainer = RfColors.Surface, surfaceContainerHigh = RfColors.SurfaceHigh,
    surfaceContainerHighest = RfColors.SurfaceHigh, surfaceContainerLow = RfColors.Surface,
    outline = RfColors.Outline, outlineVariant = RfColors.Outline,
)

private val type = Typography(
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 15.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    bodySmall = TextStyle(fontSize = 12.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun RutaFiltroTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = scheme, typography = type, content = content)
