import SwiftUI

struct ContentView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        ZStack {
            Color(red: 0.02, green: 0.024, blue: 0.05).ignoresSafeArea()
            WebView(model: model)
                .ignoresSafeArea(edges: .bottom)
                .opacity(model.loaded ? 1 : 0)

            if !model.loaded && !model.failed { Splash() }
            if model.failed { Offline { model.retry() } }
        }
        .animation(.easeOut(duration: 0.6), value: model.loaded)
        .sheet(isPresented: $model.showSettings) { SettingsView() }
    }
}

/// Shown while the journeys load.
private struct Splash: View {
    @State private var glow = false
    var body: some View {
        VStack(spacing: 18) {
            Image("Mark")
                .resizable()
                .frame(width: 150, height: 150)
                .shadow(color: Color(red: 0.64, green: 0.58, blue: 1).opacity(glow ? 0.7 : 0.2), radius: 22)
            Wordmark(size: 40)
            Text("JOURNEYS IN LIGHT")
                .font(.system(size: 12, weight: .regular))
                .tracking(5)
                .foregroundStyle(Color(red: 0.62, green: 0.59, blue: 0.77))
        }
        .onAppear { withAnimation(.easeInOut(duration: 1.6).repeatForever()) { glow = true } }
    }
}

private struct Offline: View {
    let retry: () -> Void
    var body: some View {
        VStack(spacing: 16) {
            Wordmark(size: 34)
            Text("MindBoss needs a connection to load your journeys.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("Try again", action: retry)
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.95, green: 0.94, blue: 0.93))
                .foregroundStyle(.black)
        }
        .padding(32)
    }
}

/// "mind" + gradient "lyte", as on the website.
struct Wordmark: View {
    let size: CGFloat
    var body: some View {
        HStack(spacing: 0) {
            Text("mind").fontWeight(.light).foregroundStyle(Color(red: 0.91, green: 0.89, blue: 1))
            Text("lyte").fontWeight(.medium).foregroundStyle(
                LinearGradient(colors: [Color(red: 0.37, green: 0.84, blue: 0.82), Color(red: 0.64, green: 0.58, blue: 1), Color(red: 0.95, green: 0.61, blue: 0.82)],
                               startPoint: .leading, endPoint: .trailing))
        }
        .font(.system(size: size, design: .rounded))
    }
}
