import Foundation
import Combine
import AVFoundation

// MARK: - Jam Session Models

struct JamSession: Identifiable, Codable {
    let id: String
    var title: String
    var participants: [JamParticipant]
    var stems: [JamStem]
    var status: JamStatus
    var createdAt: Date
    var bpm: Int
    var keySignature: String   // e.g. "C major", "G minor"
    var timeSignature: String  // e.g. "4/4", "3/4"
    var isAICollaborator: Bool // true = Agent G is a participant

    enum JamStatus: String, Codable {
        case waiting, active, paused, finalising, completed
    }
}

struct JamParticipant: Identifiable, Codable {
    let id: String
    var displayName: String
    var avatarURL: String?
    var role: JamRole
    var isConnected: Bool
    var isAI: Bool

    enum JamRole: String, Codable, CaseIterable {
        case vocalist    = "vocalist"
        case drummer     = "drummer"
        case bassist     = "bassist"
        case keyboardist = "keyboardist"
        case guitarist   = "guitarist"
        case producer    = "producer"    // Agent G default role
    }
}

struct JamStem: Identifiable, Codable {
    let id: String
    var ownerId: String         // participant ID
    var type: StemType
    var audioURL: String?
    var isCommitted: Bool       // locked into the final mix
    var volume: Float
    var isMuted: Bool
    var uploadedAt: Date?

    enum StemType: String, Codable {
        case drums, bass, vocals, melody, harmony, fx, atmosphere
    }
}

// MARK: - WebSocket Messages

struct JamWebSocketMessage: Codable {
    var type: MessageType
    var sessionId: String
    var senderId: String
    var payload: AnyCodable?
    var timestamp: Date

    enum MessageType: String, Codable {
        case join, leave, stemUploaded, stemUpdated, stemDeleted
        case agentSuggestion, agentMerging, mixUpdated, sessionEnded
        case participantConnected, participantDisconnected, heartbeat
    }
}

// MARK: - AnyCodable helper

struct AnyCodable: Codable {
    let value: Any
    init(_ value: Any) { self.value = value }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let s as String:  try container.encode(s)
        case let i as Int:     try container.encode(i)
        case let f as Float:   try container.encode(f)
        case let b as Bool:    try container.encode(b)
        case let d as [String: String]: try container.encode(d)
        default: try container.encodeNil()
        }
    }
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) { value = s }
        else if let i = try? container.decode(Int.self) { value = i }
        else if let f = try? container.decode(Float.self) { value = f }
        else if let b = try? container.decode(Bool.self) { value = b }
        else { value = "" }
    }
}

// MARK: - Jam Session Service

@MainActor
final class JamSessionService: ObservableObject {

    static let shared = JamSessionService()

    // MARK: - Published State
    @Published private(set) var activeSession: JamSession?
    @Published private(set) var participants: [JamParticipant] = []
    @Published private(set) var sessionStems: [JamStem] = []
    @Published private(set) var agentSuggestion: String?
    @Published private(set) var isMixing: Bool = false
    @Published private(set) var connectionStatus: ConnectionStatus = .disconnected

    enum ConnectionStatus { case disconnected, connecting, connected, error(String) }

    // MARK: - Private
    private var webSocketTask: URLSessionWebSocketTask?
    private var pingTimer: Timer?
    private var cancellables = Set<AnyCancellable>()
    private let apiClient = APIClient.shared
    private var currentUserId: String { AppState.shared.currentUser?.id ?? "" }
    private var sessionId: String { activeSession?.id ?? "" }

    private init() {}

    // MARK: - Session Lifecycle

    func createSession(title: String, withAI: Bool = true, bpm: Int = 120, key: String = "C major") async throws {
        struct CreateBody: Encodable {
            let title: String; let withAICollaborator: Bool; let bpm: Int; let keySignature: String
        }
        let body = CreateBody(title: title, withAICollaborator: withAI, bpm: bpm, keySignature: key)
        let session: JamSession = try await apiClient.post(Endpoints.jamCreate, body: body)
        activeSession = session
        connectWebSocket()
    }

    func joinSession(id: String) async throws {
        let session: JamSession = try await apiClient.get(Endpoints.jamSession(id))
        activeSession = session
        participants = session.participants
        sessionStems = session.stems
        connectWebSocket()
    }

    func endSession() async throws {
        guard let session = activeSession else { return }
        struct EndBody: Encodable { let sessionId: String }
        let _: JamSession = try await apiClient.post(Endpoints.jamEnd, body: EndBody(sessionId: session.id))
        disconnectWebSocket()
        activeSession = nil
    }

