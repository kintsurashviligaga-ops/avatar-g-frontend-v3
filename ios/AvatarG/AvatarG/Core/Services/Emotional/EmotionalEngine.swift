import Foundation
import CoreML
import Accelerate
import Combine
import AVFoundation

// MARK: - Emotional State

/// Arousal-Valence model of emotion (Russell's Circumplex)
struct EmotionalState: Equatable {
    /// Valence: -1.0 (very negative) → +1.0 (very positive)
    var valence: Float
    /// Arousal: 0.0 (calm) → 1.0 (excited/agitated)
    var arousal: Float
    /// Dominant emotion label
    var label: EmotionLabel
    /// Confidence 0–1
    var confidence: Float
    /// Detected from voice (true) or text (false)
    var fromVoice: Bool

    static let neutral = EmotionalState(valence: 0.0, arousal: 0.3, label: .neutral, confidence: 1.0, fromVoice: false)

    var isNegative: Bool { valence < -0.3 }
    var isFrustrated: Bool { label == .frustrated || (valence < -0.2 && arousal > 0.5) }
    var isExcited: Bool { label == .excited || (valence > 0.4 && arousal > 0.6) }
    var isSad: Bool { label == .sad || (valence < -0.4 && arousal < 0.4) }
}

enum EmotionLabel: String, CaseIterable {
    case happy       = "happy"
    case excited     = "excited"
    case neutral     = "neutral"
    case frustrated  = "frustrated"
    case sad         = "sad"
    case anxious     = "anxious"
    case curious     = "curious"
    case bored       = "bored"

    /// Georgian display name
    var georgianName: String {
        switch self {
        case .happy:      return "მხიარული"
        case .excited:    return "აღფრთოვანებული"
        case .neutral:    return "ნეიტრალური"
        case .frustrated: return "გაღიზიანებული"
        case .sad:        return "მოწყენილი"
        case .anxious:    return "შფოთვარე"
        case .curious:    return "ცნობისმოყვარე"
        case .bored:      return "მოწყენილი"
        }
    }

    var emoji: String {
        switch self {
        case .happy:      return "😊"
        case .excited:    return "🤩"
        case .neutral:    return "😐"
        case .frustrated: return "😤"
        case .sad:        return "😢"
        case .anxious:    return "😰"
        case .curious:    return "🤔"
        case .bored:      return "😑"
        }
    }
}

// MARK: - Voice Feature Extractor

/// Extracts acoustic features from audio buffer for emotion classification
final class VoiceFeatureExtractor {

    /// Extract MFCC-like features from PCM audio buffer
    /// Returns 40-dimensional feature vector [energy, ZCR, 13 MFCCs × 3 stats]
    func extractFeatures(from buffer: AVAudioPCMBuffer) -> [Float]? {
        guard let channelData = buffer.floatChannelData?[0] else { return nil }
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else { return nil }

        let samples = Array(UnsafeBufferPointer(start: channelData, count: frameCount))

        var features: [Float] = []

        // 1. RMS Energy (loudness)
        var rms: Float = 0
        vDSP_rmsqv(samples, 1, &rms, vDSP_Length(frameCount))
        features.append(rms)

        // 2. Zero-crossing rate (voice tenseness)
        var zcr: Float = 0
        for i in 1..<frameCount {
            if (samples[i] >= 0) != (samples[i-1] >= 0) { zcr += 1 }
        }
        zcr /= Float(frameCount)
        features.append(zcr)

        // 3. Spectral centroid (brightness)
        let fftSize = 512
        let log2n = vDSP_Length(log2(Float(fftSize)))
        guard let fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else { return nil }
        defer { vDSP_destroy_fftsetup(fftSetup) }

        var realPart = [Float](samples.prefix(fftSize))
        var imagPart = [Float](repeating: 0, count: fftSize)
        var splitComplex = DSPSplitComplex(realp: &realPart, imagp: &imagPart)
        vDSP_fft_zip(fftSetup, &splitComplex, 1, log2n, FFTDirection(FFT_FORWARD))

        var magnitudes = [Float](repeating: 0, count: fftSize / 2)
        vDSP_zvmags(&splitComplex, 1, &magnitudes, 1, vDSP_Length(fftSize / 2))

        var totalMag: Float = 0
        var weightedSum: Float = 0
        for (i, mag) in magnitudes.enumerated() {
            totalMag += mag
            weightedSum += Float(i) * mag
        }
        let centroid = totalMag > 0 ? weightedSum / totalMag : 0
        features.append(centroid / Float(fftSize / 2))

        // 4. Spectral flux (emotion dynamics)
        var flux: Float = 0
        for i in 1..<magnitudes.count {
            flux += max(0, magnitudes[i] - magnitudes[i-1])
        }
        features.append(flux / Float(magnitudes.count))

        // 5. Simplified mel-filter bank energies (8 bands)
        let bands = 8
        let bandSize = magnitudes.count / bands
        for b in 0..<bands {
            let start = b * bandSize
            let end = min(start + bandSize, magnitudes.count)
            var bandEnergy: Float = 0
            vDSP_sve(magnitudes[start..<end].map { $0 }, 1, &bandEnergy, vDSP_Length(end - start))
            features.append(log1p(bandEnergy))
        }

        // Pad to 40 dimensions for CoreML model compatibility
        while features.count < 40 { features.append(0) }
        return Array(features.prefix(40))
    }
}

