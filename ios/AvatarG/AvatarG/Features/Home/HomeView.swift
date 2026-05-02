import SwiftUI

// MARK: - Home View

struct HomeView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var agentViewModel = AgentGViewModel()
    @State private var showAgentChat = false
    @State private var recentItems: [GeneratedContent] = HomeView.mockRecentItems()
    @State private var itemsOpacity: Double = 0
    @State private var itemsOffset: CGFloat = 20
    @State private var promptInput: String = ""
    @FocusState private var isPromptFocused: Bool

    private let quickPrompts: [(emoji: String, text: String)] = [
        ("🎵", "Make a pop song"),
        ("🎨", "Create an avatar"),
        ("🎬", "Generate a video"),
        ("🎸", "Make a rock track"),
        ("🧬", "Remix my photo"),
        ("🎷", "Jazz improvisation"),
    ]

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: AvatarGSpacing.lg) {
                        // Header with greeting
                        headerSection

                        // "Ask Agent G" input bar
                        askAgentBar

                        // Quick prompts
                        quickPromptsSection

                        // Stats bar
                        statsBar

                        // Recent activity
                        recentActivitySection

                        Color.clear.frame(height: AvatarGSpacing.xxl)
                    }
                }
            }
            .navigationBarHidden(true)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) {
                itemsOpacity = 1
                itemsOffset = 0
            }
        }
        .sheet(isPresented: $showAgentChat) {
            AgentGChatView()
                .environmentObject(agentViewModel)
                .environmentObject(appState)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Date().greetingTime())
                        .font(AvatarGFonts.bodyMedium)
                        .foregroundColor(AvatarGColors.textTertiary)

                    Text(appState.greetingWithName())
                        .font(.system(size: 32, weight: .black, design: .rounded))
                        .foregroundColor(AvatarGColors.textPrimary)
                }

                Spacer()

                // Credit badge
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(appState.credits)")
                        .font(AvatarGFonts.displaySmall)
                        .foregroundStyle(AvatarGColors.gradientCyanViolet)
                    Text("credits")
                        .font(AvatarGFonts.bodyXSmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                }
                .padding(AvatarGSpacing.sm)
                .glassCard(cornerRadius: AvatarGRadius.md)
            }
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.top, AvatarGSpacing.lg)
        }
        .opacity(itemsOpacity)
        .offset(y: itemsOffset)
    }

    // MARK: - Ask Agent Bar

    private var askAgentBar: some View {
        Button(action: { showAgentChat = true }) {
            HStack(spacing: AvatarGSpacing.md) {
                ZStack {
                    Circle()
                        .fill(AvatarGColors.gradientCyanViolet)
                        .frame(width: 36, height: 36)
                    Text("G")
                        .font(.system(size: 14, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                }

                Text("Agent G-ს ჰკითხე რამე...")
                    .font(AvatarGFonts.bodyMedium)
                    .foregroundColor(AvatarGColors.textTertiary)

                Spacer()

                Image(systemName: "mic.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AvatarGColors.cyanBase)
            }
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.vertical, AvatarGSpacing.md)
            .background(
                RoundedRectangle(cornerRadius: AvatarGRadius.xl)
                    .fill(AvatarGColors.spaceCard)
                    .overlay(
                        RoundedRectangle(cornerRadius: AvatarGRadius.xl)
                            .stroke(
                                LinearGradient(
                                    colors: [AvatarGColors.cyanBase.opacity(0.4), AvatarGColors.violetBase.opacity(0.4)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                ),
                                lineWidth: 1
                            )
                    )
            )
            .shadow(color: AvatarGColors.cyanBase.opacity(0.1), radius: 12, x: 0, y: 4)
        }
        .buttonStyle(PlainButtonStyle())
        .padding(.horizontal, AvatarGSpacing.md)
        .opacity(itemsOpacity)
        .offset(y: itemsOffset)
        .animation(.easeOut(duration: 0.6).delay(0.1), value: itemsOpacity)
    }

    // MARK: - Quick Prompts

    private var quickPromptsSection: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            Text("სწრაფი შეკვეთები")
                .font(AvatarGFonts.bodySmall)
                .fontWeight(.semibold)
                .foregroundColor(AvatarGColors.textTertiary)
                .padding(.horizontal, AvatarGSpacing.md)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: AvatarGSpacing.sm) {
                    ForEach(quickPrompts, id: \.text) { prompt in
                        QuickPromptChip(emoji: prompt.emoji, text: prompt.text) {
                            agentViewModel.sendMessage(prompt.text)
                            showAgentChat = true
                        }
                    }
                }
                .padding(.horizontal, AvatarGSpacing.md)
            }
        }
        .opacity(itemsOpacity)
        .offset(y: itemsOffset)
        .animation(.easeOut(duration: 0.6).delay(0.15), value: itemsOpacity)
    }

    // MARK: - Stats Bar

    private var statsBar: some View {
        HStack(spacing: AvatarGSpacing.sm) {
            StatCard(
                icon: "music.note",
                value: "24",
                label: "Tracks",
                color: AvatarGColors.cyanBase
            )
            StatCard(
                icon: "photo.fill",
                value: "156",
                label: "Images",
                color: AvatarGColors.violetBase
            )
            StatCard(
                icon: "video.fill",
                value: "8",
                label: "Videos",
                color: AvatarGColors.emeraldBase
            )
            StatCard(
                icon: "clock.fill",
                value: "47h",
                label: "Saved",
                color: AvatarGColors.crimsonBase
            )
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .opacity(itemsOpacity)
        .offset(y: itemsOffset)
        .animation(.easeOut(duration: 0.6).delay(0.2), value: itemsOpacity)
    }

    // MARK: - Recent Activity

    private var recentActivitySection: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            HStack {
                Text("ბოლო შექმნილი")
                    .font(AvatarGFonts.bodyMedium)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.textPrimary)
                Spacer()
                Button("ყველა") {
                    appState.navigateToGallery()
                }
                .font(AvatarGFonts.bodySmall)
                .foregroundColor(AvatarGColors.cyanBase)
            }
            .padding(.horizontal, AvatarGSpacing.md)

            VStack(spacing: AvatarGSpacing.sm) {
                ForEach(Array(recentItems.enumerated()), id: \.element.id) { index, item in
                    RecentItemRow(item: item)
                        .opacity(itemsOpacity)
                        .offset(y: itemsOffset)
                        .animation(
                            .easeOut(duration: 0.5).delay(0.25 + Double(index) * 0.06),
                            value: itemsOpacity
                        )
                }
            }
            .padding(.horizontal, AvatarGSpacing.md)
        }
    }

    // MARK: - Mock Data

    static func mockRecentItems() -> [GeneratedContent] {
        return [
            GeneratedContent(
                serviceType: .music,
                title: "Summer Vibes",
                prompt: "Create a chill summer pop track",
                createdAt: Date().addingTimeInterval(-3600)
            ),
            GeneratedContent(
                serviceType: .image,
                title: "Cyberpunk Portrait",
                prompt: "Georgian warrior in cyberpunk style",
                createdAt: Date().addingTimeInterval(-7200)
            ),
            GeneratedContent(
                serviceType: .video,
                title: "Mountain Timelapse",
                prompt: "Caucasus mountains at sunset",
                createdAt: Date().addingTimeInterval(-10800)
            ),
            GeneratedContent(
                serviceType: .avatar,
                title: "My Avatar",
                prompt: "Professional headshot avatar",
                createdAt: Date().addingTimeInterval(-86400)
            ),
            GeneratedContent(
                serviceType: .music,
                title: "Georgian Folk Mix",
                prompt: "Traditional Georgian polyphony meets electronic",
                createdAt: Date().addingTimeInterval(-172800)
            ),
        ]
    }
}

