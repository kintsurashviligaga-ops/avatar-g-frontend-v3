import SwiftUI

// MARK: - Stem Editor View

struct StemEditorView: View {
    @State var track: MusicTrack
    @ObservedObject var viewModel: MusicStudioViewModel
    @Environment(\.dismiss) var dismiss

    @State private var isPlaying: Bool = false
    @State private var playbackTime: Double = 0
    @State private var playbackTimer: Timer?
    @State private var showMasteringPanel: Bool = false
    @State private var showExportSheet: Bool = false
    @State private var showRegenerateSheet: Bool = false
    @State private var selectedStemForRegenerate: Stem?
    @State private var regeneratePrompt: String = ""
    @State private var masteringSettings = MasteringSettings.default
    @State private var isExporting: Bool = false
    @State private var exportedURL: URL?

    var body: some View {
        ZStack {
            AvatarGColors.spaceVoid.ignoresSafeArea()

            VStack(spacing: 0) {
                // Navigation header
                navigationHeader

                ScrollView(showsIndicators: false) {
                    VStack(spacing: AvatarGSpacing.md) {
                        // Transport controls
                        transportControls

                        // Stem tracks
                        stemTracksSection

                        // Mastering panel
                        masteringPanelSection

                        Color.clear.frame(height: AvatarGSpacing.xxl)
                    }
                    .padding(.top, AvatarGSpacing.md)
                }

                // Bottom action bar
                bottomActionBar
            }
        }
        .onChange(of: viewModel.selectedTrack) { _, newTrack in
            if let t = newTrack { track = t }
        }
        .sheet(isPresented: $showExportSheet) {
            ExportSheet(
                track: track,
                masteringSettings: $masteringSettings,
                isExporting: $isExporting,
                exportedURL: $exportedURL,
                onExport: { format in
                    Task {
                        isExporting = true
                        do {
                            let url = try await viewModel.masterAndExport(format: format)
                            exportedURL = url
                        } catch {
                            // Demo: create a placeholder URL
                            exportedURL = URL(string: "https://myavatar.ge/exports/demo.mp3")
                        }
                        isExporting = false
                    }
                }
            )
        }
        .sheet(isPresented: $showRegenerateSheet) {
            RegenerateStemSheet(
                stem: selectedStemForRegenerate,
                prompt: $regeneratePrompt
            ) {
                if let stem = selectedStemForRegenerate {
                    viewModel.regenerateStem(stemId: stem.id, prompt: regeneratePrompt)
                }
                showRegenerateSheet = false
                regeneratePrompt = ""
            }
        }
    }

    // MARK: - Navigation Header

