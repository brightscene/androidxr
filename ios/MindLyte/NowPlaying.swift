import MediaPlayer
import UIKit

/// Lock-screen and Control Centre controls for the current session.
final class NowPlaying {
    private weak var model: AppModel?
    private var registered = false
    private var title = "MindBoss"
    private var paused = false

    init(model: AppModel) { self.model = model }

    func start(title: String) {
        self.title = title
        paused = false
        register()
        update()
        UIApplication.shared.beginReceivingRemoteControlEvents()
    }

    func stop() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func register() {
        guard !registered else { return }
        registered = true
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in self?.set(paused: false); return .success }
        c.pauseCommand.addTarget { [weak self] _ in self?.set(paused: true); return .success }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.set(paused: !self.paused)
            return .success
        }
        c.stopCommand.addTarget { [weak self] _ in self?.model?.runJS("window.mindlyteNative && window.mindlyteNative.end()"); return .success }
    }

    private func set(paused: Bool) {
        self.paused = paused
        model?.runJS(paused ? "window.mindlyteNative && window.mindlyteNative.pause()" : "window.mindlyteNative && window.mindlyteNative.play()")
        update()
    }

    private func update() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: "MindBoss",
            MPNowPlayingInfoPropertyPlaybackRate: paused ? 0.0 : 1.0,
        ]
        if let image = UIImage(named: "Mark") {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
