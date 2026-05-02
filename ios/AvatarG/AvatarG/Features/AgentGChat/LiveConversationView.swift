import SwiftUI

// MARK: - Live Conversation View

struct LiveConversationView: View {
    @EnvironmentObject var viewModel: AgentGViewModel
    @Environment(\.dismiss) var dismiss

    @State private var orbState: OrbView.OrbState = .idle
    @State private var agentResponseText: String = ""
    @State private var transcriptionText: String = ""
    @State private var isSessionActive: Bool = false
    @State private var sessionDuration: Int = 0
    @State private var sessionTimer: Timer?

    var body: some View {
        ZStack {
            // Full screen dark background
            AvatarGColors.spaceVoid.ignoresSafeArea()

            // Ambient background glow
            ZStack {
                Circle()
                    .fill(orbGlowColor.opacity(0.06))
                    .frame(width: 500, height: 500)
                    .blur(radius: 80)
                    .animation(.easeInOut(duration: 1.5), value: orbState)
            }

            VStack(spacing: 0) {
                // Top bar
                topBar

                Spacer()

                // Agent response text (above orb)
                if !agentResponseText.isEmpty {
                    agentTextView
                        .transition(.opacity.combined(with: .move(edge: .top)))
                        .padding(.horizontal, AvatarGSpacing.xl)
                }

                // Central orb
                centralOrb

                // Transcription (below orb)
                transcriptionView
                    .padding(.horizontal, AvatarGSpacing.xl)
                    .padding(.top, AvatarGSpacing.lg)

                Spacer()

                // Bottom controls
                bottomControls
                    .padding(.bottom, AvatarGSpacing.xxl)
            }
        }
        .onAppear {
            startSession()
        }
        .onDisappear {
            endSession()
        }
        .onChange(of: viewModel.isRecording) { _, recording in
            updateOrbState(recording: recording)
        }
        .onChange(of: viewModel.isAgentSpeaking) { _, speaking in
            updateOrbState(speaking: speaking)
        }
        .onChange(of: viewModel.liveTranscription) { _, text in
            transcriptionText = text
        }
        .onChange(of: viewModel.messages.count) { _, _ in
            updateAgentResponseText()
        }
        .animation(.avatarGSpring, value: orbState)
        .animation(.easeInOut(duration: 0.4), value: agentResponseText)
    }

    // MARK: - Orb Glow Color

    var orbGlowColor: Color {
        switch orbState {
        case .idle: return AvatarGColors.cyanBase
        case .listening: return AvatarGColors.cyanBase
        case .speaking: return AvatarGColors.violetBase
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("Agent G")
                        .font(AvatarGFonts.displaySmall)
                        .foregroundColor(AvatarGColors.textPrimary)

                    Text("🇬🇪")
                        .font(.system(size: 20))

                    NeonBadge(text: "Live", color: .crimson)
                }

                Text(sessionTimeFormatted)
                    .font(AvatarGFonts.monoSmall)
                    .foregroundColor(AvatarGColors.textTertiary)
            }

            Spacer()

