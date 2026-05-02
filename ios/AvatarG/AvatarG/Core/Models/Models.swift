import Foundation

// MARK: - User & Auth

struct User: Codable, Identifiable {
    let id: String
    var name: String
    var email: String
    var avatarURL: URL?
    var credits: Int
    var subscriptionTier: SubscriptionTier
    var memberSince: Date
    var preferredLanguage: String

    enum SubscriptionTier: String, Codable {
        case starter = "starter"
        case pro = "pro"
        case studio = "studio"

        var displayName: String {
            switch self {
            case .starter: return "Starter"
            case .pro: return "Pro"
            case .studio: return "Studio"
            }
        }

        var color: String {
            switch self {
            case .starter: return "#00c896"
            case .pro: return "#00d4ff"
            case .studio: return "#7c3aed"
            }
        }
    }
}

enum AuthState: Equatable {
    case unauthenticated
    case authenticating
    case authenticated(User)
    case error(String)

    static func == (lhs: AuthState, rhs: AuthState) -> Bool {
        switch (lhs, rhs) {
        case (.unauthenticated, .unauthenticated): return true
        case (.authenticating, .authenticating): return true
        case (.authenticated(let a), .authenticated(let b)): return a.id == b.id
        case (.error(let a), .error(let b)): return a == b
        default: return false
        }
    }
}

// MARK: - Chat

struct ChatMessage: Identifiable, Codable {
    let id: String
    var role: MessageRole
    var content: String
    var timestamp: Date
    var attachments: [MessageAttachment]
    var isStreaming: Bool

    init(id: String = UUID().uuidString,
         role: MessageRole,
         content: String,
         timestamp: Date = Date(),
         attachments: [MessageAttachment] = [],
         isStreaming: Bool = false) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
        self.attachments = attachments
        self.isStreaming = isStreaming
    }

    enum MessageRole: String, Codable {
        case user
        case agent
        case system
    }
}

struct MessageAttachment: Identifiable, Codable {
    let id: String
    var type: AttachmentType
    var url: URL?
    var previewURL: URL?
    var localData: Data?
    var musicTrack: MusicTrack?
    var generatedImage: GeneratedImage?
    var generatedVideo: GeneratedVideo?

    init(id: String = UUID().uuidString,
         type: AttachmentType,
         url: URL? = nil,
         previewURL: URL? = nil,
         localData: Data? = nil,
         musicTrack: MusicTrack? = nil,
         generatedImage: GeneratedImage? = nil,
         generatedVideo: GeneratedVideo? = nil) {
        self.id = id
        self.type = type
        self.url = url
        self.previewURL = previewURL
        self.localData = localData
        self.musicTrack = musicTrack
        self.generatedImage = generatedImage
        self.generatedVideo = generatedVideo
    }

    enum AttachmentType: String, Codable {
        case image
        case audio
        case video
        case musicTrack
    }
}

// MARK: - Music

struct MusicTrack: Identifiable, Codable, Equatable {
    let id: String
    var title: String
    var prompt: String
    var stems: [Stem]
    var duration: Double
    var status: TrackStatus
    var audioURL: URL?
    var coverURL: URL?
    var style: MusicStyle?
    var createdAt: Date

    init(id: String = UUID().uuidString,
         title: String,
         prompt: String,
         stems: [Stem] = [],
         duration: Double = 0,
         status: TrackStatus = .generating,
         audioURL: URL? = nil,
         coverURL: URL? = nil,
         style: MusicStyle? = nil,
         createdAt: Date = Date()) {
        self.id = id
        self.title = title
        self.prompt = prompt
        self.stems = stems
        self.duration = duration
        self.status = status
        self.audioURL = audioURL
        self.coverURL = coverURL
        self.style = style
        self.createdAt = createdAt
    }

    enum TrackStatus: String, Codable {
        case generating
        case ready
        case failed

