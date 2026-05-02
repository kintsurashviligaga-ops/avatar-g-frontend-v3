import SwiftUI

// MARK: - Music Studio View

struct MusicStudioView: View {
    @StateObject private var viewModel = MusicStudioViewModel()
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: StudioTab = .generate
    @State private var showStemEditor = false

    enum StudioTab: String, CaseIterable {
        case generate = "Generate"
        case myTracks = "My Tracks"
    }

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Header
                    studioHeader

                    // Tab switcher
                    tabSwitcher

                    // Content
                    Group {
                        switch selectedTab {
                        case .generate:
                            GenerateTabView(viewModel: viewModel)
                        case .myTracks:
                            TrackListView(viewModel: viewModel, showStemEditor: $showStemEditor)
                        }
                    }
                    .animation(.avatarGSmooth, value: selectedTab)
                }
            }
            .navigationBarHidden(true)
        }
        .sheet(isPresented: $showStemEditor) {
            if let track = viewModel.selectedTrack {
                StemEditorView(track: track, viewModel: viewModel)
            }
        }
        .alert("Success", isPresented: .constant(viewModel.successMessage != nil)) {
            Button("OK") { viewModel.successMessage = nil }
        } message: {
            Text(viewModel.successMessage ?? "")
        }
    }

    // MARK: - Studio Header

    private var studioHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Music Studio")
                    .font(AvatarGFonts.displayMedium)
                    .foregroundColor(AvatarGColors.textPrimary)
                Text("AI-powered music creation")
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textTertiary)
            }

            Spacer()

            Image(systemName: "music.note.list")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(AvatarGColors.gradientCyanViolet)
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .padding(.top, AvatarGSpacing.lg)
        .padding(.bottom, AvatarGSpacing.sm)
    }

    // MARK: - Tab Switcher

    private var tabSwitcher: some View {
        HStack(spacing: 0) {
            ForEach(StudioTab.allCases, id: \.self) { tab in
                Button(action: { selectedTab = tab }) {
                    VStack(spacing: 6) {
                        Text(tab.rawValue)
                            .font(AvatarGFonts.bodyMedium)
                            .fontWeight(selectedTab == tab ? .semibold : .regular)
                            .foregroundColor(selectedTab == tab
                                             ? AvatarGColors.cyanBase
                                             : AvatarGColors.textTertiary)

                        Rectangle()
                            .frame(height: 2)
                            .foregroundColor(selectedTab == tab
                                             ? AvatarGColors.cyanBase
                                             : Color.clear)
                            .animation(.avatarGFast, value: selectedTab)
                    }
                }
                .buttonStyle(PlainButtonStyle())
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(AvatarGColors.glassBorder),
            alignment: .bottom
        )
        .padding(.bottom, AvatarGSpacing.sm)
    }
}

// MARK: - Generate Tab

