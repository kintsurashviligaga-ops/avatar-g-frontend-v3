import Foundation
import Combine

// MARK: - Music Studio ViewModel

@MainActor
final class MusicStudioViewModel: ObservableObject {

    // MARK: - Published State

    @Published var tracks: [MusicTrack] = []
    @Published var activeGeneration: MusicTrack?
    @Published var generationProgress: Double = 0
    @Published var selectedTrack: MusicTrack?
    @Published var isGenerating: Bool = false
    @Published var errorMessage: String?
    @Published var successMessage: String?
    @Published var isLoadingTracks: Bool = false

    // MARK: - Services

    private let musicAPIService = MusicAPIService.shared
    private var pollingTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    init() {
        loadTracks()
    }

    // MARK: - Load Tracks

    func loadTracks() {
        isLoadingTracks = true
        Task {
            do {
                let loadedTracks = try await musicAPIService.loadTracks()
                tracks = loadedTracks
            } catch {
                // Use mock data if API fails
                tracks = MusicStudioViewModel.mockTracks()
            }
            isLoadingTracks = false
        }
    }

    // MARK: - Generate Track

    func generateTrack(prompt: String, style: MusicStyle = .pop, duration: Int = 60) {
        guard !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "გთხოვთ შეიყვანოთ ტრეკის აღწერა"
            return
        }

        isGenerating = true
        generationProgress = 0
        errorMessage = nil

        // Create placeholder track
        let placeholder = MusicTrack(
            title: "გენერაციაში...",
            prompt: prompt,
            stems: [],
            duration: Double(duration),
            status: .generating,
            style: style
        )
        activeGeneration = placeholder