        var displayName: String {
            switch self {
            case .generating: return "გენერაცია..."
            case .ready: return "მზადაა"
            case .failed: return "შეცდომა"
            }
        }
    }

    static func == (lhs: MusicTrack, rhs: MusicTrack) -> Bool {
        lhs.id == rhs.id
    }
}

struct Stem: Identifiable, Codable {
    let id: String
    var name: String
    var type: StemType
    var audioURL: URL?
    var volume: Float
    var isMuted: Bool
    var isSolo: Bool

    init(id: String = UUID().uuidString,
         name: String,
         type: StemType,
         audioURL: URL? = nil,
         volume: Float = 1.0,
         isMuted: Bool = false,
         isSolo: Bool = false) {
        self.id = id
        self.name = name
        self.type = type
        self.audioURL = audioURL
        self.volume = volume
        self.isMuted = isMuted
        self.isSolo = isSolo
    }

    enum StemType: String, Codable, CaseIterable {
        case vocals
        case drums
        case bass
        case melody
        case harmony
        case fx

        var icon: String {
            switch self {
            case .vocals: return "🎤"
            case .drums: return "🥁"
            case .bass: return "🎸"
            case .melody: return "🎹"
            case .harmony: return "🎵"
            case .fx: return "✨"
            }
        }

        var sfSymbol: String {
            switch self {
            case .vocals: return "mic.fill"
            case .drums: return "circle.grid.3x3.fill"
            case .bass: return "waveform.path"
            case .melody: return "pianokeys"
            case .harmony: return "music.note"
            case .fx: return "sparkles"
            }
        }

        var displayName: String {
            switch self {
            case .vocals: return "ვოკალი"
            case .drums: return "დრამი"
            case .bass: return "ბასი"
            case .melody: return "მელოდია"
            case .harmony: return "ჰარმონია"
            case .fx: return "FX"
            }
        }
    }
}

enum MusicStyle: String, Codable, CaseIterable {
    case pop
    case rock
    case jazz
    case georgian_folk
    case electronic
    case hiphop

    var displayName: String {
        switch self {
        case .pop: return "Pop"
        case .rock: return "Rock"
        case .jazz: return "Jazz"
        case .georgian_folk: return "Georgian Folk"
        case .electronic: return "Electronic"
        case .hiphop: return "Hip-Hop"
        }
    }

    var emoji: String {
        switch self {
        case .pop: return "🎤"
        case .rock: return "🎸"
        case .jazz: return "🎷"
        case .georgian_folk: return "🇬🇪"
        case .electronic: return "⚡️"
        case .hiphop: return "🎧"
        }
    }
}

struct MasteringSettings: Codable {
    var loudness: Double  // -14 to -6 LUFS
    var stereoWidth: Double  // 0 to 1
    var compressionLevel: Double  // 0 to 1

    static let `default` = MasteringSettings(
        loudness: -10,
        stereoWidth: 0.7,
        compressionLevel: 0.5
    )
}

// MARK: - Generated Content

struct GeneratedImage: Identifiable, Codable {
    let id: String
    var prompt: String
    var url: URL?
    var thumbnailURL: URL?
    var createdAt: Date
    var style: String?

    init(id: String = UUID().uuidString,
         prompt: String,
         url: URL? = nil,
         thumbnailURL: URL? = nil,
         createdAt: Date = Date(),
         style: String? = nil) {
        self.id = id
        self.prompt = prompt
        self.url = url
        self.thumbnailURL = thumbnailURL
        self.createdAt = createdAt
        self.style = style
    }
}

struct GeneratedVideo: Identifiable, Codable {
    let id: String
    var prompt: String
    var videoURL: URL?
    var thumbnailURL: URL?
    var duration: Double
    var createdAt: Date

    init(id: String = UUID().uuidString,
         prompt: String,
         videoURL: URL? = nil,
         thumbnailURL: URL? = nil,
         duration: Double = 0,
         createdAt: Date = Date()) {
        self.id = id
        self.prompt = prompt
        self.videoURL = videoURL
        self.thumbnailURL = thumbnailURL
        self.duration = duration
        self.createdAt = createdAt
    }
}