    // MARK: - Stem Operations

    func uploadStem(type: JamStem.StemType, audioURL: URL) async throws {
        guard let session = activeSession else { return }
        // Upload audio file
        let uploadedStem: JamStem = try await apiClient.upload(
            url: Endpoints.jamStemUpload,
            fileURL: audioURL,
            fields: ["sessionId": session.id, "stemType": type.rawValue, "ownerId": currentUserId]
        )
        var stems = sessionStems
        stems.append(uploadedStem)
        sessionStems = stems

        // Broadcast to other participants
        sendWebSocketMessage(.init(
            type: .stemUploaded,
            sessionId: sessionId,
            senderId: currentUserId,
            payload: AnyCodable(uploadedStem.id),
            timestamp: .now
        ))

        // Ask Agent G to suggest next stem if AI collaborator
        if session.isAICollaborator {
            await requestAgentSuggestion()
        }
    }

    func updateStemVolume(_ stemId: String, volume: Float) {
        guard let idx = sessionStems.firstIndex(where: { $0.id == stemId }) else { return }
        sessionStems[idx].volume = volume
        sendWebSocketMessage(.init(
            type: .stemUpdated,
            sessionId: sessionId,
            senderId: currentUserId,
            payload: AnyCodable(["stemId": stemId, "volume": String(volume)]),
            timestamp: .now
        ))
    }

    func commitStem(_ stemId: String) {
        guard let idx = sessionStems.firstIndex(where: { $0.id == stemId }) else { return }
        sessionStems[idx].isCommitted = true
    }

    // MARK: - Agent G Collaboration

    func requestAgentSuggestion() async {
        guard let session = activeSession else { return }
        let existingTypes = sessionStems.filter { !$0.isMuted }.map { $0.type.rawValue }.joined(separator: ", ")
        let prompt = "In our jam session '\(session.title)' (\(session.bpm) BPM, \(session.keySignature)), "
                   + "we have: \(existingTypes). What stem should we add next and why?"
        do {
            struct AgentRequest: Encodable { let message: String; let context: String }
            struct AgentResponse: Decodable { let text: String }
            let req = AgentRequest(message: prompt, context: "jam_session_\(session.id)")
            let resp: AgentResponse = try await apiClient.post(Endpoints.agentChat, body: req)
            agentSuggestion = resp.text
        } catch {
            agentSuggestion = nil
        }
    }

    func requestAIFillStem(type: JamStem.StemType) async throws {
        guard let session = activeSession else { return }
        struct FillRequest: Encodable { let sessionId: String; let stemType: String; let bpm: Int; let keySignature: String }
        let req = FillRequest(sessionId: session.id, stemType: type.rawValue, bpm: session.bpm, keySignature: session.keySignature)
        let stem: JamStem = try await apiClient.post(Endpoints.jamAIFill, body: req)
        sessionStems.append(stem)
    }

    func mergeAndFinalise() async throws {
        guard let session = activeSession else { return }
        isMixing = true
        defer { isMixing = false }
        struct MergeRequest: Encodable { let sessionId: String }
        struct MergeResponse: Decodable { let trackId: String; let audioURL: String }
        let resp: MergeResponse = try await apiClient.post(Endpoints.jamMerge, body: MergeRequest(sessionId: session.id))
        _ = resp.trackId
    }

    // MARK: - WebSocket

