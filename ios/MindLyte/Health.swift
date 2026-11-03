import HealthKit

/// Saves sessions to Apple Health as mindful minutes (only when you turn it on in Settings).
final class Health {
    static let shared = Health()
    private let store = HKHealthStore()
    private let mindful = HKObjectType.categoryType(forIdentifier: .mindfulSession)!

    var enabled: Bool { UserDefaults.standard.bool(forKey: "healthOn") }

    /// Asks for permission. Returns false if Health isn't available or access was declined.
    func requestAccess() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        do {
            try await store.requestAuthorization(toShare: [mindful], read: [])
            return store.authorizationStatus(for: mindful) == .sharingAuthorized
        } catch {
            return false
        }
    }

    /// Sessions of a minute or more count.
    func logMindful(from start: Date, to end: Date) {
        guard enabled, end.timeIntervalSince(start) >= 60, HKHealthStore.isHealthDataAvailable() else { return }
        let sample = HKCategorySample(type: mindful, value: HKCategoryValue.notApplicable.rawValue, start: start, end: end)
        store.save(sample) { _, _ in }
    }
}