// MARK: - Service Types

enum ServiceType: String, Codable, CaseIterable {
    case avatar
    case image
    case video
    case music
    case voice
    case text

    var displayName: String {
        switch self {
        case .avatar: return "ავატარი"
        case .image: return "სურათი"
        case .video: return "ვიდეო"
        case .music: return "მუსიკა"
        case .voice: return "ხმა"
        case .text: return "ტექსტი"
        }
    }

    var icon: String {
        switch self {
        case .avatar: return "person.crop.circle.fill"
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .music: return "music.note"
        case .voice: return "waveform"
        case .text: return "text.bubble.fill"
        }
    }
}

// MARK: - Agent Actions

enum AgentAction: Codable, Equatable {
    case generateMusic(prompt: String)
    case generateImage(prompt: String)
    case generateVideo(prompt: String)
    case openGallery
    case playTrack(MusicTrack)
    case none

    static func == (lhs: AgentAction, rhs: AgentAction) -> Bool {
        switch (lhs, rhs) {
        case (.generateMusic(let a), .generateMusic(let b)): return a == b
        case (.generateImage(let a), .generateImage(let b)): return a == b
        case (.generateVideo(let a), .generateVideo(let b)): return a == b
        case (.openGallery, .openGallery): return true
        case (.playTrack(let a), .playTrack(let b)): return a == b
        case (.none, .none): return true
        default: return false
        }
    }
}

// MARK: - Gallery Content

struct GeneratedContent: Identifiable, Codable {
    let id: String
    var serviceType: ServiceType
    var title: String
    var prompt: String
    var thumbnailURL: URL?
    var contentURL: URL?
    var createdAt: Date
    var musicTrack: MusicTrack?
    var generatedImage: GeneratedImage?
    var generatedVideo: GeneratedVideo?

    init(id: String = UUID().uuidString,
         serviceType: ServiceType,
         title: String,
         prompt: String,
         thumbnailURL: URL? = nil,
         contentURL: URL? = nil,
         createdAt: Date = Date(),
         musicTrack: MusicTrack? = nil,
         generatedImage: GeneratedImage? = nil,
         generatedVideo: GeneratedVideo? = nil) {
        self.id = id
        self.serviceType = serviceType
        self.title = title
        self.prompt = prompt
        self.thumbnailURL = thumbnailURL
        self.contentURL = contentURL
        self.createdAt = createdAt
        self.musicTrack = musicTrack
        self.generatedImage = generatedImage
        self.generatedVideo = generatedVideo
    }
}

// MARK: - API Models

struct AgentMessage: Codable {
    var id: String
    var type: MessageType
    var content: String
    var language: String?
    var metadata: [String: String]?

    enum MessageType: String, Codable {
        case text
        case voice
        case action
        case ping
        case pong
    }
}

enum AgentChunk {
    case text(String)
    case action(AgentAction)
    case done
}

struct AgentResponse: Codable {
    var text: String
    var detectedLanguage: String
    var suggestedAction: AgentAction?
    var messageId: String
}

struct AgentChatRequest: Codable {
    var message: String
    var context: [ContextMessage]
    var language: String
    var userId: String?

    struct ContextMessage: Codable {
        var role: String
        var content: String
    }
}

struct AuthResponse: Codable {
    var accessToken: String
    var refreshToken: String
    var user: User
}

struct MusicGenerateRequest: Codable {
    var prompt: String
    var style: String?
    var duration: Int
}

struct StemRegenerateRequest: Codable {
    var trackId: String
    var stemId: String
    var prompt: String
}

struct ImageRequest: Codable {
    var prompt: String
    var style: String?
    var width: Int
    var height: Int
}

struct VideoRequest: Codable {
    var prompt: String
    var duration: Int
    var style: String?
}