    private func connectWebSocket() {
        guard let session = activeSession,
              let url = URL(string: "wss://myavatar.ge/ws/jam/\(session.id)?userId=\(currentUserId)")
        else { return }

        connectionStatus = .connecting
        let task = URLSession.shared.webSocketTask(with: url)
        webSocketTask = task
        task.resume()
        connectionStatus = .connected
        receiveLoop()

        pingTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.sendWebSocketMessage(.init(type: .heartbeat, sessionId: session.id, senderId: self?.currentUserId ?? "", payload: nil, timestamp: .now))
            }
        }
    }

    private func disconnectWebSocket() {
        pingTimer?.invalidate()
        pingTimer = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        connectionStatus = .disconnected
    }

    private func receiveLoop() {
        webSocketTask?.receive { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch result {
                case .success(let message):
                    self.handleWebSocketMessage(message)
                    self.receiveLoop()
                case .failure(let error):
                    self.connectionStatus = .error(error.localizedDescription)
                }
            }
        }
    }

    private func handleWebSocketMessage(_ message: URLSessionWebSocketTask.Message) {
        guard case .string(let text) = message,
              let data = text.data(using: .utf8),
              let msg = try? JSONDecoder().decode(JamWebSocketMessage.self, from: data)
        else { return }

        switch msg.type {
        case .participantConnected:
            loadParticipants()
        case .stemUploaded, .stemUpdated:
            loadStems()
        case .agentSuggestion:
            if case let str as String = msg.payload?.value {
                agentSuggestion = str
            }
        case .agentMerging:
            isMixing = true
        case .mixUpdated:
            isMixing = false
        case .sessionEnded:
            activeSession = nil
        default:
            break
        }
    }

    private func sendWebSocketMessage(_ msg: JamWebSocketMessage) {
        guard let data = try? JSONEncoder().encode(msg),
              let text = String(data: data, encoding: .utf8) else { return }
        webSocketTask?.send(.string(text)) { _ in }
    }

    private func loadParticipants() {
        Task {
            guard let session = activeSession else { return }
            if let updated: JamSession = try? await apiClient.get(Endpoints.jamSession(session.id)) {
                participants = updated.participants
            }
        }
    }

    private func loadStems() {
        Task {
            guard let session = activeSession else { return }
            if let updated: JamSession = try? await apiClient.get(Endpoints.jamSession(session.id)) {
                sessionStems = updated.stems
            }
        }
    }
}

// MARK: - Jam Session View

struct JamSessionView: View {
    @StateObject private var service = JamSessionService.shared
    @EnvironmentObject var appState: AppState
    @State private var showCreateSheet = false
    @State private var showJoinSheet = false
    @State private var joinCode = ""

    var body: some View {
        NavigationView {
            ZStack {
                Color(hex: "#0a0a0f").ignoresSafeArea()

                if let session = service.activeSession {
                    ActiveJamView(session: session, service: service)
                } else {
                    lobbyView
                }
            }
            .navigationTitle("AI Jam Session")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var lobbyView: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "music.note.list")
                .font(.system(size: 64))
                .foregroundStyle(
                    LinearGradient(colors: [Color(hex: "#00d4ff"), Color(hex: "#7c3aed")], startPoint: .topLeading, endPoint: .bottomTrailing)
                )

            VStack(spacing: 8) {
                Text("AI Jam Session")
                    .font(.system(.title, design: .rounded, weight: .bold))
                    .foregroundColor(.white)
                Text("Collaborate with friends or Agent G\nin real-time on a shared track")
                    .font(.system(.subheadline))
                    .foregroundColor(.white.opacity(0.55))
                    .multilineTextAlignment(.center)
            }

            VStack(spacing: 12) {
                Button {
                    showCreateSheet = true
                } label: {
                    Label("Create New Session", systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(LinearGradient(colors: [Color(hex: "#00d4ff"), Color(hex: "#7c3aed")], startPoint: .leading, endPoint: .trailing))
                        .foregroundColor(.white)
                        .cornerRadius(14)
                        .fontWeight(.semibold)
                }

                Button {
                    showJoinSheet = true
                } label: {
                    Label("Join with Code", systemImage: "qrcode")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.white.opacity(0.06))
                        .foregroundColor(.white)
                        .cornerRadius(14)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                }
            }
            .padding(.horizontal, 32)

            Spacer()
        }
        .sheet(isPresented: $showCreateSheet) {
            CreateJamSheet(service: service)
        }
    }
}

private struct CreateJamSheet: View {
    @ObservedObject var service: JamSessionService
    @Environment(\.dismiss) var dismiss
    @State private var title = ""
    @State private var bpm = 120
    @State private var key = "C major"
    @State private var withAI = true
    @State private var isCreating = false

    var body: some View {
        NavigationView {
            ZStack {
                Color(hex: "#0a0a0f").ignoresSafeArea()
                Form {
                    Section("Session Details") {
                        TextField("Session title", text: $title)
                            .foregroundColor(.white)
                        Stepper("BPM: \(bpm)", value: $bpm, in: 60...200, step: 5)
                            .foregroundColor(.white)
                        Picker("Key", selection: $key) {
                            ForEach(["C major","G major","D major","A major","E major","F major","B♭ major","G minor","A minor","D minor"], id: \.self) {
                                Text($0).tag($0)
                            }
                        }
                    }
                    .listRowBackground(Color.white.opacity(0.05))

                    Section("AI Collaboration") {
                        Toggle("Add Agent G as AI collaborator", isOn: $withAI)
                            .tint(Color(hex: "#00d4ff"))
                    }
                    .listRowBackground(Color.white.opacity(0.05))
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("New Jam Session")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color(hex: "#00d4ff"))
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") {
                        isCreating = true
                        Task {
                            try? await service.createSession(title: title.isEmpty ? "My Jam" : title, withAI: withAI, bpm: bpm, key: key)
                            isCreating = false
                            dismiss()
                        }
                    }
                    .disabled(isCreating)
                    .foregroundColor(Color(hex: "#00d4ff"))
                }
            }
        }
    }
}

