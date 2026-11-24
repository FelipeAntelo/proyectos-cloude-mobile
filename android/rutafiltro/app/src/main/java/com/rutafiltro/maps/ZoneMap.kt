package com.rutafiltro.maps

import android.graphics.PointF
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.rutafiltro.domain.GeoPoint
import com.rutafiltro.domain.Zone
import com.rutafiltro.domain.ZoneType
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import org.maplibre.geojson.Polygon

/**
 * Cartografía: estilo vectorial de OpenFreeMap (datos © OpenStreetMap contributors, ODbL;
 * esquema OpenMapTiles). Sin clave de API, uso permitido sin registro. La atribución la
 * muestra MapLibre (botón "i") a partir del estilo; no se desactiva.
 */
const val MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"

data class MapModel(
    val zones: List<Zone> = emptyList(),
    val draft: List<GeoPoint> = emptyList(),
    val draftType: ZoneType = ZoneType.RED,
    val selectedVertex: Int? = null,
    val demand: List<DemandCell> = emptyList(),
    /** Si no es null, el mapa está en modo "trazo libre": arrastrar dibuja y al soltar entrega el trazo. */
    val onFreehand: ((List<GeoPoint>) -> Unit)? = null,
)

fun zoneColorHex(t: ZoneType) = when (t) { ZoneType.RED -> "#E5484D"; ZoneType.GREEN -> "#3DBE7A"; ZoneType.GOLD -> "#E2B33C" }

/** Mapa MapLibre. [onClick] recibe el punto y una función que mide distancia en px a otro punto. */
@Composable
fun ZoneMap(model: MapModel, onClick: (GeoPoint, (GeoPoint) -> Float) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val currentClick = rememberUpdatedState(onClick)
    val holder = remember { arrayOfNulls<Any>(2) } // [0]=MapLibreMap, [1]=Style
    val mapView = remember {
        MapLibre.getInstance(context)
        MapView(context).apply {
            onCreate(null)
            getMapAsync { map ->
                holder[0] = map
                map.cameraPosition = CameraPosition.Builder()
                    .target(LatLng(SantaCruz.CENTER.lat, SantaCruz.CENTER.lng)).zoom(SantaCruz.DEFAULT_ZOOM).build()
                map.uiSettings.isRotateGesturesEnabled = false
                map.uiSettings.isTiltGesturesEnabled = false
                map.setStyle(Style.Builder().fromUri(MAP_STYLE_URL)) { style ->
                    installLayers(style)
                    holder[1] = style
                    render(style, model)
                }
                map.addOnMapClickListener { ll ->
                    val proj = map.projection
                    val tap = proj.toScreenLocation(ll)
                    currentClick.value(GeoPoint(ll.latitude, ll.longitude)) { p ->
                        val s: PointF = proj.toScreenLocation(LatLng(p.lat, p.lng))
                        kotlin.math.hypot((s.x - tap.x).toDouble(), (s.y - tap.y).toDouble()).toFloat()
                    }
                    true
                }
            }
        }
    }
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> {}
            }
        }
        lifecycle.addObserver(obs)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) mapView.onStart()
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onResume()
        onDispose {
            lifecycle.removeObserver(obs)
            mapView.onPause(); mapView.onStop(); mapView.onDestroy()
        }
    }
    androidx.compose.foundation.layout.Box(modifier) {
        AndroidView(factory = { mapView }, modifier = Modifier.matchParentSize(), update = { (holder[1] as? Style)?.let { render(it, model) } })
        val onFreehand = model.onFreehand
        if (onFreehand != null) {
            // Capa transparente: mientras está activa el mapa no se mueve; el dedo dibuja.
            val trace = remember { mutableListOf<GeoPoint>() }
            androidx.compose.foundation.layout.Spacer(Modifier.matchParentSize().pointerInput(onFreehand) {
                detectDragGestures(
                    onDragStart = { o -> trace.clear(); toGeo(holder[0] as? MapLibreMap, o.x, o.y)?.let(trace::add) },
                    onDragEnd = { if (trace.size >= 3) onFreehand(trace.toList()); trace.clear() },
                    onDragCancel = { trace.clear() },
                ) { change, _ ->
                    change.consume()
                    toGeo(holder[0] as? MapLibreMap, change.position.x, change.position.y)?.let { p ->
                        trace += p
                        (holder[1] as? Style)?.let { st -> render(st, model.copy(draft = trace.toList(), selectedVertex = null)) }
                    }
                }
            })
        }
    }
}

