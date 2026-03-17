---
sidebar_position: 7
---

# Swift (iOS)

Build iOS delivery and logistics apps with Atlas using Swift. This guide covers map rendering, geocoding, routing, and GPS trip telemetry with modern async/await patterns.

## Dependencies

```swift
// Package.swift or via Xcode SPM
dependencies: [
    .package(url: "https://github.com/maplibre/maplibre-gl-native-distribution", from: "6.12.0"),
]
```

Or add via Xcode: File → Add Package Dependencies → search `maplibre-gl-native-distribution`.

### Permissions

Add to `Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>We use your location for navigation and delivery tracking.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>We use your location for delivery tracking in the background.</string>
```

Enable **Background Modes** → **Location updates** in your target's Signing & Capabilities.

## Configuration

```swift
enum AtlasConfig {
    static let baseUrl = ProcessInfo.processInfo.environment["ATLAS_URL"]
        ?? "https://api.atlas-maps.dev"
    static let apiKey = ProcessInfo.processInfo.environment["ATLAS_API_KEY"] ?? ""

    static var headers: [String: String] {
        var h = ["Content-Type": "application/json"]
        if !apiKey.isEmpty { h["X-API-Key"] = apiKey }
        return h
    }
}
```

For production, pass values via your scheme's environment variables or a `.xcconfig` file:

```
// Atlas.xcconfig
ATLAS_URL = https://api.atlas-maps.dev
ATLAS_API_KEY = your-api-key
```

## Map view

```swift
import SwiftUI
import MapLibre

struct AtlasMapView: UIViewRepresentable {
    let tileset: String
    let center: CLLocationCoordinate2D
    let zoom: Double
    var onMapReady: ((MLNMapView) -> Void)?

    init(
        tileset: String = "ghana",
        center: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: 5.603, longitude: -0.187),
        zoom: Double = 12,
        onMapReady: ((MLNMapView) -> Void)? = nil
    ) {
        self.tileset = tileset
        self.center = center
        self.zoom = zoom
        self.onMapReady = onMapReady
    }

    func makeUIView(context: Context) -> MLNMapView {
        let styleURL = URL(string: "\(AtlasConfig.baseUrl)/v1/tiles/\(tileset)/tilejson.json")!
        let mapView = MLNMapView(frame: .zero, styleURL: styleURL)
        mapView.setCenter(center, zoomLevel: zoom, animated: false)
        mapView.delegate = context.coordinator
        return mapView
    }

    func updateUIView(_ mapView: MLNMapView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onMapReady: onMapReady)
    }

    class Coordinator: NSObject, MLNMapViewDelegate {
        let onMapReady: ((MLNMapView) -> Void)?
        init(onMapReady: ((MLNMapView) -> Void)?) { self.onMapReady = onMapReady }
        func mapViewDidFinishLoadingMap(_ mapView: MLNMapView) { onMapReady?(mapView) }
    }
}
```

### UIKit alternative

```swift
import MapLibre

class MapViewController: UIViewController {
    private var mapView: MLNMapView!

    override func viewDidLoad() {
        super.viewDidLoad()
        let styleURL = URL(string: "\(AtlasConfig.baseUrl)/v1/tiles/ghana/tilejson.json")!
        mapView = MLNMapView(frame: view.bounds, styleURL: styleURL)
        mapView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        mapView.setCenter(
            CLLocationCoordinate2D(latitude: 5.603, longitude: -0.187),
            zoomLevel: 12,
            animated: false
        )
        view.addSubview(mapView)
    }
}
```

## Data types

```swift
struct LatLon: Codable {
    let lat: Double
    let lon: Double
}

struct GeocodeResult: Codable {
    let name: String
    let lat: Double
    let lon: Double
    let category: String
    let address: String?
    let confidence: Double
}

struct SearchResult: Codable {
    let name: String
    let lat: Double
    let lon: Double
    let category: String
    let address: String?
    let distanceM: Double?
    let score: Double?

    enum CodingKeys: String, CodingKey {
        case name, lat, lon, category, address, score
        case distanceM = "distance_m"
    }
}

struct RouteInstruction: Codable {
    let type: String
    let road: String?
    let distanceM: Double
    let bearing: Double

    enum CodingKeys: String, CodingKey {
        case type, road, bearing
        case distanceM = "distance_m"
    }
}

struct RouteResult: Codable {
    let distanceM: Double
    let durationS: Double
    let geometry: GeoJSON
    let instructions: [RouteInstruction]

    enum CodingKeys: String, CodingKey {
        case geometry, instructions
        case distanceM = "distance_m"
        case durationS = "duration_s"
    }
}

struct GeoJSON: Codable {
    let type: String
    let coordinates: [[Double]]
}

struct MatrixResult: Codable {
    let durationsS: [[Double]]
    let distancesM: [[Double]]

    enum CodingKeys: String, CodingKey {
        case durationsS = "durations_s"
        case distancesM = "distances_m"
    }
}

struct TripStartResult: Codable {
    let tripId: String
    enum CodingKeys: String, CodingKey { case tripId = "trip_id" }
}

struct TripSummary: Codable {
    let status: String
    let durationS: Double
    let distanceM: Double

    enum CodingKeys: String, CodingKey {
        case status
        case durationS = "duration_s"
        case distanceM = "distance_m"
    }
}
```

