import Foundation

// MARK: - Export Format

enum ExportFormat: String, CaseIterable {
    case mp3 = "mp3"
    case wav = "wav"
    case stemsZip = "stems_zip"

    var displayName: String {
        switch self {
        case .mp3: return "MP3 320kbps"
        case .wav: return "WAV (Lossless)"
        case .stemsZip: return "Stems ZIP"
        }
    }

    var fileExtension: String {
        switch self {
        case .mp3: return "mp3"
        case .wav: return "wav"
        case .stemsZip: return "zip"
        }
    }
}

// MARK: - Music API Service

@MainActor
final class MusicAPIService {

    static let shared = MusicAPIService()
    private let apiClient = APIClient.shared

    private init() {}

    // MARK: - Generate Track

    func generateTrack(prompt: String, style: MusicStyle? = nil, duration: Int = 60) async throws -> MusicTrack {
        let request = MusicGenerateRequest(
            prompt: prompt,
            style: style?.rawValue,
            duration: duration
        )

        let track: MusicTrack = try await apiClient.post(.musicGenerate, body: request)
        return track
    }

    // MARK: - Poll Status

    func getTrackStatus(trackId: String) async throws -> MusicTrack {
        let track: MusicTrack = try await apiClient.get(.musicStatus(id: trackId))
        return track
    }

    // MARK: - Poll Until Ready

    func waitForTrackReady(trackId: String, maxAttempts: Int = 30, intervalSeconds: Double = 2.0) async throws -> MusicTrack {
        var attempts = 0
        while attempts < maxAttempts {
            let track = try await getTrackStatus(trackId: trackId)
            switch track.status {
            case .ready:
                return track
            case .failed:
                throw MusicError.generationFailed
            case .generating:
                try await Task.sleep(nanoseconds: UInt64(intervalSeconds * 1_000_000_000))
                attempts += 1
            }
        }
        throw MusicError.timeout
    }

    // MARK: - Regenerate Stem

    func regenerateStem(trackId: String, stemId: String, prompt: String) async throws -> Stem {
        let request = StemRegenerateRequest(trackId: trackId, stemId: stemId, prompt: prompt)
        let stem: Stem = try await apiClient.post(.stemRegenerate, body: request)
        return stem
    }

    // MARK: - Master Track

    func masterTrack(trackId: String, settings: MasteringSettings) async throws -> URL {
        let request = MasterTrackRequest(trackId: trackId, settings: settings)
        let response: MasterTrackResponse = try await apiClient.post(.trackMaster(id: trackId), body: request)
        guard let url = URL(string: response.masterUrl) else {
            throw MusicError.invalidURL
        }
        return url
    }

    // MARK: - Export

    func exportTrack(trackId: String, format: ExportFormat, settings: MasteringSettings = .default) async throws -> URL {
        let masteredURL = try await masterTrack(trackId: trackId, settings: settings)
        return masteredURL
    }

    // MARK: - Load Gallery Tracks

    func loadTracks() async throws -> [MusicTrack] {
        let contents: [GeneratedContent] = try await apiClient.get(.gallery)
        return contents.compactMap { $0.musicTrack }
    }
}

// MARK: - Supporting Types

struct MasterTrackRequest: Codable {
    var trackId: String
    var settings: MasteringSettings
}

struct MasterTrackResponse: Codable {
    var masterUrl: String
    var format: String
    var processingTime: Double
}

// MARK: - Music Errors

enum MusicError: Error, LocalizedError {
    case generationFailed
    case timeout
    case invalidURL
    case stemNotFound
    case masteringFailed

    var errorDescription: String? {
        switch self {
        case .generationFailed:
            return "ტრეკის გენერაცია ვერ მოხერხდა. სცადეთ ხელახლა."
        case .timeout:
            return "გენერაცია ძალიან დიდ დრო იღებს. სცადეთ მოგვიანებით."
        case .invalidURL:
            return "Invalid track URL received from server."
        case .stemNotFound:
            return "Stem not found."
        case .masteringFailed:
            return "Track mastering failed."
        }
    }
}
