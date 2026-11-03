import UserNotifications

/// A gentle daily reminder, scheduled on the device (no server needed).
enum Reminders {
    private static let id = "daily-journey"

    /// Returns false if notifications aren't allowed.
    static func schedule(hour: Int, minute: Int) async -> Bool {
        let center = UNUserNotificationCenter.current()
        let allowed = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        guard allowed else { return false }
        center.removePendingNotificationRequests(withIdentifiers: [id])
        let content = UNMutableNotificationContent()
        content.title = "Time for a journey"
        content.body = "A few quiet minutes of light and sound with MindLyte."
        content.sound = .default
        var when = DateComponents()
        when.hour = hour
        when.minute = minute
        let request = UNNotificationRequest(identifier: id, content: content,
                                            trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: true))
        do { try await center.add(request) } catch { return false }
        return true
    }

    static func cancel() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
    }
}