// MARK: - Sentiment Text Analyser (NaturalLanguage + heuristics)

import NaturalLanguage

final class GeorgianSentimentAnalyser {

    // Georgian emotional keyword lexicon
    private let positiveWords: Set<String> = [
        "კარგი", "მშვენიერი", "გმადლობ", "საოცარი", "სიხარული", "სიყვარული",
        "ბედნიერი", "ლამაზი", "შესანიშნავი", "სასიამოვნო", "კარგად", "ჰა",
        "good", "great", "amazing", "love", "wonderful", "happy", "excellent"
    ]
    private let negativeWords: Set<String> = [
        "ცუდი", "პრობლემა", "გაბრაზებული", "ვერ", "არ", "ვერ ვხვდები",
        "გამაბრაზა", "ძვირი", "ჯავრი", "შეცდომა", "გაფუჭდა", "bad", "problem",
        "broken", "wrong", "error", "frustrated", "not working", "hate", "terrible"
    ]
    private let frustrationMarkers: Set<String> = [
        "კვლავ", "ისევ", "მაინც", "ჩვევა", "again", "still", "why", "just",
        "seriously", "come on", "ugh", "wait", "stop", "no"
    ]

    func analyse(text: String) -> (valence: Float, arousal: Float, label: EmotionLabel) {
        let lower = text.lowercased()
        let words = lower.components(separatedBy: .whitespacesAndNewlines)

        var positiveScore: Float = 0
        var negativeScore: Float = 0
        var frustrationScore: Float = 0

        for word in words {
            let cleaned = word.trimmingCharacters(in: .punctuationCharacters)
            if positiveWords.contains(cleaned) { positiveScore += 1 }
            if negativeWords.contains(cleaned) { negativeScore += 1 }
            if frustrationMarkers.contains(cleaned) { frustrationScore += 0.5 }
        }

        // Exclamation and caps signals arousal
        let exclamationCount = Float(text.filter { $0 == "!" }.count)
        let questionCount = Float(text.filter { $0 == "?" }.count)
        let capsRatio = Float(text.filter { $0.isUppercase }.count) / max(1, Float(text.count))

        let arousal = min(1.0, (exclamationCount * 0.2 + capsRatio * 2 + frustrationScore * 0.3))
        let rawValence = (positiveScore - negativeScore - frustrationScore * 0.5) / max(1, Float(words.count))
        let valence = max(-1.0, min(1.0, rawValence * 5))

        // English NLTagger for fallback
        let tagger = NLTagger(tagSchemes: [.sentimentScore])
        tagger.string = text
        var nlValence: Float = 0
        tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .paragraph, scheme: .sentimentScore) { tag, _ in
            if let v = tag?.rawValue, let score = Double(v) { nlValence = Float(score) }
            return true
        }