private struct ActiveJamView: View {
    let session: JamSession
    @ObservedObject var service: JamSessionService

    var body: some View {
        VStack(spacing: 0) {
            // Participants bar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(service.participants) { p in
                        VStack(spacing: 4) {
                            ZStack {
                                Circle().fill(p.isAI ? Color(hex: "#7c3aed").opacity(0.2) : Color.white.opacity(0.08))
                                    .frame(width: 44, height: 44)
                                Image(systemName: p.isAI ? "cpu.fill" : "person.fill")
                                    .foregroundColor(p.isAI ? Color(hex: "#7c3aed") : .white)
                                Circle().stroke(p.isConnected ? Color(hex: "#00c896") : Color.gray, lineWidth: 2)
                                    .frame(width: 44, height: 44)
                            }
                            Text(p.isAI ? "Agent G" : p.displayName)
                                .font(.system(size: 10))
                                .foregroundColor(.white.opacity(0.6))
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.vertical, 12)

            Divider().overlay(Color.white.opacity(0.08))

            // Agent suggestion banner
            if let suggestion = service.agentSuggestion {
                HStack(spacing: 10) {
                    Image(systemName: "cpu.fill").foregroundColor(Color(hex: "#7c3aed"))
                    Text(suggestion).font(.system(.caption)).foregroundColor(.white.opacity(0.8))
                    Spacer()
                }
                .padding(12)
                .background(Color(hex: "#7c3aed").opacity(0.1))
                .overlay(Rectangle().frame(width: 3).foregroundColor(Color(hex: "#7c3aed")), alignment: .leading)
            }

            // Stems
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(service.sessionStems) { stem in
                        JamStemRow(stem: stem, service: service)
                    }
                }
                .padding(16)
            }

            // Bottom controls
            HStack(spacing: 12) {
                Button {
                    Task { try? await service.mergeAndFinalise() }
                } label: {
                    Label(service.isMixing ? "Mixing…" : "Mix & Export", systemImage: "waveform.badge.plus")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(service.isMixing ? Color.gray.opacity(0.3) : LinearGradient(colors: [Color(hex: "#00d4ff"), Color(hex: "#7c3aed")], startPoint: .leading, endPoint: .trailing))
                        .foregroundColor(.white)
                        .cornerRadius(14)
                }
                .disabled(service.isMixing)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
    }
}

private struct JamStemRow: View {
    let stem: JamStem
    @ObservedObject var service: JamSessionService
    @State private var volume: Float

    init(stem: JamStem, service: JamSessionService) {
        self.stem = stem
        self.service = service
        _volume = State(initialValue: stem.volume)
    }

    var icon: String {
        switch stem.type {
        case .drums: return "🥁"
        case .bass: return "🎸"
        case .vocals: return "🎤"
        case .melody: return "🎹"
        case .harmony: return "🎵"
        case .fx: return "✨"
        case .atmosphere: return "🌌"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Text(icon).font(.system(size: 22))

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(stem.type.rawValue.capitalized)
                        .font(.system(.subheadline, weight: .semibold)).foregroundColor(.white)
                    if stem.isCommitted {
                        Image(systemName: "lock.fill").font(.system(size: 10)).foregroundColor(.yellow)
                    }
                    Spacer()
                    Text("\(Int(volume * 100))%").font(.system(size: 11)).foregroundColor(.white.opacity(0.4))
                }
                Slider(value: $volume, in: 0...1)
                    .tint(Color(hex: "#00d4ff"))
                    .onChange(of: volume) { _, v in service.updateStemVolume(stem.id, volume: v) }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.04)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.08), lineWidth: 1)))
    }
}

private extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0; Scanner(string: hex).scanHexInt64(&int)
        let (a,r,g,b): (UInt64,UInt64,UInt64,UInt64) = hex.count == 6 ? (255,int>>16&0xFF,int>>8&0xFF,int&0xFF) : (255,0,0,0)
        self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)
    }
}
