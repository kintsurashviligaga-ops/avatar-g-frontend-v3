import SwiftUI
import AVFoundation

// MARK: - GlowButton

struct GlowButton: View {
    let title: String
    var icon: String?
    let action: () -> Void
    var isLoading: Bool = false
    var style: GlowButtonStyle = .cyanViolet
    var isFullWidth: Bool = false

    @State private var isPressed = false

    enum GlowButtonStyle {
        case cyanViolet
        case cyan
        case violet
        case emerald
        case crimson
        case glass

        var gradient: LinearGradient {
            switch self {
            case .cyanViolet:
                return LinearGradient(
                    colors: [AvatarGColors.cyanBase, AvatarGColors.violetBase],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            case .cyan:
                return LinearGradient(
                    colors: [AvatarGColors.cyanBase, AvatarGColors.cyanDark],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            case .violet:
                return LinearGradient(
                    colors: [AvatarGColors.violetBase, AvatarGColors.violetDark],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            case .emerald:
                return LinearGradient(
                    colors: [AvatarGColors.emeraldBase, AvatarGColors.emeraldDark],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            case .crimson:
                return LinearGradient(
                    colors: [AvatarGColors.crimsonBase, AvatarGColors.crimsonDark],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            case .glass:
                return LinearGradient(
                    colors: [AvatarGColors.glassBackground, AvatarGColors.glassBackground],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            }
        }

        var glowColor: Color {
            switch self {
            case .cyanViolet, .cyan: return AvatarGColors.cyanBase
            case .violet: return AvatarGColors.violetBase
            case .emerald: return AvatarGColors.emeraldBase
            case .crimson: return AvatarGColors.crimsonBase
            case .glass: return .clear
            }
        }
    }

    var body: some View {
        Button(action: {
            guard !isLoading else { return }
            action()
        }) {
            HStack(spacing: AvatarGSpacing.sm) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.8)
                } else {
                    if let icon = icon {
                        Image(systemName: icon)
                            .font(.system(size: 16, weight: .semibold))
                    }
                    Text(title)
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                }
            }
            .foregroundColor(.white)
            .padding(.horizontal, AvatarGSpacing.lg)
            .padding(.vertical, AvatarGSpacing.md)
            .frame(maxWidth: isFullWidth ? .infinity : nil)
            .background(style.gradient)
            .clipShape(Capsule())
            .shadow(color: style.glowColor.opacity(0.5), radius: 12, x: 0, y: 4)
            .shadow(color: style.glowColor.opacity(0.3), radius: 20, x: 0, y: 0)
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

// MARK: - Press Events Extension

extension View {
    func pressEvents(onPress: @escaping () -> Void, onRelease: @escaping () -> Void) -> some View {
        self.simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in onPress() }
                .onEnded { _ in onRelease() }
        )
    }
}

// MARK: - GlassCard

struct GlassCard<Content: View>: View {
    var cornerRadius: CGFloat = AvatarGRadius.lg
    var padding: CGFloat = AvatarGSpacing.md
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(AvatarGColors.spaceCard.opacity(0.8))
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .stroke(AvatarGColors.glassBorder, lineWidth: 1)
                    )
            )
    }
}

// MARK: - WaveformView

struct WaveformView: View {
    var amplitude: Float
    var isActive: Bool
    var color: Color = AvatarGColors.cyanBase
    var barCount: Int = 5

    @State private var animationPhase: Double = 0

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<barCount, id: \.self) { index in
                WaveformBar(
                    amplitude: amplitude,
                    index: index,
                    isActive: isActive,
                    color: color,
                    animationPhase: animationPhase
                )
            }
        }
        .onChange(of: isActive) { _, active in
            if active {
                withAnimation(.linear(duration: 0.05).repeatForever(autoreverses: false)) {
                    animationPhase += 1
                }
            } else {
                animationPhase = 0
            }
        }
    }
}

struct WaveformBar: View {
    var amplitude: Float
    var index: Int
    var isActive: Bool
    var color: Color
    var animationPhase: Double