    private var navigationHeader: some View {
        HStack {
            Button(action: { dismiss() }) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(AvatarGColors.textSecondary)
            }
            .buttonStyle(PlainButtonStyle())

            Spacer()

            VStack(alignment: .center, spacing: 2) {
                Text(track.title)
                    .font(AvatarGFonts.displaySmall)
                    .foregroundColor(AvatarGColors.textPrimary)
                    .lineLimit(1)

                if let style = track.style {
                    Text(style.displayName)
                        .font(AvatarGFonts.bodyXSmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                }
            }

            Spacer()

            Button(action: { showExportSheet = true }) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(AvatarGColors.cyanBase)
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .padding(.vertical, AvatarGSpacing.sm)
        .background(
            AvatarGColors.spaceDeep
                .overlay(Rectangle().frame(height: 1).foregroundColor(AvatarGColors.glassBorder), alignment: .bottom)
        )
    }

    // MARK: - Transport Controls

    private var transportControls: some View {
        GlassCard {
            VStack(spacing: AvatarGSpacing.md) {
                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(AvatarGColors.glassBackground)
                            .frame(height: 6)

                        RoundedRectangle(cornerRadius: 4)
                            .fill(AvatarGColors.gradientCyanViolet)
                            .frame(
                                width: geo.size.width * (track.duration > 0 ? playbackTime / track.duration : 0),
                                height: 6
                            )
                    }
                }
                .frame(height: 6)

                HStack {
                    Text(formatTime(playbackTime))
                        .font(AvatarGFonts.monoSmall)
                        .foregroundColor(AvatarGColors.textSecondary)
                    Spacer()
                    Text(formatTime(track.duration))
                        .font(AvatarGFonts.monoSmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                }

                // Playback controls
                HStack(spacing: AvatarGSpacing.xl) {
                    // Rewind 10s
                    Button(action: { playbackTime = max(0, playbackTime - 10) }) {
                        Image(systemName: "gobackward.10")
                            .font(.system(size: 22, weight: .medium))
                            .foregroundColor(AvatarGColors.textSecondary)
                    }
                    .buttonStyle(PlainButtonStyle())

                    // Play/Pause
                    Button(action: togglePlayback) {
                        ZStack {
                            Circle()
                                .fill(AvatarGColors.gradientCyanViolet)
                                .frame(width: 56, height: 56)
                                .shadow(color: AvatarGColors.cyanBase.opacity(0.4), radius: 12, x: 0, y: 0)

                            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(.white)
                                .offset(x: isPlaying ? 0 : 2)
                        }
                    }
                    .buttonStyle(PlainButtonStyle())

                    // Forward 10s
                    Button(action: { playbackTime = min(track.duration, playbackTime + 10) }) {
                        Image(systemName: "goforward.10")
                            .font(.system(size: 22, weight: .medium))
                            .foregroundColor(AvatarGColors.textSecondary)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, AvatarGSpacing.md)
    }

    // MARK: - Stem Tracks

    private var stemTracksSection: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            HStack {
                Text("Stems (\(track.stems.count))")
                    .font(AvatarGFonts.bodyMedium)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.textPrimary)
                Spacer()
                Text("Tap to edit")
                    .font(AvatarGFonts.bodyXSmall)
                    .foregroundColor(AvatarGColors.textTertiary)
            }
            .padding(.horizontal, AvatarGSpacing.md)

            if track.stems.isEmpty {
                GlassCard {
                    HStack {
                        Image(systemName: "info.circle")
                            .foregroundColor(AvatarGColors.cyanBase)
                        Text("Stems will appear after track is ready")
                            .font(AvatarGFonts.bodySmall)
                            .foregroundColor(AvatarGColors.textSecondary)
                    }
                }
                .padding(.horizontal, AvatarGSpacing.md)
            } else {
                ForEach(track.stems) { stem in
                    StemRowView(
                        stem: stem,
                        onVolumeChange: { vol in
                            viewModel.updateStemVolume(stemId: stem.id, volume: vol)
                        },
                        onMute: {
                            viewModel.toggleStemMute(stemId: stem.id)
                        },
                        onSolo: {
                            viewModel.toggleStemSolo(stemId: stem.id)
                        },
                        onRegenerate: {
                            selectedStemForRegenerate = stem
                            showRegenerateSheet = true
                        }
                    )
                    .padding(.horizontal, AvatarGSpacing.md)
                }
            }
        }
    }

    // MARK: - Mastering Panel