struct GenerateTabView: View {
    @ObservedObject var viewModel: MusicStudioViewModel
    @State private var prompt: String = ""
    @State private var selectedStyle: MusicStyle = .pop
    @State private var duration: Double = 60

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: AvatarGSpacing.lg) {
                // Prompt input
                promptSection

                // Style picker
                stylePickerSection

                // Duration slider
                durationSection

                // Active generation card
                if let generation = viewModel.activeGeneration {
                    ActiveGenerationCard(
                        track: generation,
                        progress: viewModel.generationProgress
                    )
                    .transition(.scale.combined(with: .opacity))
                }

                // Generate button
                if viewModel.activeGeneration == nil {
                    GlowButton(
                        title: "Generate Track",
                        icon: "waveform.path.ecg.rectangle",
                        action: {
                            viewModel.generateTrack(
                                prompt: prompt,
                                style: selectedStyle,
                                duration: Int(duration)
                            )
                        },
                        isLoading: viewModel.isGenerating,
                        isFullWidth: true
                    )
                    .padding(.horizontal, AvatarGSpacing.md)
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(AvatarGFonts.bodySmall)
                        .foregroundColor(AvatarGColors.crimsonBase)
                        .padding(.horizontal, AvatarGSpacing.md)
                }

                Color.clear.frame(height: AvatarGSpacing.xxl)
            }
            .padding(.top, AvatarGSpacing.md)
            .animation(.avatarGSpring, value: viewModel.activeGeneration != nil)
        }
    }

    // MARK: - Prompt Section

    private var promptSection: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            Label("Track Description", systemImage: "text.bubble")
                .font(AvatarGFonts.bodySmall)
                .fontWeight(.semibold)
                .foregroundColor(AvatarGColors.textSecondary)
                .padding(.horizontal, AvatarGSpacing.md)

            ZStack(alignment: .topLeading) {
                if prompt.isEmpty {
                    Text("Describe your track... e.g. \"Upbeat Georgian folk with electronic beats\"")
                        .font(AvatarGFonts.bodyMedium)
                        .foregroundColor(AvatarGColors.textTertiary)
                        .padding(.horizontal, AvatarGSpacing.md)
                        .padding(.vertical, AvatarGSpacing.sm)
                        .allowsHitTesting(false)
                }

                TextEditor(text: $prompt)
                    .font(AvatarGFonts.bodyMedium)
                    .foregroundColor(AvatarGColors.textPrimary)
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
                    .frame(minHeight: 80, maxHeight: 120)
                    .padding(.horizontal, AvatarGSpacing.sm)
            }
            .padding(.vertical, AvatarGSpacing.xs)
            .background(AvatarGColors.spaceCard)
            .clipShape(RoundedRectangle(cornerRadius: AvatarGRadius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: AvatarGRadius.lg)
                    .stroke(AvatarGColors.glassBorder, lineWidth: 1)
            )
            .padding(.horizontal, AvatarGSpacing.md)
        }
    }

    // MARK: - Style Picker

    private var stylePickerSection: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            Label("Style", systemImage: "music.note")
                .font(AvatarGFonts.bodySmall)
                .fontWeight(.semibold)
                .foregroundColor(AvatarGColors.textSecondary)
                .padding(.horizontal, AvatarGSpacing.md)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: AvatarGSpacing.sm) {
                    ForEach(MusicStyle.allCases, id: \.self) { style in
                        StyleChip(
                            style: style,
                            isSelected: selectedStyle == style
                        ) {
                            selectedStyle = style
                        }
                    }
                }
                .padding(.horizontal, AvatarGSpacing.md)
            }
        }
    }

    // MARK: - Duration Section

    private var durationSection: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            HStack {
                Label("Duration", systemImage: "timer")
                    .font(AvatarGFonts.bodySmall)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.textSecondary)
                Spacer()
                Text("\(Int(duration))s")
                    .font(AvatarGFonts.monoSmall)
                    .foregroundColor(AvatarGColors.cyanBase)
            }
            .padding(.horizontal, AvatarGSpacing.md)

            Slider(value: $duration, in: 30...180, step: 15)
                .accentColor(AvatarGColors.cyanBase)
                .padding(.horizontal, AvatarGSpacing.md)

            HStack {
                Text("30s")
                Spacer()
                Text("3 min")
            }
            .font(AvatarGFonts.bodyXSmall)
            .foregroundColor(AvatarGColors.textTertiary)
            .padding(.horizontal, AvatarGSpacing.md)
        }
    }
}

// MARK: - Style Chip

struct StyleChip: View {
    let style: MusicStyle
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Text(style.emoji)
                    .font(.system(size: 14))
                Text(style.displayName)
                    .font(AvatarGFonts.bodySmall)
                    .fontWeight(isSelected ? .semibold : .regular)
                    .foregroundColor(isSelected ? AvatarGColors.spaceVoid : AvatarGColors.textPrimary)
            }
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.vertical, AvatarGSpacing.sm)
            .background(
                Capsule()
                    .fill(isSelected
                          ? AvatarGColors.cyanBase
                          : AvatarGColors.spaceCard)
                    .overlay(
                        Capsule().stroke(
                            isSelected ? Color.clear : AvatarGColors.glassBorder,
                            lineWidth: 1
                        )
                    )
            )
            .shadow(
                color: isSelected ? AvatarGColors.cyanBase.opacity(0.3) : Color.clear,
                radius: 8, x: 0, y: 2
            )
        }
        .buttonStyle(PlainButtonStyle())
        .animation(.avatarGFast, value: isSelected)
    }
}

// MARK: - Active Generation Card

struct ActiveGenerationCard: View {
    let track: MusicTrack
    let progress: Double
    @State private var wavePhase: Double = 0

    var body: some View {
        VStack(spacing: AvatarGSpacing.md) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Generating...")
                        .font(AvatarGFonts.bodyMedium)
                        .fontWeight(.semibold)
                        .foregroundColor(AvatarGColors.textPrimary)
                    Text(track.prompt)
                        .font(AvatarGFonts.bodySmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                        .lineLimit(2)
                }
                Spacer()

                // Animated waveform
                HStack(spacing: 3) {
                    ForEach(0..<6) { i in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(AvatarGColors.cyanBase)
                            .frame(width: 4)
                            .frame(height: CGFloat.random(in: 8...30))
                            .animation(
                                .easeInOut(duration: 0.4 + Double(i) * 0.1)
                                    .repeatForever(autoreverses: true)
                                    .delay(Double(i) * 0.08),
                                value: wavePhase
                            )
                    }
                }
                .frame(height: 32)
            }

