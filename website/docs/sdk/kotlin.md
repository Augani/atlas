---
sidebar_position: 6
---

# Kotlin (Android)

Build Android delivery and logistics apps with Atlas using Kotlin. This guide covers map rendering, geocoding, routing, and GPS trip telemetry.

## Dependencies

```kotlin
// build.gradle.kts (app)
dependencies {
    implementation("org.maplibre.gl:android-sdk:11.8.5")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    kapt("com.squareup.moshi:moshi-kotlin-codegen:1.15.1")
}
```

### Permissions

Add to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
```

## Configuration

```kotlin
object AtlasConfig {
    val baseUrl: String = BuildConfig.ATLAS_URL.ifEmpty { "https://api.atlas-maps.dev" }
    val apiKey: String = BuildConfig.ATLAS_API_KEY

    fun headers(): Map<String, String> = buildMap {
        put("Content-Type", "application/json")
        if (apiKey.isNotEmpty()) put("X-API-Key", apiKey)
    }
}
```

Add to `build.gradle.kts`:

```kotlin
android {
    defaultConfig {
        buildConfigField("String", "ATLAS_URL", "\"${project.findProperty("ATLAS_URL") ?: ""}\"")
        buildConfigField("String", "ATLAS_API_KEY", "\"${project.findProperty("ATLAS_API_KEY") ?: ""}\"")
    }
}
```

## Map setup

```xml
<!-- res/layout/activity_map.xml -->
<org.maplibre.android.maps.MapView
    android:id="@+id/mapView"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
```

```kotlin
class MapActivity : AppCompatActivity() {
    private lateinit var mapView: MapView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        MapLibre.getInstance(this)
        setContentView(R.layout.activity_map)

        mapView = findViewById(R.id.mapView)
        mapView.onCreate(savedInstanceState)
        mapView.getMapAsync { map ->
            map.setStyle(
                Style.Builder().fromUri(
                    "${AtlasConfig.baseUrl}/v1/tiles/ghana/tilejson.json"
                )
            ) {
                map.cameraPosition = CameraPosition.Builder()
                    .target(LatLng(5.603, -0.187))
                    .zoom(12.0)
                    .build()
            }
        }
    }

    override fun onStart() { super.onStart(); mapView.onStart() }
    override fun onResume() { super.onResume(); mapView.onResume() }
    override fun onPause() { super.onPause(); mapView.onPause() }
    override fun onStop() { super.onStop(); mapView.onStop() }
    override fun onDestroy() { super.onDestroy(); mapView.onDestroy() }
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        mapView.onSaveInstanceState(outState)
    }
}
```

## Data types

```kotlin
data class LatLon(val lat: Double, val lon: Double)

@JsonClass(generateAdapter = true)
data class GeocodeResult(
    val name: String,
    val lat: Double,
    val lon: Double,
    val category: String,
    val address: String? = null,
    val confidence: Double
)

@JsonClass(generateAdapter = true)
data class SearchResult(
    val name: String,
    val lat: Double,
    val lon: Double,
    val category: String,
    val address: String? = null,
    @Json(name = "distance_m") val distanceM: Double? = null,
    val score: Double? = null
)

@JsonClass(generateAdapter = true)
data class RouteInstruction(
    val type: String,
    val road: String? = null,
    @Json(name = "distance_m") val distanceM: Double,
    val bearing: Double
)

@JsonClass(generateAdapter = true)
data class RouteResult(
    @Json(name = "distance_m") val distanceM: Double,
    @Json(name = "duration_s") val durationS: Double,
    val geometry: Map<String, Any>,
    val instructions: List<RouteInstruction>
)