    @State private var height: CGFloat = 4

    var targetHeight: CGFloat {
        if !isActive { return 4 }
        let base: CGFloat = 8
        let factor = CGFloat(amplitude) * 40
        let variation = sin(animationPhase * 0.3 + Double(index) * 0.7) * 10
        return max(4, base + factor + CGFloat(variation))
    }

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(color)
            .frame(width: 4, height: isActive ? targetHeight : 4)
            .animation(.spring(response: 0.15, dampingFraction: 0.6), value: isActive)
            .animation(.spring(response: 0.15, dampingFraction: 0.6), value: amplitude)
    }
}

// MARK: - OrbView

struct OrbView: View {
    var state: OrbState
    var size: CGFloat = 100

    @State private var pulseScale: CGFloat = 1.0
    @State private var outerPulseScale: CGFloat = 1.0
    @State private var glowOpacity: Double = 0.5

    enum OrbState {
        case idle
        case listening
        case speaking
    }

    var gradientColors: [Color] {
        switch state {
        case .idle:
            return [AvatarGColors.cyanBase.opacity(0.6), AvatarGColors.violetBase.opacity(0.6)]
        case .listening:
            return [AvatarGColors.cyanBase, AvatarGColors.cyanLight]
        case .speaking:
            return [AvatarGColors.violetBase, AvatarGColors.violetLight]
        }
    }

    var glowColor: Color {
        switch state {
        case .idle: return AvatarGColors.cyanBase
        case .listening: return AvatarGColors.cyanBase
        case .speaking: return AvatarGColors.violetBase
        }
    }

    var pulseRange: ClosedRange<CGFloat> {
        switch state {
        case .idle: return 0.95...1.05
        case .listening: return 0.9...1.15
        case .speaking: return 0.92...1.12
        }
    }

    var body: some View {
        ZStack {
            // Outer glow rings
            ForEach(0..<3) { ring in
                Circle()
                    .stroke(glowColor.opacity(0.1 - Double(ring) * 0.03), lineWidth: 1)
                    .frame(width: size + CGFloat(ring + 1) * 30,
                           height: size + CGFloat(ring + 1) * 30)
                    .scaleEffect(outerPulseScale)
            }

            // Main orb
            Circle()
                .fill(
                    RadialGradient(
                        colors: gradientColors + [gradientColors.last!.opacity(0)],
                        center: .topLeading,
                        startRadius: size * 0.1,
                        endRadius: size * 0.8
                    )
                )
                .frame(width: size, height: size)
                .overlay(
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color.white.opacity(0.3), Color.clear],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
                .shadow(color: glowColor.opacity(0.8), radius: 20, x: 0, y: 0)
                .shadow(color: glowColor.opacity(0.4), radius: 40, x: 0, y: 0)
                .scaleEffect(pulseScale)
        }
        .onAppear {
            startAnimations()
        }
        .onChange(of: state) { _, _ in
            startAnimations()
        }
    }

    private func startAnimations() {
        let duration: Double
        switch state {
        case .idle: duration = 2.0
        case .listening: duration = 0.8
        case .speaking: duration = 0.6
        }

        withAnimation(.easeInOut(duration: duration).repeatForever(autoreverses: true)) {
            pulseScale = pulseRange.upperBound
            glowOpacity = 0.9
        }
        withAnimation(.easeInOut(duration: duration * 1.5).repeatForever(autoreverses: true)) {
            outerPulseScale = 1.08
        }
    }
}

// MARK: - MiniTrackPlayer

struct MiniTrackPlayer: View {
    let track: MusicTrack
    @State private var isPlaying = false
    @State private var progress: Double = 0
    @State private var timer: Timer?

