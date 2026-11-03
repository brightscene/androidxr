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

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "settings":
            showSettings = true
        case "session":
            switch body["state"] as? String {
            case "start":
                sessionStart = Date()
                nowPlaying.start(title: body["title"] as? String ?? "MindLyte")
            case "end":
                if let start = sessionStart { Health.shared.logMindful(from: start, to: Date()) }
                sessionStart = nil
                nowPlaying.stop()
            default:
                break
            }
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