    private var masteringPanelSection: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            Button(action: {
                withAnimation(.avatarGSpring) {
                    showMasteringPanel.toggle()
                }
            }) {
                HStack {
                    Label("Mastering", systemImage: "slider.horizontal.3")
                        .font(AvatarGFonts.bodyMedium)
                        .fontWeight(.semibold)
                        .foregroundColor(AvatarGColors.textPrimary)
                    Spacer()
                    Image(systemName: showMasteringPanel ? "chevron.up" : "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(AvatarGColors.textTertiary)
                }
                .padding(AvatarGSpacing.md)
                .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.horizontal, AvatarGSpacing.md)

            if showMasteringPanel {
                MasteringPanelView(settings: $masteringSettings)
                    .padding(.horizontal, AvatarGSpacing.md)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    // MARK: - Bottom Action Bar

    private var bottomActionBar: some View {
        HStack(spacing: AvatarGSpacing.md) {
            // Master button
            GlowButton(
                title: "Master",
                icon: "dial.max.fill",
                action: {
                    showMasteringPanel = true
                },
                style: .glass
            )

            // Export button
            GlowButton(
                title: "Export",
                icon: "square.and.arrow.up",
                action: { showExportSheet = true },
                style: .cyanViolet,
                isFullWidth: true
            )
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .padding(.vertical, AvatarGSpacing.sm)
        .background(
            AvatarGColors.spaceDeep
                .overlay(Rectangle().frame(height: 1).foregroundColor(AvatarGColors.glassBorder), alignment: .top)
        )
    }

    // MARK: - Helpers

    private func togglePlayback() {
        isPlaying.toggle()
        if isPlaying {
            playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                Task { @MainActor in
                    if self.playbackTime >= self.track.duration {
                        self.playbackTime = 0
                        self.isPlaying = false
                        self.playbackTimer?.invalidate()
                    } else {
                        self.playbackTime += 0.1
                    }
                }
            }
        } else {
            playbackTimer?.invalidate()
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Stem Row View

struct StemRowView: View {
    @State var stem: Stem
    var onVolumeChange: (Float) -> Void
    var onMute: () -> Void
    var onSolo: () -> Void
    var onRegenerate: () -> Void

    @State private var volume: Double

    init(stem: Stem,
         onVolumeChange: @escaping (Float) -> Void,
         onMute: @escaping () -> Void,
         onSolo: @escaping () -> Void,
         onRegenerate: @escaping () -> Void) {
        self.stem = stem
        self._volume = State(initialValue: Double(stem.volume))
        self.onVolumeChange = onVolumeChange
        self.onMute = onMute
        self.onSolo = onSolo
        self.onRegenerate = onRegenerate
    }

    var body: some View {
        VStack(spacing: AvatarGSpacing.sm) {
            // Top row: stem info + controls
            HStack(spacing: AvatarGSpacing.sm) {
                // Icon & Name
                HStack(spacing: 8) {
                    Text(stem.type.icon)
                        .font(.system(size: 18))
                    Text(stem.name)
                        .font(AvatarGFonts.bodySmall)
                        .fontWeight(.semibold)
                        .foregroundColor(stem.isMuted ? AvatarGColors.textTertiary : AvatarGColors.textPrimary)
                }
                .frame(maxWidth: 100, alignment: .leading)

                Spacer()

                // Mute button
                Button(action: {
                    onMute()
                    stem.isMuted.toggle()
                }) {
                    Text("M")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(stem.isMuted ? AvatarGColors.spaceVoid : AvatarGColors.textSecondary)
                        .frame(width: 26, height: 26)
                        .background(
                            Circle()
                                .fill(stem.isMuted ? AvatarGColors.crimsonBase : AvatarGColors.glassBackground)
                                .overlay(
                                    Circle().stroke(
                                        stem.isMuted ? AvatarGColors.crimsonBase : AvatarGColors.glassBorder,
                                        lineWidth: 1
                                    )
                                )
                        )
                }
                .buttonStyle(PlainButtonStyle())

                // Solo button
                Button(action: {
                    onSolo()
                    stem.isSolo.toggle()
                }) {
                    Text("S")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(stem.isSolo ? AvatarGColors.spaceVoid : AvatarGColors.textSecondary)
                        .frame(width: 26, height: 26)
                        .background(
                            Circle()
                                .fill(stem.isSolo ? AvatarGColors.emeraldBase : AvatarGColors.glassBackground)
                                .overlay(
                                    Circle().stroke(
                                        stem.isSolo ? AvatarGColors.emeraldBase : AvatarGColors.glassBorder,
                                        lineWidth: 1
                                    )
                                )
                        )
                }
                .buttonStyle(PlainButtonStyle())

                // Regenerate button
                Button(action: onRegenerate) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(AvatarGColors.violetBase)
                        .frame(width: 26, height: 26)
                        .background(
                            Circle()
                                .fill(AvatarGColors.violetBase.opacity(0.15))
                                .overlay(Circle().stroke(AvatarGColors.violetBase.opacity(0.3), lineWidth: 1))
                        )
                }
                .buttonStyle(PlainButtonStyle())
            }

            // Volume slider row
            HStack(spacing: AvatarGSpacing.sm) {
                Image(systemName: "speaker.fill")
                    .font(.system(size: 10))
                    .foregroundColor(AvatarGColors.textTertiary)
                    .frame(width: 14)

                Slider(value: $volume, in: 0...1) { _ in
                    onVolumeChange(Float(volume))
                }
                .accentColor(AvatarGColors.cyanBase)

                Text(String(format: "%.0f%%", volume * 100))
                    .font(AvatarGFonts.monoSmall)
                    .foregroundColor(AvatarGColors.textTertiary)
                    .frame(width: 34, alignment: .trailing)
            }

            // Waveform visualization
            StemWaveform(isMuted: stem.isMuted)
                .frame(height: 24)
        }
        .padding(AvatarGSpacing.md)
        .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
        .opacity(stem.isMuted ? 0.5 : 1.0)
        .animation(.avatarGFast, value: stem.isMuted)
    }
}

// MARK: - Stem Waveform

struct StemWaveform: View {
    var isMuted: Bool

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 2) {
                ForEach(0..<Int(geo.size.width / 6), id: \.self) { i in
                    let height = waveformHeight(index: i, total: Int(geo.size.width / 6))
                    RoundedRectangle(cornerRadius: 1)
                        .fill(isMuted ? AvatarGColors.textTertiary : AvatarGColors.cyanBase.opacity(0.6))
                        .frame(width: 3, height: height)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }

    private func waveformHeight(index: Int, total: Int) -> CGFloat {
        let normalized = Double(index) / Double(total)
        let wave1 = sin(normalized * .pi * 8) * 8
        let wave2 = cos(normalized * .pi * 3) * 4
        let combined = wave1 + wave2
        return max(3, CGFloat(combined + 12))
    }
}

// MARK: - Mastering Panel

struct MasteringPanelView: View {
    @Binding var settings: MasteringSettings

    var body: some View {
        GlassCard {
            VStack(spacing: AvatarGSpacing.md) {
                Text("Mastering Settings")
                    .font(AvatarGFonts.bodyMedium)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.textPrimary)

                // Loudness
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Target Loudness")
                            .font(AvatarGFonts.bodySmall)
                            .foregroundColor(AvatarGColors.textSecondary)
                        Spacer()
                        Text(String(format: "%.0f LUFS", settings.loudness))
                            .font(AvatarGFonts.monoSmall)
                            .foregroundColor(AvatarGColors.cyanBase)
                    }
                    Slider(value: $settings.loudness, in: -14...(-6), step: 1)
                        .accentColor(AvatarGColors.cyanBase)
                }

                // Stereo Width
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Stereo Width")
                            .font(AvatarGFonts.bodySmall)
                            .foregroundColor(AvatarGColors.textSecondary)
                        Spacer()
                        Text(String(format: "%.0f%%", settings.stereoWidth * 100))
                            .font(AvatarGFonts.monoSmall)
                            .foregroundColor(AvatarGColors.violetBase)
                    }
                    Slider(value: $settings.stereoWidth, in: 0...1)
                        .accentColor(AvatarGColors.violetBase)
                }

                // Compression
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Compression")
                            .font(AvatarGFonts.bodySmall)
                            .foregroundColor(AvatarGColors.textSecondary)
                        Spacer()
                        Text(String(format: "%.0f%%", settings.compressionLevel * 100))
                            .font(AvatarGFonts.monoSmall)
                            .foregroundColor(AvatarGColors.emeraldBase)
                    }
                    Slider(value: $settings.compressionLevel, in: 0...1)
                        .accentColor(AvatarGColors.emeraldBase)
                }
            }
        }
    }
}

