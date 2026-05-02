import Foundation
import Combine

// MARK: - Agent G ViewModel

@MainActor
final class AgentGViewModel: ObservableObject {

    // MARK: - Published State

    @Published var messages: [ChatMessage] = []
    @Published var isLoading: Bool = false
    @Published var isRecording: Bool = false
    @Published var liveTranscription: String = ""
    @Published var audioAmplitude: Float = 0.0
    @Published var isAgentSpeaking: Bool = false
    @Published var suggestedActions: [QuickAction] = []
    @Published var isLiveMode: Bool = false
    @Published var errorMessage: String?
    @Published var inputText: String = ""
    @Published var isWebSocketConnected: Bool = false

    // MARK: - Services

    private let agentAPIService = AgentGAPIService.shared
    private let speechService = SpeechService.shared
    private let webSocketService = WebSocketService.shared

    private var cancellables = Set<AnyCancellable>()
    private var streamingMessage: ChatMessage?
    private var amplitudeTimer: Timer?

    // MARK: - Init

    init() {
        setupSuggestedActions()
        setupBindings()
    }

    // MARK: - Setup

    private func setupSuggestedActions() {
        suggestedActions = [
            QuickAction(
                title: "Create Song",
                prompt: "შექმენი პოპ სიმღერა ქართული სიტყვებით",
                icon: "music.note"
            ),
            QuickAction(
                title: "Generate Image",
                prompt: "შექმენი სურათი",
                icon: "photo"
            ),
            QuickAction(
                title: "Make Video",
                prompt: "შექმენი ვიდეო",
                icon: "video"
            ),
            QuickAction(
                title: "Build Avatar",
                prompt: "შექმენი ავატარი",
                icon: "person.crop.circle"
            ),
        ]
    }

    private func setupBindings() {
        // Bind speech amplitude
        speechService.$audioAmplitude
            .receive(on: DispatchQueue.main)
            .sink { [weak self] amplitude in
                self?.audioAmplitude = amplitude
            }
            .store(in: &cancellables)

        // Bind live transcription
        speechService.$transcribedText
            .receive(on: DispatchQueue.main)
            .sink { [weak self] text in
                self?.liveTranscription = text
            }
            .store(in: &cancellables)

        // Bind recording state
        speechService.$isRecording
            .receive(on: DispatchQueue.main)
            .sink { [weak self] recording in
                self?.isRecording = recording
            }
            .store(in: &cancellables)

        // Bind WebSocket events
        webSocketService.messagesPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleWebSocketEvent(event)
            }
            .store(in: &cancellables)