    var body: some View {
        HStack(spacing: AvatarGSpacing.sm) {
            // Cover / Icon
            ZStack {
                RoundedRectangle(cornerRadius: AvatarGRadius.sm)
                    .fill(AvatarGColors.gradientCyanViolet)
                    .frame(width: 44, height: 44)

                Image(systemName: "music.note")
                    .foregroundColor(.white)
                    .font(.system(size: 18, weight: .bold))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(track.title)
                    .font(AvatarGFonts.bodySmall)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.textPrimary)
                    .lineLimit(1)

                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(AvatarGColors.glassBorder)
                            .frame(height: 3)

                        RoundedRectangle(cornerRadius: 2)
                            .fill(AvatarGColors.cyanBase)
                            .frame(width: geo.size.width * progress, height: 3)
                    }
                }
                .frame(height: 3)

                Text(formatDuration(track.duration))
                    .font(AvatarGFonts.monoSmall)
                    .foregroundColor(AvatarGColors.textTertiary)
            }

            Spacer()

            // Play/Pause
            Button(action: togglePlayback) {
                ZStack {
                    Circle()
                        .fill(AvatarGColors.cyanBase)
                        .frame(width: 36, height: 36)

                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .foregroundColor(.white)
                        .font(.system(size: 14, weight: .bold))
                        .offset(x: isPlaying ? 0 : 1)
                }
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(AvatarGSpacing.sm)
        .glassCard(cornerRadius: AvatarGRadius.md)
        .frame(maxWidth: 280)
    }

    private func togglePlayback() {
        isPlaying.toggle()
        if isPlaying {
            // Simulate playback progress
            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                if progress >= 1.0 {
                    progress = 0
                    isPlaying = false
                    timer?.invalidate()
                } else {
                    progress += 0.001
                }
            }
        } else {
            timer?.invalidate()
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - AvatarBubble

struct AvatarBubble: View {
    let message: ChatMessage

    var isUser: Bool { message.role == .user }

    var body: some View {
        HStack(alignment: .bottom, spacing: AvatarGSpacing.sm) {
            if isUser { Spacer(minLength: 60) }

            if !isUser {
                // Agent avatar indicator
                ZStack {
                    Circle()
                        .fill(AvatarGColors.gradientCyanViolet)
                        .frame(width: 28, height: 28)
                    Text("G")
                        .font(.system(size: 12, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                }
            }

            VStack(alignment: isUser ? .trailing : .leading, spacing: AvatarGSpacing.xs) {
                if !message.content.isEmpty {
                    bubbleText
                }

                ForEach(message.attachments) { attachment in
                    attachmentView(attachment)
                }

                Text(formatTime(message.timestamp))
                    .font(AvatarGFonts.bodyXSmall)
                    .foregroundColor(AvatarGColors.textTertiary)
                    .padding(.horizontal, 4)
            }

            if !isUser { Spacer(minLength: 60) }

            if isUser {
                // User avatar indicator
                ZStack {
                    Circle()
                        .fill(AvatarGColors.glassBackground)
                        .frame(width: 28, height: 28)
                        .overlay(Circle().stroke(AvatarGColors.glassBorder, lineWidth: 1))
                    Image(systemName: "person.fill")
                        .font(.system(size: 12))
                        .foregroundColor(AvatarGColors.textSecondary)
                }
            }
        }
        .padding(.horizontal, AvatarGSpacing.md)
    }

    @ViewBuilder
    private var bubbleText: some View {
        HStack {
            if message.isStreaming {
                HStack(spacing: 4) {
                    Text(message.content)
                        .font(AvatarGFonts.bodyMedium)
                        .foregroundColor(isUser ? .white : AvatarGColors.textPrimary)

                    TypingIndicator()
                }
            } else {
                Text(message.content)
                    .font(AvatarGFonts.bodyMedium)
                    .foregroundColor(isUser ? .white : AvatarGColors.textPrimary)
            }
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .padding(.vertical, AvatarGSpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: AvatarGRadius.lg)
                .fill(isUser
                      ? AvatarGColors.gradientCyanViolet
                      : AvatarGColors.glassBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: AvatarGRadius.lg)
                        .stroke(AvatarGColors.glassBorder, lineWidth: isUser ? 0 : 1)
                )
        )
        .if(isUser) { view in
            view.shadow(color: AvatarGColors.cyanBase.opacity(0.3), radius: 8, x: 0, y: 4)
        }
    }

    @ViewBuilder
    private func attachmentView(_ attachment: MessageAttachment) -> some View {
        switch attachment.type {
        case .image:
            if let url = attachment.url {
                AsyncImage(url: url) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    ZStack {
                        RoundedRectangle(cornerRadius: AvatarGRadius.md)
                            .fill(AvatarGColors.spaceMid)
                        ProgressView()
                    }
                }
                .frame(width: 200, height: 150)
                .clipShape(RoundedRectangle(cornerRadius: AvatarGRadius.md))
            }

        case .audio:
            HStack(spacing: AvatarGSpacing.sm) {
                Image(systemName: "waveform")
                    .foregroundColor(AvatarGColors.cyanBase)
                Text("Voice message")
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textSecondary)
            }
            .padding(AvatarGSpacing.sm)
            .glassCard(cornerRadius: AvatarGRadius.md)

        case .musicTrack:
            if let track = attachment.musicTrack {
                MiniTrackPlayer(track: track)
            }

        case .video:
            HStack(spacing: AvatarGSpacing.sm) {
                Image(systemName: "video.fill")
                    .foregroundColor(AvatarGColors.violetBase)
                Text("Video generated")
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textSecondary)
            }
            .padding(AvatarGSpacing.sm)
            .glassCard(cornerRadius: AvatarGRadius.md)
        }
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - Conditional View Modifier

extension View {
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

// MARK: - TypingIndicator

struct TypingIndicator: View {
    @State private var dotOffset: [CGFloat] = [0, 0, 0]

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(AvatarGColors.cyanBase)
                    .frame(width: 5, height: 5)
                    .offset(y: dotOffset[index])
                    .onAppear {
                        let delay = Double(index) * 0.15
                        withAnimation(
                            Animation.easeInOut(duration: 0.5)
                                .repeatForever()
                                .delay(delay)
                        ) {
                            dotOffset[index] = -4
                        }
                    }
            }
        }
    }
}