## Atlas API client

```swift
actor AtlasClient {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func geocode(query: String, limit: Int = 5, country: String? = nil) async throws -> [GeocodeResult] {
        var components = URLComponents(string: "\(AtlasConfig.baseUrl)/v1/geocode")!
        components.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let country { components.queryItems?.append(URLQueryItem(name: "country", value: country)) }

        let data = try await fetch(components.url!)
        let wrapper = try JSONDecoder().decode(ResultsWrapper<GeocodeResult>.self, from: data)
        return wrapper.results
    }

    func reverseGeocode(lat: Double, lon: Double, limit: Int = 1) async throws -> [GeocodeResult] {
        var components = URLComponents(string: "\(AtlasConfig.baseUrl)/v1/reverse")!
        components.queryItems = [
            URLQueryItem(name: "lat", value: "\(lat)"),
            URLQueryItem(name: "lon", value: "\(lon)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]

        let data = try await fetch(components.url!)
        let wrapper = try JSONDecoder().decode(ResultsWrapper<GeocodeResult>.self, from: data)
        return wrapper.results
    }

    func search(
        query: String,
        lat: Double,
        lon: Double,
        limit: Int = 10,
        category: String? = nil
    ) async throws -> [SearchResult] {
        var components = URLComponents(string: "\(AtlasConfig.baseUrl)/v1/search")!
        components.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "lat", value: "\(lat)"),
            URLQueryItem(name: "lon", value: "\(lon)"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let category { components.queryItems?.append(URLQueryItem(name: "category", value: category)) }

        let data = try await fetch(components.url!)
        let wrapper = try JSONDecoder().decode(ResultsWrapper<SearchResult>.self, from: data)
        return wrapper.results
    }

    func route(
        origin: LatLon,
        destination: LatLon,
        profile: String = "car"
    ) async throws -> RouteResult {
        let body: [String: Any] = [
            "origin": ["lat": origin.lat, "lon": origin.lon],
            "destination": ["lat": destination.lat, "lon": destination.lon],
            "profile": profile
        ]
        let data = try await post("\(AtlasConfig.baseUrl)/v1/route", body: body)
        return try JSONDecoder().decode(RouteResult.self, from: data)
    }

    func matrix(
        origins: [LatLon],
        destinations: [LatLon],
        profile: String = "car"
    ) async throws -> MatrixResult {
        let body: [String: Any] = [
            "origins": origins.map { ["lat": $0.lat, "lon": $0.lon] },
            "destinations": destinations.map { ["lat": $0.lat, "lon": $0.lon] },
            "profile": profile
        ]
        let data = try await post("\(AtlasConfig.baseUrl)/v1/matrix", body: body)
        return try JSONDecoder().decode(MatrixResult.self, from: data)
    }

    private func fetch(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        AtlasConfig.headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw AtlasError.requestFailed(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return data
    }

    private func post(_ urlString: String, body: [String: Any]) async throws -> Data {
        var request = URLRequest(url: URL(string: urlString)!)
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        AtlasConfig.headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw AtlasError.requestFailed(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return data
    }
}

private struct ResultsWrapper<T: Codable>: Codable {
    let results: [T]
}

enum AtlasError: Error, LocalizedError {
    case requestFailed(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .requestFailed(let code): return "Atlas request failed with status \(code)"
        }
    }
}
```

## Trip telemetry