@JsonClass(generateAdapter = true)
data class MatrixResult(
    @Json(name = "durations_s") val durationsS: List<List<Double>>,
    @Json(name = "distances_m") val distancesM: List<List<Double>>
)
```

## Atlas API client

```kotlin
class AtlasClient(
    private val client: OkHttpClient = OkHttpClient()
) {
    private val moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()

    suspend fun geocode(
        query: String,
        limit: Int = 5,
        country: String? = null
    ): List<GeocodeResult> = withContext(Dispatchers.IO) {
        val url = "${AtlasConfig.baseUrl}/v1/geocode".toHttpUrl().newBuilder()
            .addQueryParameter("q", query)
            .addQueryParameter("limit", limit.toString())
            .apply { country?.let { addQueryParameter("country", it) } }
            .build()

        val request = Request.Builder().url(url).applyHeaders().build()
        val body = client.newCall(request).execute().use { it.body?.string() ?: throw AtlasException("Empty response") }
        val type = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
        val adapter = moshi.adapter<Map<String, Any>>(type)
        val data = adapter.fromJson(body) ?: throw AtlasException("Invalid response")
        val results = data["results"] as? List<*> ?: return@withContext emptyList()
        val resultAdapter = moshi.adapter(GeocodeResult::class.java)
        results.map { resultAdapter.fromJsonValue(it) ?: throw AtlasException("Invalid result") }
    }

    suspend fun reverseGeocode(
        lat: Double,
        lon: Double,
        limit: Int = 1
    ): List<GeocodeResult> = withContext(Dispatchers.IO) {
        val url = "${AtlasConfig.baseUrl}/v1/reverse".toHttpUrl().newBuilder()
            .addQueryParameter("lat", lat.toString())
            .addQueryParameter("lon", lon.toString())
            .addQueryParameter("limit", limit.toString())
            .build()

        val request = Request.Builder().url(url).applyHeaders().build()
        val body = client.newCall(request).execute().use { it.body?.string() ?: throw AtlasException("Empty response") }
        val type = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
        val data = moshi.adapter<Map<String, Any>>(type).fromJson(body)
            ?: throw AtlasException("Invalid response")
        val results = data["results"] as? List<*> ?: return@withContext emptyList()
        val resultAdapter = moshi.adapter(GeocodeResult::class.java)
        results.map { resultAdapter.fromJsonValue(it) ?: throw AtlasException("Invalid result") }
    }

    suspend fun search(
        query: String,
        lat: Double,
        lon: Double,
        limit: Int = 10,
        category: String? = null
    ): List<SearchResult> = withContext(Dispatchers.IO) {
        val url = "${AtlasConfig.baseUrl}/v1/search".toHttpUrl().newBuilder()
            .addQueryParameter("q", query)
            .addQueryParameter("lat", lat.toString())
            .addQueryParameter("lon", lon.toString())
            .addQueryParameter("limit", limit.toString())
            .apply { category?.let { addQueryParameter("category", it) } }
            .build()

        val request = Request.Builder().url(url).applyHeaders().build()
        val body = client.newCall(request).execute().use { it.body?.string() ?: throw AtlasException("Empty response") }
        val type = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
        val data = moshi.adapter<Map<String, Any>>(type).fromJson(body)
            ?: throw AtlasException("Invalid response")
        val results = data["results"] as? List<*> ?: return@withContext emptyList()
        val resultAdapter = moshi.adapter(SearchResult::class.java)
        results.map { resultAdapter.fromJsonValue(it) ?: throw AtlasException("Invalid result") }
    }

    suspend fun route(
        origin: LatLon,
        destination: LatLon,
        profile: String = "car"
    ): RouteResult = withContext(Dispatchers.IO) {
        val json = """
            {"origin":{"lat":${origin.lat},"lon":${origin.lon}},
             "destination":{"lat":${destination.lat},"lon":${destination.lon}},
             "profile":"$profile"}
        """.trimIndent()

        val request = Request.Builder()
            .url("${AtlasConfig.baseUrl}/v1/route")
            .post(json.toRequestBody("application/json".toMediaType()))
            .applyHeaders()
            .build()

        val body = client.newCall(request).execute().use { it.body?.string() ?: throw AtlasException("Empty response") }
        moshi.adapter(RouteResult::class.java).fromJson(body)
            ?: throw AtlasException("Invalid response")
    }

    suspend fun matrix(
        origins: List<LatLon>,
        destinations: List<LatLon>,
        profile: String = "car"
    ): MatrixResult = withContext(Dispatchers.IO) {
        val json = moshi.adapter(Any::class.java).toJson(mapOf(
            "origins" to origins.map { mapOf("lat" to it.lat, "lon" to it.lon) },
            "destinations" to destinations.map { mapOf("lat" to it.lat, "lon" to it.lon) },
            "profile" to profile
        ))

        val request = Request.Builder()
            .url("${AtlasConfig.baseUrl}/v1/matrix")
            .post(json.toRequestBody("application/json".toMediaType()))
            .applyHeaders()
            .build()

        val body = client.newCall(request).execute().use { it.body?.string() ?: throw AtlasException("Empty response") }
        moshi.adapter(MatrixResult::class.java).fromJson(body)
            ?: throw AtlasException("Invalid response")
    }

    private fun Request.Builder.applyHeaders(): Request.Builder = apply {
        AtlasConfig.headers().forEach { (key, value) -> addHeader(key, value) }
    }
}

