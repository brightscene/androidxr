import AVFoundation
import SwiftUI

@main
struct MindLyteApp: App {
    @StateObject private var model = AppModel()

    init() {
        // keep sessions playing when the screen locks or you switch apps
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
        }
    }
}
