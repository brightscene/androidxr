import Foundation
import WebKit

/// Talks to the MindLyte web app. The page sends messages through
/// `window.webkit.messageHandlers.mindlyte`, and the app answers through
/// `window.mindlyteNative` (see src/ui/dom.js).
final class AppModel: NSObject, ObservableObject, WKScriptMessageHandler {
    static let siteURL = URL(string: "https://brightscene.github.io/androidxr/?source=ios-app")!

    @Published var showSettings = false
    @Published var loaded = false
    @Published var failed = false

    weak var webView: WKWebView?
    private var sessionStart: Date?
    private lazy var nowPlaying = NowPlaying(model: self)
    @MainActor lazy var sharePlay = SharePlay(model: self)

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "settings":
            showSettings = true
        case "session":
            switch body["state"] as? String {
            case "start":
                sessionStart = Date()
                nowPlaying.start(title: body["title"] as? String ?? "MindBoss")
                let id = body["id"] as? String, scene = body["scene"] as? String
                if body["remote"] as? Bool != true { Task { @MainActor in self.sharePlay.local("start", journey: id, scene: scene) } }
            case "end":
                if let start = sessionStart { Health.shared.logMindful(from: start, to: Date()) }
                sessionStart = nil
                nowPlaying.stop()
                if body["remote"] as? Bool != true { Task { @MainActor in self.sharePlay.local("stop", journey: nil, scene: nil) } }
            default:
                break
            }
        case "airplay":
            // Share to TV: the AirPlay picker, for an Apple TV
            Task { @MainActor in AirPlay.showPicker(in: self.webView) }
        case "shareplay":
            let id = body["id"] as? String ?? "", scene = body["scene"] as? String ?? "auto", title = body["title"] as? String ?? ""
            Task { @MainActor in self.sharePlay.share(journey: id, scene: scene, title: title) }
        default:
            break
        }
    }

    func runJS(_ code: String) {
        webView?.evaluateJavaScript(code, completionHandler: nil)
    }

    func retry() {
        failed = false
        if let web = webView {
            if web.url == nil { web.load(URLRequest(url: Self.siteURL)) } else { web.reload() }
        }
    }
}