class AtlasException(message: String, val statusCode: Int? = null) : Exception(message)
```

## Trip telemetry

```kotlin
class TelemetryService(
    private val context: Context,
    private val client: OkHttpClient = OkHttpClient()
) {
    private val moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
    private val fusedClient = LocationServices.getFusedLocationProviderClient(context)
    private var tripId: String? = null
    private val buffer = mutableListOf<TelemetryWaypoint>()
    private var locationCallback: LocationCallback? = null
    private val handler = Handler(Looper.getMainLooper())
    private val flushRunnable = object : Runnable {
        override fun run() {
            flush()
            handler.postDelayed(this, 30_000)
        }
    }

    data class TelemetryWaypoint(
        val lat: Double,
        val lon: Double,
        val timestamp: String,
        val speedKmh: Double? = null,
        val bearing: Double? = null
    )

    suspend fun startTrip(
        origin: LatLon,
        destination: LatLon,
        profile: String
    ): String = withContext(Dispatchers.IO) {
        val json = moshi.adapter(Any::class.java).toJson(mapOf(
            "profile" to profile,
            "origin" to mapOf("lat" to origin.lat, "lon" to origin.lon),
            "destination" to mapOf("lat" to destination.lat, "lon" to destination.lon)
        ))

        val request = Request.Builder()
            .url("${AtlasConfig.baseUrl}/v1/telemetry/start")
            .post(json.toRequestBody("application/json".toMediaType()))
            .apply { AtlasConfig.headers().forEach { (k, v) -> addHeader(k, v) } }
            .build()

        val body = client.newCall(request).execute().use {
            it.body?.string() ?: throw AtlasException("Empty response")
        }
        val type = Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
        val data = moshi.adapter<Map<String, Any>>(type).fromJson(body)
            ?: throw AtlasException("Invalid response")
        tripId = data["trip_id"] as String

        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
            .setMinUpdateDistanceMeters(50f)
            .build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                for (location in result.locations) {
                    synchronized(buffer) {
                        buffer.add(TelemetryWaypoint(
                            lat = location.latitude,
                            lon = location.longitude,
                            timestamp = java.time.Instant.ofEpochMilli(location.time).toString(),
                            speedKmh = if (location.hasSpeed()) (location.speed * 3.6).takeIf { it > 0 } else null,
                            bearing = if (location.hasBearing()) location.bearing.toDouble() else null
                        ))
                    }
                    if (buffer.size >= 10) flush()
                }
            }
        }

        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED) {
            fusedClient.requestLocationUpdates(locationRequest, locationCallback!!, Looper.getMainLooper())
        }

        handler.postDelayed(flushRunnable, 30_000)
        tripId!!
    }

    private fun flush() {
        val id = tripId ?: return
        val batch: List<TelemetryWaypoint>
        synchronized(buffer) {
            if (buffer.isEmpty()) return
            batch = buffer.toList()
            buffer.clear()
        }

        val json = moshi.adapter(Any::class.java).toJson(mapOf(
            "waypoints" to batch.map { mapOf(
                "lat" to it.lat, "lon" to it.lon, "timestamp" to it.timestamp,
                "speed_kmh" to it.speedKmh, "bearing" to it.bearing
            )}
        ))

        val request = Request.Builder()
            .url("${AtlasConfig.baseUrl}/v1/telemetry/$id/update")
            .post(json.toRequestBody("application/json".toMediaType()))
            .apply { AtlasConfig.headers().forEach { (k, v) -> addHeader(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {}
            override fun onResponse(call: Call, response: Response) { response.close() }
        })
    }

    suspend fun endTrip(): TripSummary? = withContext(Dispatchers.IO) {
        val id = tripId ?: return@withContext null

        locationCallback?.let { fusedClient.removeLocationUpdates(it) }
        locationCallback = null
        handler.removeCallbacks(flushRunnable)
        flush()
        tripId = null

        val request = Request.Builder()
            .url("${AtlasConfig.baseUrl}/v1/telemetry/$id/end")
            .post("".toRequestBody("application/json".toMediaType()))
            .apply { AtlasConfig.headers().forEach { (k, v) -> addHeader(k, v) } }
            .build()

        val body = client.newCall(request).execute().use { it.body?.string() } ?: return@withContext null
        moshi.adapter(TripSummary::class.java).fromJson(body)
    }

    @JsonClass(generateAdapter = true)
    data class TripSummary(
        val status: String,
        @Json(name = "duration_s") val durationS: Double,
        @Json(name = "distance_m") val distanceM: Double
    )
}
```

## Complete delivery activity

```kotlin
class DeliveryActivity : AppCompatActivity() {
    private lateinit var mapView: MapView
    private val atlasClient = AtlasClient()
    private lateinit var telemetry: TelemetryService
    private var maplibreMap: MapLibreMap? = null