private fun toGeo(map: MapLibreMap?, x: Float, y: Float): GeoPoint? =
    map?.projection?.fromScreenLocation(PointF(x, y))?.let { GeoPoint(it.latitude, it.longitude) }

private fun installLayers(style: Style) {
    style.addSource(GeoJsonSource("rf-zones"))
    style.addSource(GeoJsonSource("rf-draft"))
    style.addSource(GeoJsonSource("rf-demand"))
    val color = Expression.toColor(Expression.get("color"))
    style.addLayer(CircleLayer("rf-demand-c", "rf-demand").withProperties(
        PropertyFactory.circleColor("#B5E550"), PropertyFactory.circleOpacity(0.35f),
        PropertyFactory.circleRadius(Expression.get("r")),
    ))
    style.addLayer(FillLayer("rf-zones-fill", "rf-zones").withProperties(PropertyFactory.fillColor(color), PropertyFactory.fillOpacity(Expression.get("op"))))
    style.addLayer(LineLayer("rf-zones-line", "rf-zones").withProperties(PropertyFactory.lineColor(color), PropertyFactory.lineWidth(2f)))
    style.addLayer(LineLayer("rf-draft-line", "rf-draft").withProperties(PropertyFactory.lineColor(color), PropertyFactory.lineWidth(3f))
        .withFilter(Expression.eq(Expression.geometryType(), Expression.literal("LineString"))))
    style.addLayer(CircleLayer("rf-draft-pts", "rf-draft").withProperties(
        PropertyFactory.circleColor(color), PropertyFactory.circleRadius(Expression.get("r")),
        PropertyFactory.circleStrokeColor("#FFFFFF"), PropertyFactory.circleStrokeWidth(2f),
    ).withFilter(Expression.eq(Expression.geometryType(), Expression.literal("Point"))))
}

private fun pt(p: GeoPoint) = Point.fromLngLat(p.lng, p.lat)

private fun render(style: Style, m: MapModel) {
    val zoneFeatures = m.zones.filter { it.vertices.size >= 3 }.map { z ->
        Feature.fromGeometry(Polygon.fromLngLats(listOf(z.vertices.map(::pt) + pt(z.vertices.first())))).apply {
            addStringProperty("color", zoneColorHex(z.type))
            addNumberProperty("op", if (z.enabled) 0.28 else 0.08)
        }
    }
    (style.getSource("rf-zones") as? GeoJsonSource)?.setGeoJson(FeatureCollection.fromFeatures(zoneFeatures))

    val hex = zoneColorHex(m.draftType)
    val draft = mutableListOf<Feature>()
    if (m.draft.size >= 2) {
        val ring = if (m.draft.size >= 3) m.draft + m.draft.first() else m.draft
        draft += Feature.fromGeometry(LineString.fromLngLats(ring.map(::pt))).apply { addStringProperty("color", hex) }
    }
    m.draft.forEachIndexed { i, p ->
        draft += Feature.fromGeometry(pt(p)).apply {
            addStringProperty("color", if (i == m.selectedVertex) "#FFFFFF" else hex)
            addNumberProperty("r", if (i == m.selectedVertex) 11 else 7)
        }
    }
    (style.getSource("rf-draft") as? GeoJsonSource)?.setGeoJson(FeatureCollection.fromFeatures(draft))

    val maxCount = m.demand.maxOfOrNull { it.count } ?: 1
    val demand = m.demand.map { c ->
        Feature.fromGeometry(pt(c.center)).apply { addNumberProperty("r", 8 + 22.0 * c.count / maxCount) }
    }
    (style.getSource("rf-demand") as? GeoJsonSource)?.setGeoJson(FeatureCollection.fromFeatures(demand))
}
