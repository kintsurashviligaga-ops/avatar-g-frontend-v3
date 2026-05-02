import Foundation

// MARK: - API Endpoints

enum Endpoint {
    static let baseURL = "https://myavatar.ge"
    static let apiBase = "\(baseURL)/api"
    static let webSocketURL = "wss://myavatar.ge/ws/agent"

    // Auth
    case login
    case register
    case refreshToken

    // Agent
    case agentChat
    case agentVoice

    // Music
    case musicGenerate
    case musicStatus(id: String)
    case stemRegenerate
    case trackMaster(id: String)

    // Image
    case imageGenerate

    // Video
    case videoGenerate

    // Gallery
    case gallery

    // User
    case userProfile
    case updateProfile

    // Jam Sessions (Phase 6)
    case jamCreate
    case jamSession(String)
    case jamEnd
    case jamStemUpload
    case jamAIFill
    case jamMerge

    // Licensing / NFT (Phase 6)
    case licenseGenerate
    case licenseMint
    case licenseTxStatus
    case licenseUpdateNFT
    case licensePurchase

    // Content Safety (Phase 6)
    case contentGuard
    case reportViolation

    var path: String {
        switch self {
        case .login:
            return "/api/auth/login"
        case .register:
            return "/api/auth/register"
        case .refreshToken:
            return "/api/auth/refresh"
        case .agentChat:
            return "/api/agent/chat"
        case .agentVoice:
            return "/api/agent/voice"
        case .musicGenerate:
            return "/api/music/generate"
        case .musicStatus(let id):
            return "/api/music/status/\(id)"
        case .stemRegenerate:
            return "/api/music/stem/regenerate"
        case .trackMaster(let id):
            return "/api/music/master/\(id)"
        case .imageGenerate:
            return "/api/image/generate"
        case .videoGenerate:
            return "/api/video/generate"
        case .gallery:
            return "/api/gallery"
        case .userProfile:
            return "/api/user/profile"
        case .updateProfile:
            return "/api/user/profile"
        case .jamCreate:
            return "/api/jam/create"
        case .jamSession(let id):
            return "/api/jam/session/\(id)"
        case .jamEnd:
            return "/api/jam/end"
        case .jamStemUpload:
            return "/api/jam/stem/upload"
        case .jamAIFill:
            return "/api/jam/stem/ai-fill"
        case .jamMerge:
            return "/api/jam/merge"
        case .licenseGenerate:
            return "/api/license/generate"
        case .licenseMint:
            return "/api/license/nft/mint"
        case .licenseTxStatus:
            return "/api/license/nft/status"
        case .licenseUpdateNFT:
            return "/api/license/nft/update"
        case .licensePurchase:
            return "/api/license/purchase"
        case .contentGuard:
            return "/api/guard/check"
        case .reportViolation:
            return "/api/guard/report"
        }
    }

    var url: URL {
        URL(string: "\(Endpoint.baseURL)\(path)")!
    }

    var method: HTTPMethod {
        switch self {
        case .login, .register, .refreshToken,
             .agentChat, .agentVoice,
             .musicGenerate, .stemRegenerate,
             .imageGenerate, .videoGenerate,
             .jamCreate, .jamEnd, .jamStemUpload, .jamAIFill, .jamMerge,
             .licenseGenerate, .licenseMint, .licenseTxStatus,
             .licenseUpdateNFT, .licensePurchase,
             .contentGuard, .reportViolation:
            return .post
        case .musicStatus, .gallery, .userProfile, .jamSession:
            return .get
        case .updateProfile:
            return .put
        case .trackMaster:
            return .post
        }
    }
}

// Plural alias used in Phase 6 modules
typealias Endpoints = Endpoint

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
}

// MARK: - API Error

enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int, message: String?)
    case decodingError(Error)
    case encodingError(Error)
    case networkError(Error)
    case unauthorized
    case notFound
    case serverError(String)
    case noData
    case streamError

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid server response"
        case .httpError(let code, let message):
            return "HTTP Error \(code): \(message ?? "Unknown error")"
        case .decodingError(let error):
            return "Data parsing error: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Request encoding error: \(error.localizedDescription)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .unauthorized:
            return "Unauthorized. Please sign in again."
        case .notFound:
            return "Resource not found"
        case .serverError(let message):
            return "Server error: \(message)"
        case .noData:
            return "No data received"
        case .streamError:
            return "Streaming error occurred"
        }
    }
}
