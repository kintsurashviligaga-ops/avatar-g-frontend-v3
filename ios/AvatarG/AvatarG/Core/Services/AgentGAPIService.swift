import Foundation

// MARK: - Agent G API Service

@MainActor
final class AgentGAPIService {

    static let shared = AgentGAPIService()
    private let apiClient = APIClient.shared

    private init() {}

    // MARK: - Streaming Chat

    func sendMessage(text: String, context: [ChatMessage], language: String = "ka-GE") -> AsyncThrowingStream<AgentChunk, Error> {
        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let contextMessages = context.map { msg in
                        AgentChatRequest.ContextMessage(
                            role: msg.role.rawValue,
                            content: msg.content
                        )
                    }

                    let request = AgentChatRequest(
                        message: text,
                        context: contextMessages,
                        language: language,
                        userId: nil
                    )

                    let stream = self.apiClient.stream(.agentChat, body: request)

                    for try await line in stream {
                        if line.isEmpty { continue }

                        if let data = line.data(using: .utf8),
                           let chunk = try? JSONDecoder().decode(AgentStreamChunk.self, from: data) {
                            switch chunk.type {
                            case "text":
                                continuation.yield(.text(chunk.content ?? ""))
                            case "action":
                                if let actionData = chunk.actionData,
                                   let action = parseAction(actionData) {
                                    continuation.yield(.action(action))
                                }
                            case "done":
                                continuation.yield(.done)
                                continuation.finish()
                                return
                            default:
                                continuation.yield(.text(chunk.content ?? ""))
                            }
                        } else {
                            // Plain text chunk
                            continuation.yield(.text(line))
                        }
                    }
                    continuation.yield(.done)
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Voice Message

    func sendVoiceMessage(audioData: Data, language: String = "ka-GE") async throws -> AgentResponse {
        var formData = MultipartFormData()
        formData.append(field: "language", value: language)
        formData.append(
            file: "audio",
            filename: "voice.m4a",
            mimeType: "audio/mp4",
            data: audioData
        )

        let response: AgentResponse = try await apiClient.upload(
            endpoint: .agentVoice,
            formData: formData
        )
        return response
    }

    // MARK: - Action Execution

    func executeAction(_ action: AgentAction) async throws {
        switch action {
        case .generateMusic(let prompt):
            _ = try await MusicAPIService.shared.generateTrack(
                prompt: prompt,
                style: .pop,
                duration: 60
            )
        case .generateImage(let prompt):
            let imageRequest = ImageRequest(
                prompt: prompt,
                style: nil,
                width: 1024,
                height: 1024
            )
            let _: GeneratedImage = try await apiClient.post(.imageGenerate, body: imageRequest)
        case .generateVideo(let prompt):
            let videoRequest = VideoRequest(prompt: prompt, duration: 10, style: nil)
            let _: GeneratedVideo = try await apiClient.post(.videoGenerate, body: videoRequest)
        case .openGallery:
            // Navigation handled by ViewModel
            break
        case .playTrack:
            // Playback handled by ViewModel
            break
        case .none:
            break
        }
    }

    // MARK: - Private Helpers

    private func parseAction(_ data: [String: String]) -> AgentAction? {
        guard let type = data["type"] else { return nil }
        switch type {
        case "generateMusic":
            return .generateMusic(prompt: data["prompt"] ?? "")
        case "generateImage":
            return .generateImage(prompt: data["prompt"] ?? "")
        case "generateVideo":
            return .generateVideo(prompt: data["prompt"] ?? "")
        case "openGallery":
            return .openGallery
        default:
            return .none
        }
    }
}

// MARK: - Internal Stream Types

private struct AgentStreamChunk: Codable {
    var type: String
    var content: String?
    var actionData: [String: String]?
}
