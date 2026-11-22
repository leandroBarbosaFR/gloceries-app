import ExpoModulesCore
import MapKit

/// Finds supermarkets / food stores around a coordinate with Apple Maps data (MapKit).
/// Free, no API key, no third-party service. Results are combined from a points-of-interest
/// request and a natural-language query ("supermarché"), then de-duplicated in JavaScript.
public class StoreSearchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StoreSearch")

    AsyncFunction("searchSupermarkets") { (latitude: Double, longitude: Double, radiusMeters: Double, promise: Promise) in
      let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      guard CLLocationCoordinate2DIsValid(center) else {
        promise.reject("ERR_STORE_SEARCH_COORDINATES", "Invalid coordinates")
        return
      }
      let filter = MKPointOfInterestFilter(including: [.foodMarket])

      let poiRequest = MKLocalPointsOfInterestRequest(center: center, radius: radiusMeters)
      poiRequest.pointOfInterestFilter = filter

      let textRequest = MKLocalSearch.Request()
      textRequest.naturalLanguageQuery = "supermarché"
      textRequest.resultTypes = .pointOfInterest
      textRequest.pointOfInterestFilter = filter
      textRequest.region = MKCoordinateRegion(center: center, latitudinalMeters: radiusMeters * 2, longitudinalMeters: radiusMeters * 2)

      let group = DispatchGroup()
      var collected: [MKMapItem] = []
      var errors: [Error] = []
      let lock = NSLock()

      for search in [MKLocalSearch(request: poiRequest), MKLocalSearch(request: textRequest)] {
        group.enter()
        search.start { response, error in
          lock.lock()
          if let items = response?.mapItems { collected.append(contentsOf: items) }
          if let error = error { errors.append(error) }
          lock.unlock()
          group.leave()
        }
      }

      group.notify(queue: .main) {
        // Both searches failing is an error; "no results" from MapKit (MKError.placemarkNotFound) is not.
        if collected.isEmpty, let firstError = errors.first {
          let nsError = firstError as NSError
          if nsError.domain == MKErrorDomain && nsError.code == Int(MKError.placemarkNotFound.rawValue) {
            promise.resolve([])
          } else {
            promise.reject("ERR_STORE_SEARCH", nsError.localizedDescription)
          }
          return
        }
        promise.resolve(collected.map(Self.export))
      }
    }.runOnQueue(.main)
  }

  private static func export(_ item: MKMapItem) -> [String: Any] {
    let placemark = item.placemark
    let street = [placemark.subThoroughfare, placemark.thoroughfare].compactMap { $0 }.joined(separator: " ")
    var result: [String: Any] = [
      "name": item.name ?? "",
      "latitude": placemark.coordinate.latitude,
      "longitude": placemark.coordinate.longitude,
      "street": street,
      "city": placemark.locality ?? "",
    ]
    if #available(iOS 18.0, *), let identifier = item.identifier {
      result["identifier"] = identifier.rawValue
    }
    return result
  }
}