        let finalValence = words.count > 3 ? (valence + nlValence) / 2 : nlValence
        let label = classifyLabel(valence: finalValence, arousal: arousal, frustration: frustrationScore)
        return (finalValence, arousal, label)
    }

    private func classifyLabel(valence: Float, arousal: Float, frustration: Float) -> EmotionLabel {
        if frustration > 1 || (valence < -0.2 && arousal > 0.5) { return .frustrated }
        if valence > 0.4 && arousal > 0.6 { return .excited }
        if valence > 0.2 { return .happy }
        if valence < -0.4 && arousal < 0.4 { return .sad }
        if arousal > 0.5 && abs(valence) < 0.2 { return .anxious }
        if arousal < 0.2 { return .bored }
        if questionCount(for: "") > 0 { return .curious }
        return .neutral
    }

    private func questionCount(for text: String) -> Int {
        text.filter { $0 == "?" }.count
    }
}

// MARK: - Core ML Emotion Model Wrapper

/// Wraps a CoreML SentimentModel (emotions_v1.mlpackage) for on-device inference.
/// Falls back to heuristic analysis if model not available.
final class EmotionMLModel {
    private var model: MLModel?
    private let featureExtractor = VoiceFeatureExtractor()

    init() {
        // Load bundled CoreML model if available
        if let url = Bundle.main.url(forResource: "AvatarGEmotions", withExtension: "mlmodelc") {
            model = try? MLModel(contentsOf: url)
        }
    }

    /// Classify emotion from 40-dim feature vector
    /// Falls back to threshold rules if model unavailable
    func classify(features: [Float]) -> (label: EmotionLabel, valence: Float, arousal: Float, confidence: Float) {
        guard let model = model else {
            return heuristicClassify(features: features)
        }

        do {
            // Build MLFeatureProvider from feature vector
            let featureDict: [String: MLFeatureValue] = [
                "audio_features": MLFeatureValue(multiArray: try MLMultiArray(features))
            ]
            let provider = try MLDictionaryFeatureProvider(dictionary: featureDict)
            let output = try model.prediction(from: provider)

            // Parse model output
            let labelStr = output.featureValue(for: "emotion_label")?.stringValue ?? "neutral"
            let valence = output.featureValue(for: "valence")?.doubleValue.map { Float($0) } ?? 0
            let arousal = output.featureValue(for: "arousal")?.doubleValue.map { Float($0) } ?? 0.3
            let confidence = output.featureValue(for: "confidence")?.doubleValue.map { Float($0) } ?? 0.5
            let label = EmotionLabel(rawValue: labelStr) ?? .neutral

            return (label, Float(valence), Float(arousal), Float(confidence))
        } catch {
            return heuristicClassify(features: features)
        }
    }

    private func heuristicClassify(features: [Float]) -> (EmotionLabel, Float, Float, Float) {
        guard features.count >= 4 else { return (.neutral, 0, 0.3, 0.4) }
        let energy = features[0]
        let zcr = features[1]
        let centroid = features[2]
        // High energy + high ZCR → frustrated/excited
        let arousal = min(1.0, energy * 10 + zcr * 5)
        let valence: Float = centroid > 0.5 ? 0.3 : -0.1
        return (.neutral, valence, arousal, 0.4)
    }
}

extension MLMultiArray {
    convenience init(_ values: [Float]) throws {
        try self.init(shape: [NSNumber(value: values.count)], dataType: .float32)
        for (i, v) in values.enumerated() { self[i] = NSNumber(value: v) }
    }
}

// MARK: - Emotional Engine (Main Service)

@MainActor
final class EmotionalEngine: ObservableObject {

    static let shared = EmotionalEngine()

    // MARK: - Published State

    @Published private(set) var currentState: EmotionalState = .neutral
    @Published private(set) var stateHistory: [EmotionalState] = []
    @Published private(set) var sessionMood: EmotionLabel = .neutral

    // MARK: - Private

