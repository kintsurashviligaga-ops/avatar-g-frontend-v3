import SwiftUI

// MARK: - Agent G Chat View

struct AgentGChatView: View {
    @StateObject private var viewModel = AgentGViewModel()
    @EnvironmentObject var appState: AppState

    @State private var showLiveConversation = false
    @State private var scrollProxy: ScrollViewProxy?
    @FocusState private var isInputFocused: Bool
    @State private var keyboardHeight: CGFloat = 0

    var body: some View {
        ZStack {
            AvatarGColors.spaceVoid.ignoresSafeArea()

            VStack(spacing: 0) {
                // Navigation header
                headerView

                // Messages
                messageScrollView

                // Voice recording overlay
                if viewModel.isRecording {
                    voiceRecordingBar
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Input bar
                if !viewModel.isRecording {
                    inputBar
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .onAppear {
            viewModel.loadWelcomeMessage()
        }
        .sheet(isPresented: $showLiveConversation) {
            LiveConversationView()
                .environmentObject(viewModel)
        }
        .animation(.avatarGSpring, value: viewModel.isRecording)
    }

    // MARK: - Header

    private var headerView: some View {
        HStack(spacing: AvatarGSpacing.md) {
            // Agent Avatar
            ZStack {
                Circle()
                    .fill(AvatarGColors.gradientCyanViolet)
                    .frame(width: 40, height: 40)
                    .shadow(color: AvatarGColors.cyanBase.opacity(0.4), radius: 8, x: 0, y: 0)

                Text("G")
                    .font(.system(size: 16, weight: .black, design: .rounded))
                    .foregroundColor(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Agent G")
                    .font(AvatarGFonts.displaySmall)
                    .foregroundColor(AvatarGColors.textPrimary)

                HStack(spacing: 4) {
                    Circle()
                        .fill(AvatarGColors.emeraldBase)
                        .frame(width: 6, height: 6)
                    Text(viewModel.isAgentSpeaking ? "საუბრობს..." : "Online")
                        .font(AvatarGFonts.bodyXSmall)
                        .foregroundColor(AvatarGColors.textSecondary)
                }
            }

            Spacer()

            // Live mode button
            Button(action: { showLiveConversation = true }) {
                HStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(.system(size: 13, weight: .semibold))
                    Text("Live")
                        .font(AvatarGFonts.bodySmall)
                        .fontWeight(.semibold)
                }
                .foregroundColor(AvatarGColors.violetBase)
                .padding(.horizontal, AvatarGSpacing.md)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(AvatarGColors.violetBase.opacity(0.15))
                        .overlay(Capsule().stroke(AvatarGColors.violetBase.opacity(0.4), lineWidth: 1))
                )
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .padding(.vertical, AvatarGSpacing.sm)
        .background(
            AvatarGColors.spaceDeep
                .overlay(
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(AvatarGColors.glassBorder),
                    alignment: .bottom
                )
        )
    }

    // MARK: - Message Scroll View

    private var messageScrollView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: AvatarGSpacing.sm) {
                    // Quick actions at top (when no/few messages)
                    if viewModel.messages.count <= 1 {
                        quickActionsSection
                            .padding(.top, AvatarGSpacing.md)
                    }

                    ForEach(viewModel.messages) { message in
                        AvatarBubble(message: message)
                            .id(message.id)
                            .transition(.asymmetric(
                                insertion: .move(edge: .bottom).combined(with: .opacity),
                                removal: .opacity
                            ))
                    }

                    if viewModel.isLoading && viewModel.messages.last?.role != .agent {
                        AgentTypingIndicator()
                            .padding(.leading, AvatarGSpacing.xl)
                            .id("typing")
                    }

                    // Bottom spacer for input
                    Color.clear.frame(height: 16).id("bottom")
                }
                .padding(.vertical, AvatarGSpacing.sm)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: viewModel.messages.count) { _, _ in
                withAnimation(.avatarGSmooth) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
            .onChange(of: viewModel.isLoading) { _, loading in
                if loading {
                    withAnimation(.avatarGSmooth) {
                        proxy.scrollTo("typing", anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Quick Actions Section

    private var quickActionsSection: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            Text("სწრაფი მოქმედებები")
                .font(AvatarGFonts.bodyXSmall)
                .fontWeight(.semibold)
                .foregroundColor(AvatarGColors.textTertiary)
                .padding(.horizontal, AvatarGSpacing.md)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: AvatarGSpacing.sm) {
                    ForEach(viewModel.suggestedActions) { action in
                        QuickActionChip(action: action) {
                            viewModel.sendMessage(action.prompt)
                        }
                    }
                }
                .padding(.horizontal, AvatarGSpacing.md)
            }
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        VStack(spacing: 0) {
            Rectangle()
                .frame(height: 1)
                .foregroundColor(AvatarGColors.glassBorder)

            HStack(spacing: AvatarGSpacing.sm) {
                // Text field
                HStack {
                    TextField("შეტყობინება...", text: $viewModel.inputText, axis: .vertical)
                        .font(AvatarGFonts.bodyMedium)
                        .foregroundColor(AvatarGColors.textPrimary)
                        .lineLimit(1...5)
                        .focused($isInputFocused)
                        .onSubmit {
                            if !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                let text = viewModel.inputText
                                viewModel.inputText = ""
                                viewModel.sendMessage(text)
                            }
                        }

                    if !viewModel.inputText.isEmpty {
                        Button(action: { viewModel.inputText = "" }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(AvatarGColors.textTertiary)
                                .font(.system(size: 16))
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                }
                .padding(.horizontal, AvatarGSpacing.md)
                .padding(.vertical, 10)
                .background(AvatarGColors.spaceCard)
                .clipShape(RoundedRectangle(cornerRadius: AvatarGRadius.xl))
                .overlay(
                    RoundedRectangle(cornerRadius: AvatarGRadius.xl)
                        .stroke(isInputFocused ? AvatarGColors.cyanBase.opacity(0.5) : AvatarGColors.glassBorder,
                                lineWidth: 1)
                )
                .animation(.avatarGFast, value: isInputFocused)

                // Voice button
                Button(action: {
                    isInputFocused = false
                    viewModel.startVoiceRecording()
                }) {
                    ZStack {
                        Circle()
                            .fill(AvatarGColors.glassBackground)
                            .frame(width: 44, height: 44)
                            .overlay(
                                Circle()
                                    .stroke(AvatarGColors.glassBorder, lineWidth: 1)
                            )

                        Image(systemName: "mic.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(AvatarGColors.textSecondary)
                    }
                }
                .buttonStyle(PlainButtonStyle())

                // Send button
                if !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button(action: {
                        let text = viewModel.inputText
                        viewModel.inputText = ""
                        viewModel.sendMessage(text)
                    }) {
                        ZStack {
                            Circle()
                                .fill(AvatarGColors.gradientCyanViolet)
                                .frame(width: 44, height: 44)
                                .shadow(color: AvatarGColors.cyanBase.opacity(0.4), radius: 8, x: 0, y: 0)

                            Image(systemName: "arrow.up")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                    .buttonStyle(PlainButtonStyle())
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.vertical, AvatarGSpacing.sm)
            .background(AvatarGColors.spaceDeep)
        }
        .animation(.avatarGFast, value: viewModel.inputText.isEmpty)
    }

    // MARK: - Voice Recording Bar

    private var voiceRecordingBar: some View {
        VStack(spacing: 0) {
            Rectangle()
                .frame(height: 1)
                .foregroundColor(AvatarGColors.glassBorder)

            VStack(spacing: AvatarGSpacing.sm) {
                // Transcription display
                if !viewModel.liveTranscription.isEmpty {
                    Text(viewModel.liveTranscription)
                        .font(AvatarGFonts.bodyMedium)
                        .foregroundColor(AvatarGColors.textPrimary)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                        .padding(.horizontal, AvatarGSpacing.lg)
                        .padding(.top, AvatarGSpacing.sm)
                } else {
                    Text("ვუსმენ... (ქართულად ან ინგლისურად)")
                        .font(AvatarGFonts.bodySmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                        .padding(.top, AvatarGSpacing.sm)
                }

                HStack(spacing: AvatarGSpacing.xl) {
                    // Cancel
                    Button(action: viewModel.cancelVoiceRecording) {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(AvatarGColors.textSecondary)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(AvatarGColors.glassBackground))
                    }
                    .buttonStyle(PlainButtonStyle())

                    // Waveform + Mic indicator
                    VStack(spacing: 6) {
                        WaveformView(
                            amplitude: viewModel.audioAmplitude,
                            isActive: viewModel.isRecording,
                            color: AvatarGColors.cyanBase
                        )
                        .frame(height: 30)

                        ZStack {
                            Circle()
                                .fill(AvatarGColors.crimsonBase.opacity(0.2))
                                .frame(width: 56, height: 56)
                            Circle()
                                .fill(AvatarGColors.crimsonBase)
                                .frame(width: 44, height: 44)
                                .shadow(color: AvatarGColors.crimsonBase.opacity(0.6), radius: 10, x: 0, y: 0)
                            Image(systemName: "mic.fill")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }

                    // Send
                    Button(action: viewModel.stopVoiceRecordingAndSend) {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 44, height: 44)
                            .background(
                                Circle()
                                    .fill(viewModel.liveTranscription.isEmpty
                                          ? AvatarGColors.glassBackground
                                          : AvatarGColors.gradientCyanViolet)
                            )
                    }
                    .buttonStyle(PlainButtonStyle())
                    .disabled(viewModel.liveTranscription.isEmpty)
                }
                .padding(.bottom, AvatarGSpacing.md)
            }
            .background(AvatarGColors.spaceDeep)
        }
    }
}

// MARK: - Agent Typing Indicator

struct AgentTypingIndicator: View {
    @State private var dotOpacity: [Double] = [0.3, 0.3, 0.3]

    var body: some View {
        HStack(spacing: AvatarGSpacing.sm) {
            ZStack {
                Circle()
                    .fill(AvatarGColors.gradientCyanViolet)
                    .frame(width: 28, height: 28)
                Text("G")
                    .font(.system(size: 12, weight: .black, design: .rounded))
                    .foregroundColor(.white)
            }

            HStack(spacing: 5) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(AvatarGColors.textSecondary)
                        .frame(width: 7, height: 7)
                        .opacity(dotOpacity[i])
                        .onAppear {
                            let delay = Double(i) * 0.2
                            withAnimation(
                                .easeInOut(duration: 0.5)
                                    .repeatForever()
                                    .delay(delay)
                            ) {
                                dotOpacity[i] = 1.0
                            }
                        }
                }
            }
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.vertical, AvatarGSpacing.sm)
            .background(
                RoundedRectangle(cornerRadius: AvatarGRadius.lg)
                    .fill(AvatarGColors.glassBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: AvatarGRadius.lg)
                            .stroke(AvatarGColors.glassBorder, lineWidth: 1)
                    )
            )

            Spacer()
        }
        .padding(.horizontal, AvatarGSpacing.md)
    }
}

#Preview {
    AgentGChatView()
        .environmentObject(AppState.shared)
        .preferredColorScheme(.dark)
}
