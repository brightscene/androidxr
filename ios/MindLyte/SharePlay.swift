import Foundation
import GroupActivities
import AVKit
import UIKit

/// SharePlay: on a FaceTime call, "Share with SharePlay" starts the same
/// MindLyte journey for everyone on the call, in step. Whoever starts, changes
/// or stops a journey, it happens for everyone. Each person's own device makes
/// the sound and pictures (nothing is streamed), so it stays smooth.
struct MindLyteTogether: GroupActivity {
    var journey: String
    var scene: String
    var title: String

    var metadata: GroupActivityMetadata {
        var m = GroupActivityMetadata()
        m.title = title.isEmpty ? "MindBoss" : "MindBoss · \(title)"
        m.subtitle = "A journey together"
        m.type = .generic
        return m
    }
}

/// One message between people on the call: start a journey, or stop.
struct TogetherMessage: Codable {
    var type: String      // "start" or "stop"
    var journey: String?
    var scene: String?
}

@MainActor
final class SharePlay {
    weak var model: AppModel?
    private var session: GroupSession<MindLyteTogether>?
    private var messenger: GroupSessionMessenger?
    private var tasks = Set<Task<Void, Never>>()

    init(model: AppModel) {
        self.model = model
        // join any SharePlay session that's started for MindLyte, whoever started it
        Task { [weak self] in
            for await session in MindLyteTogether.sessions() { self?.configure(session) }
        }
    }

    var active: Bool { session != nil }

    private func configure(_ session: GroupSession<MindLyteTogether>) {
        self.session = session
        let messenger = GroupSessionMessenger(session: session)
        self.messenger = messenger
        tasks.forEach { $0.cancel() }
        tasks.removeAll()
        // someone else started, changed or stopped a journey
        tasks.insert(Task { [weak self] in
            for await (message, _) in messenger.messages(of: TogetherMessage.self) { self?.apply(message) }
        })
        // the activity itself (whoever started SharePlay chose the first journey)
        tasks.insert(Task { [weak self] in
            for await activity in session.$activity.values {
                self?.apply(TogetherMessage(type: "start", journey: activity.journey, scene: activity.scene))
            }
        })
        tasks.insert(Task { [weak self] in
            for await state in session.$state.values {
                if case .invalidated = state { self?.session = nil; self?.messenger = nil }
            }
        })
        session.join()
    }

    private func apply(_ m: TogetherMessage) {
        guard let data = try? JSONEncoder().encode(m), let json = String(data: data, encoding: .utf8) else { return }
        model?.runJS("window.mindlyteRemote && window.mindlyteRemote(\(json))")
    }

    /// "Share with SharePlay" from the web app: start SharePlay with this journey
    /// (on a FaceTime call), or if it's already running, move everyone to it.
    func share(journey: String, scene: String, title: String) {
        if session != nil { send(TogetherMessage(type: "start", journey: journey, scene: scene)); return }
        let activity = MindLyteTogether(journey: journey, scene: scene, title: title)
        Task {
            switch await activity.prepareForActivation() {
            case .activationPreferred:
                _ = try? await activity.activate()
            case .activationDisabled:
                model?.runJS("window.mindlyteNative && window.mindlyteNative.toast && window.mindlyteNative.toast('Start a FaceTime call first, then share with SharePlay')")
            default:
                break
            }
        }
    }

    /// A journey started or stopped here: tell everyone on the call.
    func local(_ type: String, journey: String?, scene: String?) {
        guard session != nil else { return }
        send(TogetherMessage(type: type, journey: journey, scene: scene))
    }

    private func send(_ m: TogetherMessage) {
        guard let messenger else { return }
        Task { try? await messenger.send(m) }
    }
}

/// AirPlay: shows the system's AirPlay picker (an Apple TV, AirPlay speakers),
/// as if its button had been tapped.
enum AirPlay {
    @MainActor static func showPicker(in view: UIView?) {
        guard let view else { return }
        let picker = AVRoutePickerView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        picker.prioritizesVideoDevices = true
        picker.alpha = 0.01
        view.addSubview(picker)
        if let button = picker.subviews.compactMap({ $0 as? UIButton }).first {
            button.sendActions(for: .touchUpInside)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { picker.removeFromSuperview() }
    }
}