// MARK: - Export Sheet

struct ExportSheet: View {
    let track: MusicTrack
    @Binding var masteringSettings: MasteringSettings
    @Binding var isExporting: Bool
    @Binding var exportedURL: URL?
    let onExport: (ExportFormat) -> Void

    @Environment(\.dismiss) var dismiss
    @State private var selectedFormat: ExportFormat = .mp3

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                VStack(spacing: AvatarGSpacing.lg) {
                    Text("Export \"\(track.title)\"")
                        .font(AvatarGFonts.displaySmall)
                        .foregroundColor(AvatarGColors.textPrimary)
                        .padding(.top, AvatarGSpacing.lg)

                    // Format picker
                    VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
                        Text("Format")
                            .font(AvatarGFonts.bodySmall)
                            .fontWeight(.semibold)
                            .foregroundColor(AvatarGColors.textSecondary)

                        ForEach(ExportFormat.allCases, id: \.self) { format in
                            Button(action: { selectedFormat = format }) {
                                HStack {
                                    Image(systemName: selectedFormat == format ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(selectedFormat == format
                                                         ? AvatarGColors.cyanBase
                                                         : AvatarGColors.textTertiary)
                                    Text(format.displayName)
                                        .font(AvatarGFonts.bodyMedium)
                                        .foregroundColor(AvatarGColors.textPrimary)
                                    Spacer()
                                }
                                .padding(AvatarGSpacing.md)
                                .glassCard(cornerRadius: AvatarGRadius.md, padding: 0)
                            }
                            .buttonStyle(PlainButtonStyle())
                        }
                    }
                    .padding(.horizontal, AvatarGSpacing.md)

                    Spacer()

                    // Export button
                    if let url = exportedURL {
                        VStack(spacing: AvatarGSpacing.sm) {
                            Text("Export complete!")
                                .font(AvatarGFonts.bodySmall)
                                .foregroundColor(AvatarGColors.emeraldBase)

                            ShareLink(item: url) {
                                HStack {
                                    Image(systemName: "square.and.arrow.up")
                                    Text("Share File")
                                }
                                .font(AvatarGFonts.bodyMedium)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, AvatarGSpacing.md)
                                .background(Capsule().fill(AvatarGColors.gradientCyanViolet))
                            }
                        }
                        .padding(.horizontal, AvatarGSpacing.md)
                    } else {
                        GlowButton(
                            title: isExporting ? "Exporting..." : "Export",
                            icon: isExporting ? nil : "square.and.arrow.up",
                            action: { onExport(selectedFormat) },
                            isLoading: isExporting,
                            isFullWidth: true
                        )
                        .padding(.horizontal, AvatarGSpacing.md)
                    }

