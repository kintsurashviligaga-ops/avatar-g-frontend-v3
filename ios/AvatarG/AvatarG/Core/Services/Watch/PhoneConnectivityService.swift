import Foundation
import WatchConnectivity

// MARK: - Phone-side WatchConnectivity

@MainActor
final class PhoneConnectivityService: NSObject, ObservableObject {

    static let shared = PhoneConnectivityService()

    @Published var isWatchReachable = false

    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    // Push current app state to Watch
    func pushStateToWatch(credits: Int, generationTitle: String? = nil, progress: Double? = nil, type: String? = nil, done: Bool = false) {
        guard WCSession.default.isReachable else { return }
        var msg: [String: Any] = ["credits": credits]
        if let title = generationTitle { msg["generationTitle"] = title }
        if let p = progress { msg["generationProgress"] = p }
        if let t = type { msg["generationType"] = t }
        if done { msg["generationDone"] = true }
        WCSession.default.sendMessage(msg, replyHandler: nil, errorHandler: nil)
    }

    func sendAgentReply(_ text: String) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["agentReply": text], replyHandler: nil, errorHandler: nil)
    }
}

extension PhoneConnectivityService: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.isWatchReachable = state == .activated }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            if let command = message["agentCommand"] as? String {
                // Forward voice command from Watch to Agent G
                NotificationCenter.default.post(
                    name: .watchAgentCommand,
                    object: nil,
                    userInfo: ["command": command, "language": message["language"] ?? "ka"]
                )
            }
            if let type = message["quickCreate"] as? String,
               let prompt = message["prompt"] as? String {
                NotificationCenter.default.post(
                    name: .watchQuickCreate,
                    object: nil,
                    userInfo: ["type": type, "prompt": prompt]
                )
            }
        }
    }
}

extension Notification.Name {
    static let watchAgentCommand = Notification.Name("avatarg.watchAgentCommand")
    static let watchQuickCreate  = Notification.Name("avatarg.watchQuickCreate")
}