    private var route: RouteResult? = null
    private var tripActive = false

    private val depot = LatLon(5.603, -0.187)
    private val delivery = LatLon(5.614, -0.220)

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            startDelivery()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        MapLibre.getInstance(this)
        setContentView(R.layout.activity_delivery)
        telemetry = TelemetryService(this)

        mapView = findViewById(R.id.mapView)
        mapView.onCreate(savedInstanceState)
        mapView.getMapAsync { map ->
            maplibreMap = map
            map.setStyle(
                Style.Builder().fromUri("${AtlasConfig.baseUrl}/v1/tiles/ghana/tilejson.json")
            ) {
                map.cameraPosition = CameraPosition.Builder()
                    .target(LatLng(depot.lat, depot.lon))
                    .zoom(13.0)
                    .build()
            }
        }

        findViewById<Button>(R.id.btnDelivery).setOnClickListener {
            if (tripActive) endDelivery() else requestLocationAndStart()
        }
    }

    private fun requestLocationAndStart() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED) {
            showConsentDialog()
        } else {
            locationPermissionLauncher.launch(arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ))
        }
    }

    private fun showConsentDialog() {
        AlertDialog.Builder(this)
            .setTitle("Share location data?")
            .setMessage("Help improve ETAs for everyone. Your data is anonymized.")
            .setPositiveButton("Yes, share") { _, _ -> startDelivery() }
            .setNegativeButton("No thanks", null)
            .show()
    }

    private fun startDelivery() {
        lifecycleScope.launch {
            try {
                val routeResult = atlasClient.route(depot, delivery, profile = "motorcycle")
                telemetry.startTrip(depot, delivery, "motorcycle")

                route = routeResult
                tripActive = true

                findViewById<Button>(R.id.btnDelivery).text = "End Delivery"
                findViewById<TextView>(R.id.tvInfo).text =
                    "%.1f km · %d min".format(
                        routeResult.distanceM / 1000,
                        (routeResult.durationS / 60).toInt()
                    )

                maplibreMap?.let { map ->
                    val bounds = LatLngBounds.Builder()
                        .include(LatLng(depot.lat, depot.lon))
                        .include(LatLng(delivery.lat, delivery.lon))
                        .build()
                    map.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds, 80))
                }
            } catch (e: Exception) {
                Snackbar.make(mapView, "Error: ${e.message}", Snackbar.LENGTH_LONG).show()
            }
        }
    }

    private fun endDelivery() {
        lifecycleScope.launch {
            val summary = telemetry.endTrip()
            route = null
            tripActive = false

            findViewById<Button>(R.id.btnDelivery).text = "Start Delivery"
            summary?.let {
                findViewById<TextView>(R.id.tvInfo).text =
                    "Trip complete: %.1f km in %d min".format(
                        it.distanceM / 1000,
                        (it.durationS / 60).toInt()
                    )
            }
        }
    }

    override fun onStart() { super.onStart(); mapView.onStart() }
    override fun onResume() { super.onResume(); mapView.onResume() }
    override fun onPause() { super.onPause(); mapView.onPause() }
    override fun onStop() { super.onStop(); mapView.onStop() }
    override fun onDestroy() { super.onDestroy(); mapView.onDestroy() }
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        mapView.onSaveInstanceState(outState)
    }
}
```