                    Color.clear.frame(height: AvatarGSpacing.lg)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(AvatarGColors.textSecondary)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .preferredColorScheme(.dark)
    }
}

// MARK: - Regenerate Stem Sheet

struct RegenerateStemSheet: View {
    let stem: Stem?
    @Binding var prompt: String
    let onRegenerate: () -> Void

    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                VStack(spacing: AvatarGSpacing.lg) {
                    if let stem = stem {
                        Text("Regenerate \(stem.type.icon) \(stem.name)")
                            .font(AvatarGFonts.displaySmall)
                            .foregroundColor(AvatarGColors.textPrimary)
                            .padding(.top, AvatarGSpacing.lg)
                    }

                    VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
                        Text("Describe changes")
                            .font(AvatarGFonts.bodySmall)
                            .fontWeight(.semibold)
                            .foregroundColor(AvatarGColors.textSecondary)

                        AvatarGTextField(
                            placeholder: "e.g. More reverb, faster rhythm...",
                            text: $prompt
                        )
                    }
                    .padding(.horizontal, AvatarGSpacing.md)

                    Spacer()

                    GlowButton(
                        title: "Regenerate Stem",
                        icon: "arrow.clockwise",
                        action: onRegenerate,
                        isFullWidth: true
                    )
                    .padding(.horizontal, AvatarGSpacing.md)
                    .padding(.bottom, AvatarGSpacing.lg)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(AvatarGColors.textSecondary)
                }
            }
        }
        .presentationDetents([.medium])
        .preferredColorScheme(.dark)
    }
}

#Preview {
    StemEditorView(
        track: MusicStudioViewModel.mockTracks()[0],
        viewModel: MusicStudioViewModel()
    )
    .preferredColorScheme(.dark)
}