            // Progress bar
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Processing")
                        .font(AvatarGFonts.bodyXSmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                    Spacer()
                    Text("\(Int(progress * 100))%")
                        .font(AvatarGFonts.monoSmall)
                        .foregroundColor(AvatarGColors.cyanBase)
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(AvatarGColors.glassBackground)
                            .frame(height: 6)

                        RoundedRectangle(cornerRadius: 4)
                            .fill(
                                LinearGradient(
                                    colors: [AvatarGColors.cyanBase, AvatarGColors.violetBase],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: geo.size.width * progress, height: 6)
                            .shadow(color: AvatarGColors.cyanBase.opacity(0.5), radius: 4, x: 0, y: 0)
                    }
                }
                .frame(height: 6)
            }
        }
        .padding(AvatarGSpacing.md)
        .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
        .neonBorder(color: AvatarGColors.cyanBase.opacity(0.3), cornerRadius: AvatarGRadius.lg)
        .padding(.horizontal, AvatarGSpacing.md)
        .onAppear {
            wavePhase = 1
        }
    }
}

// MARK: - Track List View

struct TrackListView: View {
    @ObservedObject var viewModel: MusicStudioViewModel
    @Binding var showStemEditor: Bool

    var body: some View {
        Group {
            if viewModel.isLoadingTracks {
                VStack {
                    Spacer()
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AvatarGColors.cyanBase))
                    Spacer()
                }
            } else if viewModel.tracks.isEmpty {
                EmptyTracksView()
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: AvatarGSpacing.sm) {
                        ForEach(viewModel.tracks) { track in
                            TrackRow(track: track) {
                                viewModel.selectedTrack = track
                                showStemEditor = true
                            }
                            .padding(.horizontal, AvatarGSpacing.md)
                        }
                        Color.clear.frame(height: AvatarGSpacing.xxl)
                    }
                    .padding(.top, AvatarGSpacing.sm)
                }
                .refreshable {
                    viewModel.loadTracks()
                }
            }
        }
    }
}

// MARK: - Track Row

struct TrackRow: View {
    let track: MusicTrack
    let onTap: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: AvatarGSpacing.md) {
                // Cover
                ZStack {
                    RoundedRectangle(cornerRadius: AvatarGRadius.sm)
                        .fill(AvatarGColors.gradientCyanViolet)
                        .frame(width: 52, height: 52)

                    if let style = track.style {
                        Text(style.emoji)
                            .font(.system(size: 22))
                    } else {
                        Image(systemName: "music.note")
                            .foregroundColor(.white)
                            .font(.system(size: 20, weight: .bold))
                    }
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(track.title)
                        .font(AvatarGFonts.bodyMedium)
                        .fontWeight(.semibold)
                        .foregroundColor(AvatarGColors.textPrimary)
                        .lineLimit(1)

                    Text(track.prompt)
                        .font(AvatarGFonts.bodySmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                        .lineLimit(1)

                    HStack(spacing: AvatarGSpacing.sm) {
                        if let style = track.style {
                            NeonBadge(text: style.displayName, color: .cyan)
                        }
                        Text(formatDuration(track.duration))
                            .font(AvatarGFonts.monoSmall)
                            .foregroundColor(AvatarGColors.textTertiary)

                        Spacer()

                        StatusBadge(status: track.status)
                    }
                }

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(AvatarGColors.textTertiary)
            }
            .padding(AvatarGSpacing.md)
            .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
            .scaleEffect(isPressed ? 0.98 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .pressEvents {
            withAnimation(.avatarGFast) { isPressed = true }
        } onRelease: {
            withAnimation(.avatarGFast) { isPressed = false }
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let status: MusicTrack.TrackStatus

    var body: some View {
        switch status {
        case .ready:
            NeonBadge(text: "Ready", color: .emerald)
        case .generating:
            NeonBadge(text: "Generating", color: .cyan)
        case .failed:
            NeonBadge(text: "Failed", color: .crimson)
        }
    }
}

// MARK: - Empty Tracks View

struct EmptyTracksView: View {
    var body: some View {
        VStack(spacing: AvatarGSpacing.lg) {
            Spacer()

            Image(systemName: "music.note.list")
                .font(.system(size: 56, weight: .thin))
                .foregroundColor(AvatarGColors.textTertiary)

            VStack(spacing: AvatarGSpacing.sm) {
                Text("No tracks yet")
                    .font(AvatarGFonts.displaySmall)
                    .foregroundColor(AvatarGColors.textPrimary)

                Text("Generate your first track using the Generate tab")
                    .font(AvatarGFonts.bodyMedium)
                    .foregroundColor(AvatarGColors.textTertiary)
                    .multilineTextAlignment(.center)
            }

            Spacer()
        }
        .padding(AvatarGSpacing.xl)
    }
}

#Preview {
    MusicStudioView()
        .environmentObject(AppState.shared)
        .preferredColorScheme(.dark)
}