```swift
import CoreLocation

@MainActor
class TelemetryService: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    private let session = URLSession.shared
    private var tripId: String?
    private var buffer: [TelemetryWaypoint] = []
    private var flushTimer: Timer?

    struct TelemetryWaypoint {
        let lat: Double
        let lon: Double
        let timestamp: String
        let speedKmh: Double?
        let bearing: Double?
    }

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = 50
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
    }

    func startTrip(origin: LatLon, destination: LatLon, profile: String) async throws -> String {
        locationManager.requestAlwaysAuthorization()

        let body: [String: Any] = [
            "profile": profile,
            "origin": ["lat": origin.lat, "lon": origin.lon],
            "destination": ["lat": destination.lat, "lon": destination.lon]
        ]

        var request = URLRequest(url: URL(string: "\(AtlasConfig.baseUrl)/v1/telemetry/start")!)
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        AtlasConfig.headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }

        let (data, _) = try await session.data(for: request)
        let result = try JSONDecoder().decode(TripStartResult.self, from: data)
        tripId = result.tripId

        locationManager.startUpdatingLocation()
        flushTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { await self?.flush() }
        }

        return result.tripId
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            for location in locations {
                buffer.append(TelemetryWaypoint(
                    lat: location.coordinate.latitude,
                    lon: location.coordinate.longitude,
                    timestamp: ISO8601DateFormatter().string(from: location.timestamp),
                    speedKmh: location.speed >= 0 ? location.speed * 3.6 : nil,
                    bearing: location.course >= 0 ? location.course : nil
                ))

                if buffer.count >= 10 { await flush() }
            }
        }
    }

    private func flush() async {
        guard let id = tripId, !buffer.isEmpty else { return }

        let batch = buffer
        buffer.removeAll()

        let waypoints = batch.map { wp -> [String: Any] in
            var dict: [String: Any] = ["lat": wp.lat, "lon": wp.lon, "timestamp": wp.timestamp]
            if let speed = wp.speedKmh { dict["speed_kmh"] = speed }
            if let bearing = wp.bearing { dict["bearing"] = bearing }
            return dict
        }

        var request = URLRequest(url: URL(string: "\(AtlasConfig.baseUrl)/v1/telemetry/\(id)/update")!)
        request.httpMethod = "POST"
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["waypoints": waypoints])
        AtlasConfig.headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }

        _ = try? await session.data(for: request)
    }

    func endTrip() async -> TripSummary? {
        guard let id = tripId else { return nil }

        locationManager.stopUpdatingLocation()
        flushTimer?.invalidate()
        flushTimer = nil
        await flush()
        tripId = nil

        var request = URLRequest(url: URL(string: "\(AtlasConfig.baseUrl)/v1/telemetry/\(id)/end")!)
        request.httpMethod = "POST"
        AtlasConfig.headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }

        guard let (data, _) = try? await session.data(for: request) else { return nil }
        return try? JSONDecoder().decode(TripSummary.self, from: data)
    }
}
```

## Complete delivery app (SwiftUI)

```swift
import SwiftUI
import MapLibre

struct DeliveryView: View {
    @StateObject private var telemetry = TelemetryService()
    @State private var route: RouteResult?
    @State private var tripActive = false
    @State private var summary: TripSummary?
    @State private var showConsent = false
    @State private var errorMessage: String?

    private let client = AtlasClient()
    private let depot = LatLon(lat: 5.603, lon: -0.187)
    private let delivery = LatLon(lat: 5.614, lon: -0.220)

    var body: some View {
        ZStack(alignment: .bottom) {
            AtlasMapView()
                .ignoresSafeArea()

            VStack(spacing: 12) {
                if let route {
                    Text(String(format: "%.1f km · %d min",
                        route.distanceM / 1000,
                        Int(route.durationS / 60)))
                        .font(.title2.bold())
                }

                if let summary {
                    Text(String(format: "Trip complete: %.1f km in %d min",
                        summary.distanceM / 1000,
                        Int(summary.durationS / 60)))
                        .foregroundStyle(.secondary)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }

                Button(tripActive ? "End Delivery" : "Start Delivery") {
                    if tripActive {
                        endDelivery()
                    } else {
                        showConsent = true
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(tripActive ? .red : .blue)
                .controlSize(.large)
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial)
        }
        .alert("Share location data?", isPresented: $showConsent) {
            Button("No thanks", role: .cancel) {}
            Button("Yes, share") { startDelivery() }
        } message: {
            Text("Help improve ETAs for everyone. Your data is anonymized.")
        }
    }

    private func startDelivery() {
        Task {
            do {
                async let routeResult = client.route(origin: depot, destination: delivery, profile: "motorcycle")
                async let tripId = telemetry.startTrip(origin: depot, destination: delivery, profile: "motorcycle")

                route = try await routeResult
                _ = try await tripId
                tripActive = true
                summary = nil
                errorMessage = nil
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func endDelivery() {
        Task {
            summary = await telemetry.endTrip()
            route = nil
            tripActive = false
        }
    }
}
```