// MARK: - Quick Prompt Chip

struct QuickPromptChip: View {
    let emoji: String
    let text: String
    let onTap: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Text(emoji)
                    .font(.system(size: 14))
                Text(text)
                    .font(AvatarGFonts.bodySmall)
                    .fontWeight(.medium)
                    .foregroundColor(AvatarGColors.textPrimary)
            }
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.vertical, AvatarGSpacing.sm)
            .background(
                Capsule()
                    .fill(AvatarGColors.spaceCard)
                    .overlay(Capsule().stroke(AvatarGColors.glassBorder, lineWidth: 1))
            )
            .scaleEffect(isPressed ? 0.95 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .pressEvents {
            withAnimation(.avatarGFast) { isPressed = true }
        } onRelease: {
            withAnimation(.avatarGFast) { isPressed = false }
        }
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let icon: String
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(color)

            Text(value)
                .font(AvatarGFonts.displaySmall)
                .foregroundColor(AvatarGColors.textPrimary)

            Text(label)
                .font(AvatarGFonts.bodyXSmall)
                .foregroundColor(AvatarGColors.textTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AvatarGSpacing.md)
        .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
    }
}

// MARK: - Recent Item Row

struct RecentItemRow: View {
    let item: GeneratedContent

    var serviceColor: Color {
        switch item.serviceType {
        case .music: return AvatarGColors.cyanBase
        case .image: return AvatarGColors.violetBase
        case .video: return AvatarGColors.emeraldBase
        case .avatar: return AvatarGColors.crimsonBase
        default: return AvatarGColors.textSecondary
        }
    }

    var body: some View {
        HStack(spacing: AvatarGSpacing.md) {
            // Thumbnail
            ZStack {
                RoundedRectangle(cornerRadius: AvatarGRadius.sm)
                    .fill(serviceColor.opacity(0.15))
                    .frame(width: 50, height: 50)
                    .overlay(
                        RoundedRectangle(cornerRadius: AvatarGRadius.sm)
                            .stroke(serviceColor.opacity(0.3), lineWidth: 1)
                    )

                Image(systemName: item.serviceType.icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(serviceColor)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(AvatarGFonts.bodyMedium)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.textPrimary)
                    .lineLimit(1)

                Text(item.prompt)
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textTertiary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    NeonBadge(text: item.serviceType.displayName, color: badgeColor)

                    Text(item.createdAt.relativeString())
                        .font(AvatarGFonts.bodyXSmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(AvatarGColors.textTertiary)
        }
        .padding(AvatarGSpacing.md)
        .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
    }

    var badgeColor: BadgeColor {
        switch item.serviceType {
        case .music: return .cyan
        case .image: return .violet
        case .video: return .emerald
        case .avatar: return .crimson
        default: return .gray
        }
    }
}

// MARK: - Date Extensions

extension Date {
    func relativeString() -> String {
        let seconds = -timeIntervalSinceNow
        if seconds < 60 { return "ახლა" }
        if seconds < 3600 { return "\(Int(seconds/60)) წ. წინ" }
        if seconds < 86400 { return "\(Int(seconds/3600)) სთ. წინ" }
        return "\(Int(seconds/86400)) დ. წინ"
    }

    func greetingTime() -> String {
        let hour = Calendar.current.component(.hour, from: self)
        switch hour {
        case 5..<12: return "დილა მშვიდობისა ☀️"
        case 12..<17: return "შუადღე მშვიდობისა 🌤"
        case 17..<21: return "საღამო მშვიდობისა 🌅"
        default: return "გამარჯობა 🌙"
        }
    }
}

#Preview {
    HomeView()
        .environmentObject(AppState.shared)
        .preferredColorScheme(.dark)
}
