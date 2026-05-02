import SwiftUI
import WatchKit
import WatchConnectivity

// MARK: - Watch App Entry

@main
struct AvatarGWatchApp: App {
    @WKApplicationDelegateAdaptor private var appDelegate: WatchAppDelegate
    @StateObject private var connectivity = WatchConnectivityManager.shared
    @StateObject private var agentState = WatchAgentState.shared

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environmentObject(connectivity)
                .environmentObject(agentState)
        }
    }
}

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        WatchConnectivityManager.shared.activateSession()
    }
}

// MARK: - Watch Agent State

@MainActor
final class WatchAgentState: ObservableObject {
    static let shared = WatchAgentState()
    @Published var credits: Int = 0
    @Published var activeGeneration: WatchGeneration?
    @Published var lastAgentReply: String = ""
    @Published var isRecording = false
    private init() {}

    struct WatchGeneration {
        let title: String
        var progress: Double
        let type: String
    }
}

// MARK: - WatchConnectivity Manager

@MainActor
final class WatchConnectivityManager: NSObject, ObservableObject {

    static let shared = WatchConnectivityManager()
    @Published var isReachable = false
    private override init() { super.init() }

    func activateSession() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func sendToPhone(_ message: [String: Any]) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }
}

extension WatchConnectivityManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.isReachable = activationState == .activated }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            if let credits = message["credits"] as? Int {
                WatchAgentState.shared.credits = credits
            }
            if let reply = message["agentReply"] as? String {
                WatchAgentState.shared.lastAgentReply = reply
            }
            if let progress = message["generationProgress"] as? Double,
               let title = message["generationTitle"] as? String,
               let type = message["generationType"] as? String {
                WatchAgentState.shared.activeGeneration = .init(title: title, progress: progress, type: type)
            }
            if let done = message["generationDone"] as? Bool, done {
                WatchAgentState.shared.activeGeneration = nil
            }
        }
    }
}

// MARK: - Root View

struct WatchRootView: View {
    @EnvironmentObject var agentState: WatchAgentState
    @EnvironmentObject var connectivity: WatchConnectivityManager

    var body: some View {
        TabView {
            WatchHomeView()
            WatchAgentView()
            WatchGenerationView()
        }
        .tabViewStyle(.carousel)
    }
}

// MARK: - Watch Home View

struct WatchHomeView: View {
    @EnvironmentObject var agentState: WatchAgentState

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "waveform")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.cyan)
                Text("Avatar G")
                    .font(.system(size: 13, weight: .bold))
            }

            if agentState.credits > 0 {
                Text("\(agentState.credits) credits")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            if let gen = agentState.activeGeneration {
                VStack(spacing: 4) {
                    Text(gen.title)
                        .font(.system(size: 11, weight: .medium))
                        .lineLimit(1)
                    ProgressView(value: gen.progress)
                        .tint(.cyan)
                    Text("\(Int(gen.progress * 100))%")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
                .padding(.horizontal, 8)
                .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
            } else {
                Text("No active generation")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
        }
        .navigationTitle("Avatar G")
    }
}

// MARK: - Watch Agent Voice View

struct WatchAgentView: View {
    @EnvironmentObject var agentState: WatchAgentState
    @EnvironmentObject var connectivity: WatchConnectivityManager
    @State private var isPresenting = false

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: agentState.isRecording ? "waveform.circle.fill" : "mic.circle.fill")
                .font(.system(size: 36))
                .foregroundColor(.cyan)
                .symbolEffect(.pulse, isActive: agentState.isRecording)

            Text(agentState.isRecording ? "Listening…" : "Agent G")
                .font(.system(size: 13, weight: .semibold))

            if !agentState.lastAgentReply.isEmpty {
                Text(agentState.lastAgentReply)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            }

            Button(agentState.isRecording ? "Stop" : "Hold to Speak") {
                if agentState.isRecording {
                    stopRecording()
                } else {
                    startRecording()
                }
            }
            .buttonStyle(.bordered)
            .tint(.cyan)
            .font(.system(size: 11))
        }
        .navigationTitle("Agent G")
    }

    private func startRecording() {
        agentState.isRecording = true
        // Trigger dictation on watch
        WKExtension.shared().visibleInterfaceController?.presentTextInputController(
            withSuggestions: ["create a song", "generate image", "show gallery"],
            allowedInputMode: .plain
        ) { results in
            Task { @MainActor in
                if let text = results?.first as? String {
                    connectivity.sendToPhone(["agentCommand": text, "language": "ka"])
                }
                agentState.isRecording = false
            }
        }
    }

    private func stopRecording() {
        agentState.isRecording = false
    }
}

// MARK: - Watch Generation Status View

struct WatchGenerationView: View {
    @EnvironmentObject var agentState: WatchAgentState
    @EnvironmentObject var connectivity: WatchConnectivityManager

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "music.note.list")
                .font(.system(size: 24))
                .foregroundColor(.purple)

            Text("Quick Create")
                .font(.system(size: 13, weight: .bold))

            VStack(spacing: 6) {
                WatchQuickButton(label: "🎵 Pop Song", color: .cyan) {
                    connectivity.sendToPhone(["quickCreate": "music", "prompt": "create a pop song"])
                }
                WatchQuickButton(label: "🎨 Image", color: .purple) {
                    connectivity.sendToPhone(["quickCreate": "image", "prompt": "create an abstract image"])
                }
                WatchQuickButton(label: "👤 Avatar", color: .green) {
                    connectivity.sendToPhone(["quickCreate": "avatar", "prompt": "create an avatar"])
                }
            }
        }
        .navigationTitle("Create")
    }
}

private struct WatchQuickButton: View {
    let label: String; let color: Color; let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .tint(color)
    }
}