// MARK: - NeonBadge

enum BadgeColor {
    case cyan, violet, emerald, crimson, gray

    var color: Color {
        switch self {
        case .cyan: return AvatarGColors.cyanBase
        case .violet: return AvatarGColors.violetBase
        case .emerald: return AvatarGColors.emeraldBase
        case .crimson: return AvatarGColors.crimsonBase
        case .gray: return AvatarGColors.textTertiary
        }
    }
}

struct NeonBadge: View {
    let text: String
    var color: BadgeColor = .cyan

    var body: some View {
        Text(text)
            .font(AvatarGFonts.bodyXSmall)
            .fontWeight(.bold)
            .foregroundColor(color.color)
            .padding(.horizontal, AvatarGSpacing.sm)
            .padding(.vertical, 3)
            .background(
                Capsule()
                    .fill(color.color.opacity(0.15))
                    .overlay(
                        Capsule()
                            .stroke(color.color.opacity(0.4), lineWidth: 1)
                    )
            )
    }
}

// MARK: - QuickActionChip

struct QuickActionChip: View {
    let action: QuickAction
    let onTap: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Image(systemName: action.icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(AvatarGColors.cyanBase)
                Text(action.title)
                    .font(AvatarGFonts.bodySmall)
                    .fontWeight(.medium)
                    .foregroundColor(AvatarGColors.textPrimary)
            }
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.vertical, AvatarGSpacing.sm)
            .background(
                Capsule()
                    .fill(AvatarGColors.glassBackground)
                    .overlay(
                        Capsule()
                            .stroke(AvatarGColors.glassBorder, lineWidth: 1)
                    )
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

// MARK: - QuickAction Model

struct QuickAction: Identifiable {
    let id = UUID()
    var title: String
    var prompt: String
    var icon: String
}
