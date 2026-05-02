import WidgetKit
import SwiftUI
import ActivityKit

// MARK: - Shared App Group

let appGroupID = "group.ge.myavatar.app"

// MARK: - Widget Entry

struct GenerationEntry: TimelineEntry {
    let date: Date
    let trackTitle: String
    let progress: Double        // 0.0 – 1.0
    let status: GenerationStatus
    let creditsRemaining: Int
    let lastCreationType: String

    enum GenerationStatus: String {
        case idle, generating, ready, failed
    }

    static let placeholder = GenerationEntry(
        date: .now,
        trackTitle: "My Pop Track",
        progress: 0.65,
        status: .generating,
        creditsRemaining: 150,
        lastCreationType: "Music"
    )
}

// MARK: - Timeline Provider

struct GenerationTimelineProvider: TimelineProvider {

    typealias Entry = GenerationEntry

    func placeholder(in context: Context) -> GenerationEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (GenerationEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<GenerationEntry>) -> Void) {
        let entry = makeEntry()
        // Refresh every 30s during generation, every 5min at idle
        let interval: TimeInterval = entry.status == .generating ? 30 : 300
        let next = Calendar.current.date(byAdding: .second, value: Int(interval), to: .now) ?? .now
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func makeEntry() -> GenerationEntry {
        let defaults = UserDefaults(suiteName: appGroupID)
        return GenerationEntry(
            date: .now,
            trackTitle: defaults?.string(forKey: "widget_track_title") ?? "Avatar G",
            progress: defaults?.double(forKey: "widget_progress") ?? 0,
            status: GenerationEntry.GenerationStatus(rawValue: defaults?.string(forKey: "widget_status") ?? "idle") ?? .idle,
            creditsRemaining: defaults?.integer(forKey: "widget_credits") ?? 0,
            lastCreationType: defaults?.string(forKey: "widget_last_type") ?? "Music"
        )
    }
}

// MARK: - Small Widget View

struct SmallWidgetView: View {
    let entry: GenerationEntry

    var statusColor: Color {
        switch entry.status {
        case .generating: return Color(hex: "#00d4ff")
        case .ready:      return Color(hex: "#00c896")
        case .failed:     return Color(hex: "#e83a3a")
        case .idle:       return Color.white.opacity(0.4)
        }
    }

    var body: some View {
        ZStack {
            // Background
            LinearGradient(
                colors: [Color(hex: "#03030a"), Color(hex: "#0d0d18")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )

            VStack(alignment: .leading, spacing: 8) {
                // Logo + status
                HStack {
                    Image(systemName: "waveform")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Color(hex: "#00d4ff"))
                    Spacer()
                    Circle()
                        .fill(statusColor)
                        .frame(width: 7, height: 7)
                }

                Spacer()

                if entry.status == .generating {
                    // Progress bar
                    VStack(alignment: .leading, spacing: 4) {
                        Text(entry.trackTitle)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        ProgressView(value: entry.progress)
                            .tint(Color(hex: "#00d4ff"))
                            .scaleEffect(x: 1, y: 1.5)
                        Text("\(Int(entry.progress * 100))% complete")
                            .font(.system(size: 9))
                            .foregroundColor(.white.opacity(0.5))
                    }
                } else {
                    // Credits display
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(entry.creditsRemaining)")
                            .font(.system(size: 28, design: .rounded, weight: .bold))
                            .foregroundStyle(LinearGradient(colors: [Color(hex: "#00d4ff"), Color(hex: "#7c3aed")], startPoint: .leading, endPoint: .trailing))
                        Text("credits")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.45))
                    }
                }
            }
            .padding(14)
        }
        .containerBackground(Color(hex: "#03030a"), for: .widget)
    }
}

// MARK: - Medium Widget View

struct MediumWidgetView: View {
    let entry: GenerationEntry

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#03030a"), Color(hex: "#0a0a0f")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )

            HStack(spacing: 16) {
                // Left: logo + status
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 6) {
                        Image(systemName: "waveform.circle.fill")
                            .font(.system(size: 18))
                            .foregroundColor(Color(hex: "#00d4ff"))
                        Text("Avatar G")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                    }

                    if entry.status == .generating {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Generating…")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(Color(hex: "#00d4ff"))
                            Text(entry.trackTitle)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white)
                                .lineLimit(1)
                            ProgressView(value: entry.progress)
                                .tint(Color(hex: "#00d4ff"))
                        }
                    } else if entry.status == .ready {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Ready!", systemImage: "checkmark.circle.fill")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(Color(hex: "#00c896"))
                            Text(entry.trackTitle)
                                .font(.system(size: 13))
                                .foregroundColor(.white.opacity(0.8))
                                .lineLimit(1)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("No active generation")
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.4))
                        }
                    }

                    Spacer()
                }

                Divider()
                    .overlay(Color.white.opacity(0.06))

                // Right: stats
                VStack(alignment: .leading, spacing: 10) {
                    StatRow(icon: "creditcard.fill", color: "#00d4ff", label: "Credits", value: "\(entry.creditsRemaining)")
                    StatRow(icon: "clock.fill", color: "#7c3aed", label: "Last", value: entry.lastCreationType)
                    if entry.status == .generating {
                        StatRow(icon: "percent", color: "#00c896", label: "Progress", value: "\(Int(entry.progress * 100))%")
                    }
                }
            }
            .padding(16)
        }
        .containerBackground(Color(hex: "#03030a"), for: .widget)
    }
}

