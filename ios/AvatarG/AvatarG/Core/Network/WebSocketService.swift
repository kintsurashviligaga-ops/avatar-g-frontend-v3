import Foundation
import Combine

// MARK: - WebSocket Events

enum WebSocketEvent {
    case connected
    case disconnected(reason: String?)
    case message(AgentMessage)
    case error(Error)
}

// MARK: - WebSocket Service

@MainActor
final class WebSocketService: ObservableObject {

    static let shared = WebSocketService()

    @Published private(set) var isConnected: Bool = false
    @Published private(set) var lastEvent: WebSocketEvent?

    private let messagesSubject = PassthroughSubject<WebSocketEvent, Never>()
    var messagesPublisher: AnyPublisher<WebSocketEvent, Never> {
        messagesSubject.eraseToAnyPublisher()
    }

    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession
    private var reconnectTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var reconnectAttempts: Int = 0
    private let maxReconnectAttempts = 5
    private var authToken: String?
    private var shouldReconnect = false

    private static let webSocketURL = "wss://myavatar.ge/ws/agent"

    private init() {
        let config = URLSessionConfiguration.default
        self.session = URLSession(configuration: config)
    }

    // MARK: - Public Interface

    func setAuthToken(_ token: String) {
        authToken = token
    }

    func connect() {
        shouldReconnect = true
        reconnectAttempts = 0
        establishConnection()
    }

    func disconnect() {
        shouldReconnect = false
        reconnectTask?.cancel()
        receiveTask?.cancel()
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
        let event = WebSocketEvent.disconnected(reason: "User disconnected")
        lastEvent = event
        messagesSubject.send(event)
    }

    func send(_ message: AgentMessage) {
        guard let task = webSocketTask, isConnected else {
            let error = WebSocketError.notConnected
            let event = WebSocketEvent.error(error)
            lastEvent = event
            messagesSubject.send(event)
            return
        }

        Task {
            do {
                let encoder = JSONEncoder()
                let data = try encoder.encode(message)
                let string = String(data: data, encoding: .utf8) ?? ""
                try await task.send(.string(string))
            } catch {
                let event = WebSocketEvent.error(error)
                await MainActor.run {
                    self.lastEvent = event
                    self.messagesSubject.send(event)
                }
            }
        }
    }

    func sendPing() {
        webSocketTask?.sendPing { [weak self] error in
            if let error = error {
                Task { @MainActor in
                    self?.handleConnectionError(error)
                }
            }
        }
    }

    // MARK: - Private Connection Management

    private func establishConnection() {
        guard var urlComponents = URLComponents(string: WebSocketService.webSocketURL) else {
            return
        }

        if let token = authToken {
            urlComponents.queryItems = [URLQueryItem(name: "token", value: token)]
        }

        guard let url = urlComponents.url else { return }

        var request = URLRequest(url: url)
        request.timeoutInterval = 10

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        webSocketTask = session.webSocketTask(with: request)
        webSocketTask?.resume()
        isConnected = true
        reconnectAttempts = 0

        let event = WebSocketEvent.connected
        lastEvent = event
        messagesSubject.send(event)

        startReceiving()
    }

    private func startReceiving() {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            guard let self = self else { return }
            await self.receiveLoop()
        }
    }

    private func receiveLoop() async {
        while !Task.isCancelled, let task = webSocketTask {
            do {
                let message = try await task.receive()
                await handleWebSocketMessage(message)
            } catch {
                if !Task.isCancelled {
                    await handleConnectionError(error)
                }
                break
            }
        }
    }

    private func handleWebSocketMessage(_ message: URLSessionWebSocketTask.Message) async {
        switch message {
        case .string(let text):
            guard let data = text.data(using: .utf8) else { return }
            do {
                let decoder = JSONDecoder()
                let agentMessage = try decoder.decode(AgentMessage.self, from: data)
                let event = WebSocketEvent.message(agentMessage)
                lastEvent = event
                messagesSubject.send(event)
            } catch {
                // Try to parse as plain text message
                let fallbackMessage = AgentMessage(
                    id: UUID().uuidString,
                    type: .text,
                    content: text,
                    language: nil,
                    metadata: nil
                )
                let event = WebSocketEvent.message(fallbackMessage)
                lastEvent = event
                messagesSubject.send(event)
            }

        case .data(let data):
            do {
                let decoder = JSONDecoder()
                let agentMessage = try decoder.decode(AgentMessage.self, from: data)
                let event = WebSocketEvent.message(agentMessage)
                lastEvent = event
                messagesSubject.send(event)
            } catch {
                let wsError = WebSocketError.decodingFailed
                let event = WebSocketEvent.error(wsError)
                lastEvent = event
                messagesSubject.send(event)
            }

        @unknown default:
            break
        }
    }

    private func handleConnectionError(_ error: Error) {
        isConnected = false
        let event = WebSocketEvent.error(error)
        lastEvent = event
        messagesSubject.send(event)

        if shouldReconnect && reconnectAttempts < maxReconnectAttempts {
            scheduleReconnect()
        } else if reconnectAttempts >= maxReconnectAttempts {
            let disconnectEvent = WebSocketEvent.disconnected(reason: "Max reconnection attempts reached")
            lastEvent = disconnectEvent
            messagesSubject.send(disconnectEvent)
        }
    }

    private func scheduleReconnect() {
        reconnectTask?.cancel()
        let delay = calculateBackoffDelay(attempt: reconnectAttempts)
        reconnectAttempts += 1

        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                self?.establishConnection()
            }
        }
    }

    private func calculateBackoffDelay(attempt: Int) -> Double {
        let baseDelay = 1.0
        let maxDelay = 30.0
        let delay = baseDelay * pow(2.0, Double(attempt))
        let jitter = Double.random(in: 0...0.5)
        return min(delay + jitter, maxDelay)
    }
}

// MARK: - WebSocket Errors

enum WebSocketError: Error, LocalizedError {
    case notConnected
    case decodingFailed
    case invalidURL
    case connectionFailed(String)

    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "WebSocket is not connected"
        case .decodingFailed:
            return "Failed to decode WebSocket message"
        case .invalidURL:
            return "Invalid WebSocket URL"
        case .connectionFailed(let reason):
            return "Connection failed: \(reason)"
        }
    }
}