        webSocketService.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                self?.isWebSocketConnected = connected
            }
            .store(in: &cancellables)
    }

    // MARK: - Send Message

    func sendMessage(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let userMessage = ChatMessage(
            role: .user,
            content: text
        )
        messages.append(userMessage)
        isLoading = true

        // Create streaming agent message placeholder
        var agentMessage = ChatMessage(
            role: .agent,
            content: "",
            isStreaming: true
        )
        messages.append(agentMessage)
        let agentMessageId = agentMessage.id

        Task {
            do {
                let language = detectLanguage(text)
                let context = Array(messages.dropLast(2).suffix(10))
                let stream = agentAPIService.sendMessage(
                    text: text,
                    context: context,
                    language: language
                )

                for try await chunk in stream {
                    switch chunk {
                    case .text(let delta):
                        if let idx = messages.firstIndex(where: { $0.id == agentMessageId }) {
                            messages[idx].content += delta
                        }
                    case .action(let action):
                        await handleAgentAction(action)
                    case .done:
                        if let idx = messages.firstIndex(where: { $0.id == agentMessageId }) {
                            messages[idx].isStreaming = false
                        }
                        isLoading = false
                        speakAgentResponse(messages.last?.content ?? "")
                    }
                }
            } catch {
                if let idx = messages.firstIndex(where: { $0.id == agentMessageId }) {
                    messages[idx].content = "შეცდომა მოხდა. სცადეთ ხელახლა."
                    messages[idx].isStreaming = false
                }
                isLoading = false
                self.errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Voice Recording

    func startVoiceRecording() {
        liveTranscription = ""

        Task {
            do {
                let status = await SpeechService.shared.requestAuthorization()
                guard status == .authorized else {
                    errorMessage = "Speech recognition permission required."
                    return
                }

                try await speechService.startRecording(preferGeorgian: true)
                isRecording = true
            } catch {
                errorMessage = error.localizedDescription
                isRecording = false
            }
        }
    }

    func stopVoiceRecordingAndSend() {
        let transcript = speechService.stopRecording()
        isRecording = false
        liveTranscription = ""

        let textToSend = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if !textToSend.isEmpty {
            sendMessage(textToSend)
        }
    }

    func cancelVoiceRecording() {
        speechService.stopRecording()
        isRecording = false
        liveTranscription = ""
        audioAmplitude = 0
    }

    // MARK: - Live Conversation

    func startLiveConversation() {
        isLiveMode = true
        webSocketService.connect()
    }

    func endLiveConversation() {
        isLiveMode = false
        webSocketService.disconnect()
        speechService.stopRecording()
        speechService.stopSpeaking()
        isAgentSpeaking = false
    }

    // MARK: - WebSocket Handling

    private func handleWebSocketEvent(_ event: WebSocketEvent) {
        switch event {
        case .connected:
            isWebSocketConnected = true
            // Start voice capture for live mode
            if isLiveMode {
                Task {
                    try? await speechService.startRecording(preferGeorgian: true)
                }
            }

        case .disconnected:
            isWebSocketConnected = false
            if isLiveMode {
                isLiveMode = false
            }

        case .message(let agentMessage):
            handleLiveAgentMessage(agentMessage)

        case .error(let error):
            errorMessage = error.localizedDescription
        }
    }

    private func handleLiveAgentMessage(_ agentMessage: AgentMessage) {
        switch agentMessage.type {
        case .text:
            let chatMessage = ChatMessage(
                id: agentMessage.id,
                role: .agent,
                content: agentMessage.content
            )
            messages.append(chatMessage)

            // Speak the response
            if isLiveMode {
                let lang = agentMessage.language ?? "ka-GE"
                speechService.speakText(agentMessage.content, language: lang)
                isAgentSpeaking = true
            }

        case .action:
            // Parse and execute action from metadata
            if let metadata = agentMessage.metadata,
               let actionType = metadata["action"] {
                Task {
                    switch actionType {
                    case "generateMusic":
                        let prompt = metadata["prompt"] ?? ""
                        await handleMusicGeneration(prompt)
                    case "generateImage":
                        let prompt = metadata["prompt"] ?? ""
                        await handleImageGeneration(prompt)
                    default:
                        break
                    }
                }
            }

        case .ping:
            let pong = AgentMessage(
                id: UUID().uuidString,
                type: .pong,
                content: "",
                language: nil,
                metadata: nil
            )
            webSocketService.send(pong)

        case .voice, .pong:
            break
        }
    }

    // MARK: - Action Handling

    func handleAgentAction(_ action: AgentAction) async {
        switch action {
        case .generateMusic(let prompt):
            await handleMusicGeneration(prompt)
        case .generateImage(let prompt):
            await handleImageGeneration(prompt)
        case .generateVideo(let prompt):
            await handleVideoGeneration(prompt)
        case .openGallery:
            AppState.shared.navigateToGallery()
        case .playTrack(let track):
            addTrackToChat(track)
        case .none:
            break
        }
    }

    func handleMusicGeneration(_ prompt: String) async {
        let statusMessage = ChatMessage(
            role: .agent,
            content: "🎵 ტრეკს ვქმნი: \"\(prompt)\"\n⏳ ეს რამდენიმე წამს მოიცავს...",
            isStreaming: false
        )
        messages.append(statusMessage)

        do {
            let track = try await MusicAPIService.shared.generateTrack(
                prompt: prompt,
                style: .pop,
                duration: 60
            )

            let attachment = MessageAttachment(
                type: .musicTrack,
                musicTrack: track
            )
            let trackMessage = ChatMessage(
                role: .agent,
                content: "✅ ტრეკი მზადაა!",
                attachments: [attachment]
            )
            messages.append(trackMessage)
        } catch {
            let errorMsg = ChatMessage(
                role: .agent,
                content: "❌ ტრეკის გენერაცია ვერ მოხერხდა: \(error.localizedDescription)"
            )
            messages.append(errorMsg)
        }
    }

    func handleImageGeneration(_ prompt: String) async {
        let statusMessage = ChatMessage(
            role: .agent,
            content: "🎨 სურათს ვქმნი: \"\(prompt)\"..."
        )
        messages.append(statusMessage)

        do {
            let imageReq = ImageRequest(prompt: prompt, style: nil, width: 1024, height: 1024)
            let image: GeneratedImage = try await APIClient.shared.post(.imageGenerate, body: imageReq)

            let attachment = MessageAttachment(
                type: .image,
                url: image.url,
                previewURL: image.thumbnailURL,
                generatedImage: image
            )
            let imageMessage = ChatMessage(
                role: .agent,
                content: "✅ სურათი მზადაა!",
                attachments: [attachment]
            )
            messages.append(imageMessage)
        } catch {
            let errorMsg = ChatMessage(
                role: .agent,
                content: "❌ სურათის გენერაცია ვერ მოხერხდა."
            )
            messages.append(errorMsg)
        }
    }

    func handleVideoGeneration(_ prompt: String) async {
        let statusMessage = ChatMessage(
            role: .agent,
            content: "🎬 ვიდეოს ვქმნი: \"\(prompt)\"..."
        )
        messages.append(statusMessage)

        do {
            let videoReq = VideoRequest(prompt: prompt, duration: 10, style: nil)
            let video: GeneratedVideo = try await APIClient.shared.post(.videoGenerate, body: videoReq)

            let attachment = MessageAttachment(
                type: .video,
                url: video.videoURL,
                previewURL: video.thumbnailURL,
                generatedVideo: video
            )
            let videoMessage = ChatMessage(
                role: .agent,
                content: "✅ ვიდეო მზადაა!",
                attachments: [attachment]
            )
            messages.append(videoMessage)
        } catch {
            let errorMsg = ChatMessage(
                role: .agent,
                content: "❌ ვიდეოს გენერაცია ვერ მოხერხდა."
            )
            messages.append(errorMsg)
        }
    }

    private func addTrackToChat(_ track: MusicTrack) {
        let attachment = MessageAttachment(type: .musicTrack, musicTrack: track)
        let message = ChatMessage(
            role: .agent,
            content: "🎵 \(track.title)",
            attachments: [attachment]
        )
        messages.append(message)
    }

    // MARK: - TTS

    private func speakAgentResponse(_ text: String) {
        guard !text.isEmpty else { return }
        let language = detectLanguage(text)
        speechService.speakText(text, language: language)
        isAgentSpeaking = true

        // Track when speaking ends (approximate)
        let wordCount = text.split(separator: " ").count
        let estimatedDuration = Double(wordCount) * 0.4
        Task {
            try? await Task.sleep(nanoseconds: UInt64(estimatedDuration * 1_000_000_000))
            isAgentSpeaking = false
        }
    }

    // MARK: - Language Detection

    private func detectLanguage(_ text: String) -> String {
        return speechService.detectLanguage(in: text)
    }

    // MARK: - Interruption

    func interruptAgent() {
        speechService.stopSpeaking()
        isAgentSpeaking = false
    }

    // MARK: - Demo Welcome Message

    func loadWelcomeMessage() {
        guard messages.isEmpty else { return }

        let welcomeMessage = ChatMessage(
            role: .agent,
            content: "გამარჯობა! მე ვარ Agent G — შენი AI ასისტენტი. შემიძლია:\n\n🎵 მუსიკის შექმნა\n🎨 სურათების გენერაცია\n🎬 ვიდეოების შექმნა\n🧬 ავატარების დიზაინი\n\nრა გაქვს სამუშაო?"
        )
        messages.append(welcomeMessage)
    }
}