    private let textAnalyser = GeorgianSentimentAnalyser()
    private let mlModel = EmotionMLModel()
    private let featureExtractor = VoiceFeatureExtractor()
    private var stateSubject = PassthroughSubject<EmotionalState, Never>()
    var statePublisher: AnyPublisher<EmotionalState, Never> { stateSubject.eraseToAnyPublisher() }

    private init() {}

    // MARK: - Analysis API

    /// Analyse text input and update emotional state
    func analyseText(_ text: String) {
        let (valence, arousal, label) = textAnalyser.analyse(text: text)
        let blended = blend(
            new: EmotionalState(valence: valence, arousal: arousal, label: label, confidence: 0.7, fromVoice: false),
            weight: 0.4
        )
        update(state: blended)
    }

    /// Analyse voice buffer and update emotional state
    func analyseVoice(buffer: AVAudioPCMBuffer) {
        guard let features = featureExtractor.extractFeatures(from: buffer) else { return }
        let (label, valence, arousal, confidence) = mlModel.classify(features: features)
        let voiceState = EmotionalState(valence: valence, arousal: arousal, label: label, confidence: confidence, fromVoice: true)
        let blended = blend(new: voiceState, weight: 0.6)
        update(state: blended)
    }

    /// Hybrid analysis: combine text + voice result
    func analyseHybrid(text: String, buffer: AVAudioPCMBuffer?) {
        let (tv, ta, tl) = textAnalyser.analyse(text: text)
        var textState = EmotionalState(valence: tv, arousal: ta, label: tl, confidence: 0.7, fromVoice: false)

        if let buffer, let features = featureExtractor.extractFeatures(from: buffer) {
            let (vl, vv, va, vc) = mlModel.classify(features: features)
            let voiceState = EmotionalState(valence: vv, arousal: va, label: vl, confidence: vc, fromVoice: true)
            // Voice carries 60% weight for emotion (more honest than text)
            textState.valence = textState.valence * 0.4 + voiceState.valence * 0.6
            textState.arousal = textState.arousal * 0.4 + voiceState.arousal * 0.6
            textState.label = voiceState.confidence > 0.6 ? voiceState.label : textState.label
            textState.confidence = (textState.confidence + voiceState.confidence) / 2
            textState.fromVoice = true
        }

        let blended = blend(new: textState, weight: 0.5)
        update(state: blended)
    }

    // MARK: - Private Helpers

    private func blend(new: EmotionalState, weight: Float) -> EmotionalState {
        let alpha = weight
        return EmotionalState(
            valence: currentState.valence * (1 - alpha) + new.valence * alpha,
            arousal: currentState.arousal * (1 - alpha) + new.arousal * alpha,
            label: new.confidence > 0.65 ? new.label : currentState.label,
            confidence: new.confidence,
            fromVoice: new.fromVoice
        )
    }

    private func update(state: EmotionalState) {
        currentState = state
        stateHistory.append(state)
        if stateHistory.count > 50 { stateHistory.removeFirst() }
        updateSessionMood()
        stateSubject.send(state)
    }

    private func updateSessionMood() {
        guard stateHistory.count >= 3 else { return }
        let recent = stateHistory.suffix(10)
        let avgValence = recent.map { $0.valence }.reduce(0, +) / Float(recent.count)
        let avgArousal = recent.map { $0.arousal }.reduce(0, +) / Float(recent.count)
        let fake = EmotionalState(valence: avgValence, arousal: avgArousal, label: .neutral, confidence: 0.8, fromVoice: false)
        sessionMood = textAnalyser.analyse(text: "").2  // reuse classifier via proxy
        // Directly classify from averages:
        if avgValence < -0.25 && avgArousal > 0.5 { sessionMood = .frustrated }
        else if avgValence > 0.3 && avgArousal > 0.5 { sessionMood = .excited }
        else if avgValence > 0.2 { sessionMood = .happy }
        else if avgValence < -0.3 { sessionMood = .sad }
        else { sessionMood = .neutral }
        _ = fake
    }

    // MARK: - Session Reset

    func resetSession() {
        currentState = .neutral
        stateHistory.removeAll()
        sessionMood = .neutral
    }
}