        Task {
            do {
                // Simulate initial progress
                await simulateProgress(to: 0.2, duration: 0.5)

                let track = try await musicAPIService.generateTrack(
                    prompt: prompt,
                    style: style,
                    duration: duration
                )

                activeGeneration = track

                if track.status == .generating {
                    // Poll for completion
                    await simulateProgress(to: 0.5, duration: 1.0)
                    let finalTrack = try await pollUntilReady(trackId: track.id)
                    await simulateProgress(to: 1.0, duration: 0.3)

                    tracks.insert(finalTrack, at: 0)
                    selectedTrack = finalTrack
                    activeGeneration = nil
                    isGenerating = false
                    generationProgress = 0
                    successMessage = "✅ ტრეკი \"\(finalTrack.title)\" მზადაა!"
                } else if track.status == .ready {
                    generationProgress = 1.0
                    tracks.insert(track, at: 0)
                    selectedTrack = track
                    activeGeneration = nil
                    isGenerating = false
                    generationProgress = 0
                }
            } catch {
                errorMessage = error.localizedDescription
                activeGeneration?.status = .failed
                isGenerating = false

                // Fallback: create demo track
                let demoTrack = createDemoTrack(prompt: prompt, style: style, duration: duration)
                tracks.insert(demoTrack, at: 0)
                selectedTrack = demoTrack
                activeGeneration = nil
                generationProgress = 0
            }
        }
    }

    // MARK: - Poll Generation Status

    func pollGenerationStatus(trackId: String) {
        pollingTask?.cancel()
        pollingTask = Task {
            do {
                let finalTrack = try await pollUntilReady(trackId: trackId)
                if let idx = tracks.firstIndex(where: { $0.id == trackId }) {
                    tracks[idx] = finalTrack
                }
                if activeGeneration?.id == trackId {
                    activeGeneration = nil
                    isGenerating = false
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func pollUntilReady(trackId: String) async throws -> MusicTrack {
        var attempts = 0
        let maxAttempts = 30

        while attempts < maxAttempts {
            try await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds

            if Task.isCancelled { throw CancellationError() }

            let track = try await musicAPIService.getTrackStatus(trackId: trackId)

            // Update progress
            let progress = 0.3 + Double(attempts) / Double(maxAttempts) * 0.7
            generationProgress = min(progress, 0.95)

            switch track.status {
            case .ready:
                return track
            case .failed:
                throw MusicError.generationFailed
            case .generating:
                attempts += 1
            }
        }
        throw MusicError.timeout
    }

    private func simulateProgress(to target: Double, duration: Double) async {
        let steps = 10
        let stepDelay = duration / Double(steps)
        let stepSize = (target - generationProgress) / Double(steps)

        for _ in 0..<steps {
            try? await Task.sleep(nanoseconds: UInt64(stepDelay * 1_000_000_000))
            generationProgress = min(generationProgress + stepSize, target)
        }
    }

    // MARK: - Stem Operations

    func regenerateStem(stemId: String, prompt: String) {
        guard let track = selectedTrack else { return }

        Task {
            do {
                let newStem = try await musicAPIService.regenerateStem(
                    trackId: track.id,
                    stemId: stemId,
                    prompt: prompt
                )
                updateStem(trackId: track.id, stem: newStem)
                successMessage = "✅ Stem regenerated"
            } catch {
                // Demo: show updated stem
                if let idx = selectedTrack?.stems.firstIndex(where: { $0.id == stemId }) {
                    selectedTrack?.stems[idx].name = "Regenerated Stem"
                }
                errorMessage = "Could not regenerate stem via API: \(error.localizedDescription)"
            }
        }
    }

    func updateStemVolume(stemId: String, volume: Float) {
        guard let trackIdx = selectedTrackIndex else { return }
        if let stemIdx = tracks[trackIdx].stems.firstIndex(where: { $0.id == stemId }) {
            tracks[trackIdx].stems[stemIdx].volume = volume
            // Sync selected track
            if selectedTrack?.id == tracks[trackIdx].id {
                selectedTrack = tracks[trackIdx]
            }
        }
    }

    func toggleStemMute(stemId: String) {
        guard let trackIdx = selectedTrackIndex else { return }
        if let stemIdx = tracks[trackIdx].stems.firstIndex(where: { $0.id == stemId }) {
            tracks[trackIdx].stems[stemIdx].isMuted.toggle()
            if selectedTrack?.id == tracks[trackIdx].id {
                selectedTrack = tracks[trackIdx]
            }
        }
    }

    func toggleStemSolo(stemId: String) {
        guard let trackIdx = selectedTrackIndex else { return }
        let isCurrentlySolo = tracks[trackIdx].stems.first(where: { $0.id == stemId })?.isSolo ?? false

        // Unsolo all
        for stemIdx in tracks[trackIdx].stems.indices {
            tracks[trackIdx].stems[stemIdx].isSolo = false
        }

        // Solo this one if not already
        if !isCurrentlySolo {
            if let stemIdx = tracks[trackIdx].stems.firstIndex(where: { $0.id == stemId }) {
                tracks[trackIdx].stems[stemIdx].isSolo = true
            }
        }

        if selectedTrack?.id == tracks[trackIdx].id {
            selectedTrack = tracks[trackIdx]
        }
    }

    // MARK: - Master & Export

    func masterAndExport(format: ExportFormat) async throws -> URL {
        guard let track = selectedTrack else {
            throw MusicError.generationFailed
        }

        let settings = MasteringSettings.default
        let url = try await musicAPIService.masterTrack(trackId: track.id, settings: settings)
        return url
    }

    // MARK: - Helpers

    private var selectedTrackIndex: Int? {
        guard let selectedTrack = selectedTrack else { return nil }
        return tracks.firstIndex(where: { $0.id == selectedTrack.id })
    }

    private func updateStem(trackId: String, stem: Stem) {
        if let trackIdx = tracks.firstIndex(where: { $0.id == trackId }) {
            if let stemIdx = tracks[trackIdx].stems.firstIndex(where: { $0.id == stem.id }) {
                tracks[trackIdx].stems[stemIdx] = stem
            }
            if selectedTrack?.id == trackId {
                selectedTrack = tracks[trackIdx]
            }
        }
    }

    // MARK: - Mock Data

    private func createDemoTrack(prompt: String, style: MusicStyle, duration: Int) -> MusicTrack {
        let stems = Stem.StemType.allCases.map { type in
            Stem(name: type.displayName, type: type, volume: 0.8)
        }
        return MusicTrack(
            title: extractTitle(from: prompt),
            prompt: prompt,
            stems: stems,
            duration: Double(duration),
            status: .ready,
            style: style
        )
    }

    private func extractTitle(from prompt: String) -> String {
        let words = prompt.split(separator: " ")
        let titleWords = words.prefix(3).map(String.init)
        return titleWords.joined(separator: " ").capitalized
    }

    static func mockTracks() -> [MusicTrack] {
        let stems1 = Stem.StemType.allCases.map { type in
            Stem(name: type.displayName, type: type, volume: 0.8)
        }
        let stems2 = [Stem.StemType.vocals, .drums, .melody].map { type in
            Stem(name: type.displayName, type: type, volume: 0.75)
        }

        return [
            MusicTrack(
                title: "Summer Vibes",
                prompt: "Chill summer pop with Georgian vocals",
                stems: stems1,
                duration: 120,
                status: .ready,
                style: .pop
            ),
            MusicTrack(
                title: "Georgian Folk Fusion",
                prompt: "Traditional Georgian polyphony meets electronic beats",
                stems: stems2,
                duration: 90,
                status: .ready,
                style: .georgian_folk
            ),
            MusicTrack(
                title: "Midnight Jazz",
                prompt: "Late night jazz with saxophone and piano",
                stems: stems1,
                duration: 180,
                status: .ready,
                style: .jazz
            ),
        ]
    }
}