            // Connection status
            HStack(spacing: 4) {
                Circle()
                    .fill(viewModel.isWebSocketConnected
                          ? AvatarGColors.emeraldBase
                          : AvatarGColors.crimsonBase)
                    .frame(width: 8, height: 8)

                Text(viewModel.isWebSocketConnected ? "Connected" : "Connecting...")
                    .font(AvatarGFonts.bodyXSmall)
                    .foregroundColor(AvatarGColors.textTertiary)
            }
        }
        .padding(.horizontal, AvatarGSpacing.lg)
        .padding(.top, AvatarGSpacing.lg)
    }

    // MARK: - Agent Text

    private var agentTextView: some View {
        VStack(spacing: AvatarGSpacing.sm) {
            Text(agentResponseText)
                .font(AvatarGFonts.bodyLarge)
                .foregroundColor(AvatarGColors.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(4)
                .padding(AvatarGSpacing.md)
                .glassCard(cornerRadius: AvatarGRadius.xl)

            if viewModel.isAgentSpeaking {
                WaveformView(
                    amplitude: 0.6,
                    isActive: true,
                    color: AvatarGColors.violetBase,
                    barCount: 7
                )
                .frame(height: 20)
            }
        }
    }

    // MARK: - Central Orb

    private var centralOrb: some View {
        ZStack {
            // Outer waveform rings when speaking
            if orbState == .speaking {
                ForEach(0..<4) { ring in
                    Circle()
                        .stroke(
                            AvatarGColors.violetBase.opacity(0.15 - Double(ring) * 0.03),
                            lineWidth: 1
                        )
                        .frame(
                            width: 140 + CGFloat(ring) * 30,
                            height: 140 + CGFloat(ring) * 30
                        )
                }
            }

            // The orb
            OrbView(state: orbState, size: 120)
                .overlay(
                    // State label inside orb area
                    VStack {
                        Spacer()
                        stateLabel
                            .offset(y: 80)
                    }
                )
        }
        .frame(height: 250)
    }

    private var stateLabel: some View {
        Text(stateText)
            .font(AvatarGFonts.bodySmall)
            .fontWeight(.medium)
            .foregroundColor(AvatarGColors.textSecondary)
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.vertical, AvatarGSpacing.xs)
            .glassCard(cornerRadius: AvatarGRadius.full)
    }

    private var stateText: String {
        switch orbState {
        case .idle: return "Tap to speak"
        case .listening: return "ვუსმენ... 🎤"
        case .speaking: return "Agent G საუბრობს..."
        }
    }

    // MARK: - Transcription View

    private var transcriptionView: some View {
        VStack(spacing: AvatarGSpacing.sm) {
            if !transcriptionText.isEmpty {
                VStack(spacing: AvatarGSpacing.xs) {
                    HStack {
                        Image(systemName: "mic.circle.fill")
                            .foregroundColor(AvatarGColors.cyanBase)
                            .font(.system(size: 14))
                        Text("შენი სიტყვები")
                            .font(AvatarGFonts.bodyXSmall)
                            .foregroundColor(AvatarGColors.textTertiary)
                    }

                    Text(transcriptionText)
                        .font(AvatarGFonts.bodyMedium)
                        .foregroundColor(AvatarGColors.cyanBase)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                        .padding(AvatarGSpacing.md)
                        .glassCard(cornerRadius: AvatarGRadius.lg)
                        .neonBorder(color: AvatarGColors.cyanBase.opacity(0.3), cornerRadius: AvatarGRadius.lg)
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else if orbState == .listening {
                Text("ახლა ილაპარაკე...")
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textTertiary)
                    .italic()
            }
        }
        .frame(minHeight: 80)
        .animation(.avatarGSmooth, value: transcriptionText)
    }

    // MARK: - Bottom Controls

    private var bottomControls: some View {
        VStack(spacing: AvatarGSpacing.lg) {
            // Interrupt button (if agent speaking)
            if viewModel.isAgentSpeaking {
                Button(action: {
                    viewModel.interruptAgent()
                }) {
                    HStack(spacing: AvatarGSpacing.sm) {
                        Image(systemName: "stop.fill")
                        Text("შეაწყვეტინე")
                    }
                    .font(AvatarGFonts.bodySmall)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.violetBase)
                    .padding(.horizontal, AvatarGSpacing.lg)
                    .padding(.vertical, AvatarGSpacing.sm)
                    .glassCard(cornerRadius: AvatarGRadius.full)
                    .neonBorder(color: AvatarGColors.violetBase.opacity(0.5), cornerRadius: AvatarGRadius.full)
                }
                .buttonStyle(PlainButtonStyle())
                .transition(.scale.combined(with: .opacity))
            }

            // End conversation button
            Button(action: {
                endSession()
                dismiss()
            }) {
                HStack(spacing: AvatarGSpacing.sm) {
                    Image(systemName: "phone.down.fill")
                        .font(.system(size: 20))
                    Text("საუბრის დასრულება")
                        .font(AvatarGFonts.bodyMedium)
                        .fontWeight(.semibold)
                }
                .foregroundColor(.white)
                .padding(.horizontal, AvatarGSpacing.xl)
                .padding(.vertical, AvatarGSpacing.md)
                .background(
                    Capsule()
                        .fill(AvatarGColors.crimsonBase)
                        .shadow(color: AvatarGColors.crimsonBase.opacity(0.5), radius: 12, x: 0, y: 4)
                )
            }
            .buttonStyle(PlainButtonStyle())
        }
    }

    // MARK: - Session Management

    private func startSession() {
        isSessionActive = true
        sessionDuration = 0

        // Start session timer
        sessionTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                sessionDuration += 1
            }
        }

        // Start live conversation via ViewModel
        viewModel.startLiveConversation()
    }

    private func endSession() {
        isSessionActive = false
        sessionTimer?.invalidate()
        sessionTimer = nil
        viewModel.endLiveConversation()
    }

    private func updateOrbState(recording: Bool? = nil, speaking: Bool? = nil) {
        if let speaking = speaking {
            if speaking {
                orbState = .speaking
                return
            }
        }
        if let recording = recording {
            orbState = recording ? .listening : .idle
            return
        }

        if viewModel.isAgentSpeaking {
            orbState = .speaking
        } else if viewModel.isRecording {
            orbState = .listening
        } else {
            orbState = .idle
        }
    }

    private func updateAgentResponseText() {
        let agentMessages = viewModel.messages.filter { $0.role == .agent }
        agentResponseText = agentMessages.last?.content ?? ""
    }

    private var sessionTimeFormatted: String {
        let mins = sessionDuration / 60
        let secs = sessionDuration % 60
        return String(format: "%02d:%02d", mins, secs)
    }
}

#Preview {
    LiveConversationView()
        .environmentObject(AgentGViewModel())
        .preferredColorScheme(.dark)
}