private struct StatRow: View {
    let icon: String; let color: String; let label: String; let value: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 10)).foregroundColor(Color(hex: color))
            Text(label).font(.system(size: 10)).foregroundColor(.white.opacity(0.4))
            Spacer()
            Text(value).font(.system(size: 11, weight: .semibold)).foregroundColor(.white)
        }
    }
}

// MARK: - Widget Bundle

struct AvatarGWidget: Widget {
    let kind = "AvatarGWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GenerationTimelineProvider()) { entry in
            switch WidgetFamily.systemSmall {
            default:
                SmallWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("Avatar G")
        .description("Track AI generation progress and credits.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Live Activity (Dynamic Island)

struct AvatarGAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var trackTitle: String
        var progress: Double
        var status: String
        var estimatedSecondsLeft: Int
    }
    var sessionId: String
    var serviceType: String   // "Music", "Image", "Video"
}

@available(iOS 16.2, *)
struct AvatarGLiveActivityView: View {
    let context: ActivityViewContext<AvatarGAttributes>

    var body: some View {
        HStack(spacing: 12) {
            // Waveform icon
            Image(systemName: context.state.status == "generating" ? "waveform" : "checkmark.circle.fill")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(context.state.status == "ready" ? Color(hex: "#00c896") : Color(hex: "#00d4ff"))
                .symbolEffect(.variableColor.iterative, isActive: context.state.status == "generating")

            VStack(alignment: .leading, spacing: 2) {
                Text(context.state.trackTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                if context.state.status == "generating" {
                    HStack(spacing: 6) {
                        ProgressView(value: context.state.progress)
                            .tint(Color(hex: "#00d4ff"))
                            .frame(width: 100)
                        Text("\(Int(context.state.progress * 100))%")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.5))
                    }
                } else {
                    Text(context.state.status == "ready" ? "Ready! Tap to open" : context.state.status.capitalized)
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.55))
                }
            }

            Spacer()

            if context.state.estimatedSecondsLeft > 0 && context.state.status == "generating" {
                Text("~\(context.state.estimatedSecondsLeft)s")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(Color(hex: "#00d4ff"))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(hex: "#0a0a0f"))
    }
}

// MARK: - Live Activity Manager

@MainActor
final class LiveActivityManager {

    static let shared = LiveActivityManager()
    private var currentActivity: Activity<AvatarGAttributes>?
    private init() {}

    @available(iOS 16.2, *)
    func startActivity(trackTitle: String, serviceType: String, sessionId: String) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attrs = AvatarGAttributes(sessionId: sessionId, serviceType: serviceType)
        let state = AvatarGAttributes.ContentState(trackTitle: trackTitle, progress: 0, status: "generating", estimatedSecondsLeft: 30)
        currentActivity = try? Activity.request(attributes: attrs, content: .init(state: state, staleDate: nil))
    }

    @available(iOS 16.2, *)
    func updateActivity(progress: Double, estimatedSeconds: Int) {
        guard let activity = currentActivity else { return }
        Task {
            let state = AvatarGAttributes.ContentState(
                trackTitle: activity.attributes.sessionId,
                progress: progress,
                status: "generating",
                estimatedSecondsLeft: estimatedSeconds
            )
            await activity.update(.init(state: state, staleDate: nil))
        }
    }

    @available(iOS 16.2, *)
    func completeActivity(trackTitle: String) {
        guard let activity = currentActivity else { return }
        Task {
            let state = AvatarGAttributes.ContentState(trackTitle: trackTitle, progress: 1.0, status: "ready", estimatedSecondsLeft: 0)
            await activity.end(.init(state: state, staleDate: nil), dismissalPolicy: .after(.now + 5))
            currentActivity = nil
        }
    }
}

// MARK: - Widget State Updater (call from main app)

struct WidgetStateUpdater {
    static func update(trackTitle: String, progress: Double, status: String, credits: Int, lastType: String) {
        let defaults = UserDefaults(suiteName: appGroupID)
        defaults?.set(trackTitle, forKey: "widget_track_title")
        defaults?.set(progress, forKey: "widget_progress")
        defaults?.set(status, forKey: "widget_status")
        defaults?.set(credits, forKey: "widget_credits")
        defaults?.set(lastType, forKey: "widget_last_type")
        WidgetCenter.shared.reloadAllTimelines()
    }
}

// Color hex init
private extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var i: UInt64 = 0; Scanner(string: h).scanHexInt64(&i)
        let (a,r,g,b): (UInt64,UInt64,UInt64,UInt64) = h.count == 6 ? (255,i>>16&0xFF,i>>8&0xFF,i&0xFF) : (255,0,0,0)
        self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)
    }
}
