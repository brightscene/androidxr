import SwiftUI

/// App settings: daily reminder and Apple Health. Opened from "App settings" in the menu.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("reminderOn") private var reminderOn = false
    @AppStorage("reminderMinutes") private var reminderMinutes = 8 * 60 + 30   // minutes after midnight
    @AppStorage("healthOn") private var healthOn = false
    @State private var note = ""

    private var reminderTime: Binding<Date> {
        Binding(
            get: { Calendar.current.startOfDay(for: Date()).addingTimeInterval(Double(reminderMinutes) * 60) },
            set: {
                let c = Calendar.current.dateComponents([.hour, .minute], from: $0)
                reminderMinutes = (c.hour ?? 8) * 60 + (c.minute ?? 30)
            }
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Remind me every day", isOn: $reminderOn)
                    if reminderOn {
                        DatePicker("Time", selection: reminderTime, displayedComponents: .hourAndMinute)
                    }
                } header: {
                    Text("Daily reminder")
                }

                Section {
                    Toggle("Save mindful minutes", isOn: $healthOn)
                } header: {
                    Text("Apple Health")
                } footer: {
                    Text("Each session of a minute or more is saved to Apple Health as mindful minutes.")
                }

                if !note.isEmpty {
                    Section { Text(note).foregroundStyle(.secondary) }
                }

                Section {
                    LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")
                    Link("MindLyte on the web", destination: URL(string: "https://brightscene.github.io/androidxr/")!)
                } header: {
                    Text("About")
                }
            }
            .navigationTitle("Settings")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .onChange(of: reminderOn) { _ in applyReminder() }
            .onChange(of: reminderMinutes) { _ in applyReminder() }
            .onChange(of: healthOn) { on in
                guard on else { return }
                Task {
                    let ok = await Health.shared.requestAccess()
                    if !ok {
                        healthOn = false
                        note = "MindLyte can't save to Apple Health. You can allow it in the Health app under Sharing > Apps."
                    }
                }
            }
        }
    }

    private func applyReminder() {
        guard reminderOn else { Reminders.cancel(); return }
        Task {
            let ok = await Reminders.schedule(hour: reminderMinutes / 60, minute: reminderMinutes % 60)
            if !ok {
                reminderOn = false
                note = "Notifications are turned off for MindLyte. You can allow them in the Settings app."
            }
        }
    }
}
