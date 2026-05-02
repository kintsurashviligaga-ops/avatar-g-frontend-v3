import Foundation
import Speech
import AVFoundation
import Combine

// MARK: - Speech Service

@MainActor
final class SpeechService: ObservableObject {

    static let shared = SpeechService()

    // MARK: - Published State

    @Published private(set) var transcribedText: String = ""
    @Published private(set) var isRecording: Bool = false
    @Published private(set) var languageConfidence: Float = 0.0
    @Published private(set) var authorizationStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    @Published private(set) var isGeorgianAvailable: Bool = false
    @Published private(set) var errorMessage: String?
    @Published var audioAmplitude: Float = 0.0

    // MARK: - Private Properties

    private var speechRecognizer: SFSpeechRecognizer?
    private var fallbackRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var audioEngine: AVAudioEngine
    private var synthesizer: AVSpeechSynthesizer
    private var amplitudeTimer: Timer?

    // Locales
    private let georgianLocale = Locale(identifier: "ka-GE")
    private let englishLocale = Locale(identifier: "en-US")
    private let russianLocale = Locale(identifier: "ru-RU")

    // MARK: - Init

    private init() {
        self.audioEngine = AVAudioEngine()
        self.synthesizer = AVSpeechSynthesizer()

        let georgianRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "ka-GE"))
        self.isGeorgianAvailable = georgianRecognizer?.isAvailable ?? false
        self.speechRecognizer = georgianRecognizer ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        self.fallbackRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    }

    // MARK: - Authorization

    func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                DispatchQueue.main.async {
                    self.authorizationStatus = status
                    continuation.resume(returning: status)
                }
            }
        }
    }

    func requestMicrophoneAccess() async -> Bool {
        if #available(iOS 17.0, *) {
            let status = AVAudioApplication.shared.recordPermission
            switch status {
            case .granted:
                return true
            case .denied:
                return false
            case .undetermined:
                return await AVAudioApplication.requestRecordPermission()
            @unknown default:
                return false
            }
        } else {
            return await withCheckedContinuation { continuation in
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
        }
    }

    // MARK: - Recording

    func startRecording(preferGeorgian: Bool = true) async throws {
        guard authorizationStatus == .authorized else {
            let status = await requestAuthorization()
            guard status == .authorized else {
                throw SpeechError.notAuthorized
            }
        }

        let micGranted = await requestMicrophoneAccess()
        guard micGranted else {
            throw SpeechError.microphoneAccessDenied
        }

        if isRecording {
            stopRecording()
        }

        transcribedText = ""
        errorMessage = nil

        // Choose recognizer: try Georgian first, fallback to English
        let activeRecognizer: SFSpeechRecognizer?
        if preferGeorgian && isGeorgianAvailable {
            activeRecognizer = speechRecognizer
        } else {
            // On simulator or if Georgian not available, use English
            activeRecognizer = fallbackRecognizer
            if preferGeorgian && !isGeorgianAvailable {
                errorMessage = "Georgian speech recognition is not available on this device. Using English."
            }
        }

        guard let recognizer = activeRecognizer, recognizer.isAvailable else {
            throw SpeechError.recognizerUnavailable
        }

        // Configure audio session
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord,
                                     mode: .measurement,
                                     options: [.defaultToSpeaker, .allowBluetooth])
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let request = recognitionRequest else {
            throw SpeechError.requestCreationFailed
        }

        request.shouldReportPartialResults = true
        request.taskHint = .dictation

        // Add context hints for Georgian words
        if preferGeorgian {
            request.contextualStrings = [
                "გამარჯობა", "შექმენი", "სიმღერა", "სურათი", "ვიდეო",
                "ავატარი", "მუსიკა", "დახმარება", "Agent G", "AvatarG"
            ]
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
            // Calculate amplitude
            let channelData = buffer.floatChannelData?[0]
            let frameCount = buffer.frameLength
            if let data = channelData {
                var sum: Float = 0
                for i in 0..<Int(frameCount) {
                    sum += abs(data[i])
                }
                let avg = sum / Float(frameCount)
                DispatchQueue.main.async {
                    self?.audioAmplitude = min(avg * 10, 1.0)
                }
            }
        }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }

            if let result = result {
                DispatchQueue.main.async {
                    self.transcribedText = result.bestTranscription.formattedString
                    // Estimate language confidence from transcription
                    self.languageConfidence = Float(result.bestTranscription.segments.count > 0 ? 0.8 : 0.3)
                }

                if result.isFinal {
                    DispatchQueue.main.async {
                        self.isRecording = false
                    }
                }
            }

            if let error = error {
                DispatchQueue.main.async {
                    let nsError = error as NSError
                    // Code 1110 = no speech detected - not a real error
                    if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 1110 {
                        return
                    }
                    self.errorMessage = error.localizedDescription
                    self.isRecording = false
                }
            }
        }

        audioEngine.prepare()
        try audioEngine.start()
        isRecording = true
    }

    @discardableResult
    func stopRecording() -> String {
        let finalText = transcribedText

        recognitionTask?.finish()
        recognitionTask?.cancel()
        recognitionTask = nil

        recognitionRequest?.endAudio()
        recognitionRequest = nil

        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)

        isRecording = false
        audioAmplitude = 0.0

        try? AVAudioSession.sharedInstance().setActive(false)

        return finalText
    }

    // MARK: - TTS

    func speakText(_ text: String, language: String = "ka-GE") {
        synthesizer.stopSpeaking(at: .immediate)

        let utterance = AVSpeechUtterance(string: text)

        // Try to use the requested language voice
        let voice = AVSpeechSynthesisVoice(language: language)
            ?? AVSpeechSynthesisVoice(language: "en-US")

        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        utterance.pitchMultiplier = 1.0
        utterance.volume = 0.9

        // Configure audio session for playback
        try? AVAudioSession.sharedInstance().setCategory(
            .playback,
            options: [.duckOthers]
        )
        try? AVAudioSession.sharedInstance().setActive(true)

        synthesizer.speak(utterance)
    }

    func stopSpeaking() {
        synthesizer.stopSpeaking(at: .immediate)
    }

    var isSpeaking: Bool {
        synthesizer.isSpeaking
    }

    // MARK: - Language Detection

    func detectLanguage(in text: String) -> String {
        // Simple heuristic: check for Georgian characters (Unicode range U+10D0–U+10FF)
        let georgianCharacters = text.unicodeScalars.filter { scalar in
            (0x10D0...0x10FF).contains(scalar.value)
        }
        if georgianCharacters.count > 2 {
            return "ka-GE"
        }

        // Check for Cyrillic (Russian)
        let cyrillicCharacters = text.unicodeScalars.filter { scalar in
            (0x0400...0x04FF).contains(scalar.value)
        }
        if cyrillicCharacters.count > 2 {
            return "ru-RU"
        }

        return "en-US"
    }
}

// MARK: - Speech Errors

enum SpeechError: Error, LocalizedError {
    case notAuthorized
    case microphoneAccessDenied
    case recognizerUnavailable
    case requestCreationFailed
    case audioEngineError(Error)

    var errorDescription: String? {
        switch self {
        case .notAuthorized:
            return "Speech recognition permission not granted. Please enable in Settings."
        case .microphoneAccessDenied:
            return "Microphone access denied. Please enable in Settings."
        case .recognizerUnavailable:
            return "Speech recognizer is not available. Georgian speech may require a physical device."
        case .requestCreationFailed:
            return "Failed to create speech recognition request."
        case .audioEngineError(let error):
            return "Audio engine error: \(error.localizedDescription)"
        }
    }
}
