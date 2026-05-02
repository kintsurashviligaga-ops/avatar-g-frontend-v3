import Foundation
import SwiftUI

// MARK: - Agent Personality

struct AgentPersonality: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let georgianName: String
    let description: String
    let georgianDescription: String
    let icon: String
    let accentColor: String           // hex
    let isPremium: Bool

    // Behavioural parameters
    var responseLength: ResponseLength
    var humorLevel: Float             // 0.0 (none) → 1.0 (very humorous)
    var formalityLevel: Float         // 0.0 (casual) → 1.0 (formal)
    var empathyLevel: Float           // 0.0 (terse) → 1.0 (very empathetic)
    var creativityBias: Float         // 0.0 (factual) → 1.0 (highly creative)
    var ttsVoiceRate: Float           // AVSpeechUtterance rate 0.4–0.6
    var ttsVoicePitch: Float          // 0.8–1.2
    var systemPromptSuffix: String    // appended to every Agent G system prompt

    enum ResponseLength: String, Codable, CaseIterable {
        case concise   = "concise"
        case balanced  = "balanced"
        case detailed  = "detailed"
    }

    // MARK: - Built-in Personalities

    static let professionalAssistant = AgentPersonality(
        id: "professional",
        name: "Professional Assistant",
        georgianName: "პროფესიონალური ასისტენტი",
        description: "Precise, formal, task-focused. Ideal for business and productivity.",
        georgianDescription: "ზუსტი, ფორმალური, ამოცანაზე ორიენტირებული. იდეალური ბიზნეს და პროდუქტიულობისთვის.",
        icon: "briefcase.fill",
        accentColor: "#00d4ff",
        isPremium: false,
        responseLength: .balanced,
        humorLevel: 0.1,
        formalityLevel: 0.85,
        empathyLevel: 0.4,
        creativityBias: 0.3,
        ttsVoiceRate: 0.52,
        ttsVoicePitch: 1.0,
        systemPromptSuffix: "Be concise, professional and accurate. Avoid informal language."
    )

    static let creativePartner = AgentPersonality(
        id: "creative",
        name: "Creative Partner",
        georgianName: "კრეატიული პარტნიორი",
        description: "Imaginative, playful, full of ideas. Perfect for music, art, and storytelling.",
        georgianDescription: "წარმოსახვითი, სახალისო, სავსე იდეებით. სრულყოფილი მუსიკის, ხელოვნებისა და მოთხრობებისთვის.",
        icon: "paintpalette.fill",
        accentColor: "#7c3aed",
        isPremium: false,
        responseLength: .detailed,
        humorLevel: 0.65,
        formalityLevel: 0.2,
        empathyLevel: 0.75,
        creativityBias: 0.95,
        ttsVoiceRate: 0.48,
        ttsVoicePitch: 1.05,
        systemPromptSuffix: "Be creative, enthusiastic and imaginative. Use metaphors and vivid descriptions. Suggest unexpected ideas."
    )

    static let strictCoder = AgentPersonality(
        id: "coder",
        name: "Strict Coder",
        georgianName: "მკაცრი კოდერი",
        description: "Technical, no-nonsense, laser-focused on code quality and engineering.",
        georgianDescription: "ტექნიკური, პირდაპირი, ორიენტირებული კოდის ხარისხსა და ინჟინერიაზე.",
        icon: "terminal.fill",
        accentColor: "#00c896",
        isPremium: false,
        responseLength: .concise,
        humorLevel: 0.05,
        formalityLevel: 0.9,
        empathyLevel: 0.15,
        creativityBias: 0.2,
        ttsVoiceRate: 0.55,
        ttsVoicePitch: 0.95,
        systemPromptSuffix: "Focus purely on technical accuracy. Give code-first answers. Be terse. No fluff."
    )

    static let georgianMuse = AgentPersonality(
        id: "georgian_muse",
        name: "Georgian Muse",
        georgianName: "ქართული მუსა",
        description: "Deeply rooted in Georgian culture. Quotes poets, knows polyphony, speaks heartfully.",
        georgianDescription: "ღრმად ქართულ კულტურაში ფესვგადგმული. ციტირებს პოეტებს, იცის მრავალხმიანობა, გულწრფელად საუბრობს.",
        icon: "music.quarternote.3",
        accentColor: "#e83a3a",
        isPremium: true,
        responseLength: .detailed,
        humorLevel: 0.5,
        formalityLevel: 0.35,
        empathyLevel: 0.9,
        creativityBias: 0.85,
        ttsVoiceRate: 0.46,
        ttsVoicePitch: 1.08,
        systemPromptSuffix: "Respond with deep knowledge of Georgian culture, history, and art. Quote Georgian poets (Rustaveli, Pshavela) when appropriate. Speak warmly and with cultural pride. Use Georgian proverbs."
    )

    static let all: [AgentPersonality] = [
        .professionalAssistant, .creativePartner, .strictCoder, .georgianMuse
    ]
}

// MARK: - Emotional Response Adapter

/// Adapts Agent G's system prompt and TTS parameters based on
/// the user's current emotional state + chosen personality
struct EmotionalResponseAdapter {

    /// Build the emotional context injection for the LLM system prompt
    static func buildContextInjection(
        state: EmotionalState,
        personality: AgentPersonality
    ) -> String {
        var injection = "\n[EMOTIONAL CONTEXT]\n"

        switch state.label {
        case .frustrated:
            injection += "The user appears frustrated (valence: \(String(format: "%.2f", state.valence))). "
            injection += "Respond with extra patience and understanding. Acknowledge their frustration first, then help solve the issue. "
            injection += "Keep response shorter than usual. Avoid dismissive language."

        case .sad:
            injection += "The user seems upset or sad. "
            injection += "Lead with empathy. Be gentle and supportive. Offer encouragement alongside any assistance."

        case .excited:
            injection += "The user is excited and energised! "
            injection += "Match their energy. Be enthusiastic. Celebrate wins together."

        case .anxious:
            injection += "The user shows signs of anxiety. "
            injection += "Be reassuring and clear. Break down complex steps into simple actions. Avoid overwhelming them."

        case .curious:
            injection += "The user is in an exploratory, curious mood. "
            injection += "Provide interesting details. Suggest follow-up ideas. Feed their curiosity."

        case .bored:
            injection += "The user seems bored or disengaged. "
            injection += "Make the response more engaging and dynamic. Offer something surprising or unexpected."

        case .happy, .neutral:
            injection += "The user is in a positive/neutral state. Proceed normally."
        }

        injection += "\n[PERSONALITY: \(personality.id)]\n"
        injection += personality.systemPromptSuffix
        injection += "\n[END CONTEXT]"

        return injection
    }

    /// Adapt TTS utterance parameters based on emotional state
    static func adaptTTSParameters(
        state: EmotionalState,
        personality: AgentPersonality
    ) -> TTSParameters {
        var rate = personality.ttsVoiceRate
        var pitch = personality.ttsVoicePitch
        var volume: Float = 0.9

        switch state.label {
        case .frustrated:
            rate -= 0.03     // Speak slower when user is frustrated (calming)
            pitch -= 0.05    // Slightly lower pitch (grounding)
        case .excited:
            rate += 0.02     // Match excitement a bit
            pitch += 0.03
        case .sad:
            rate -= 0.04     // Slow, gentle
            pitch -= 0.03
            volume = 0.8
        case .anxious:
            rate -= 0.02     // Steady, calm pace
        default:
            break
        }

        return TTSParameters(
            rate: max(0.38, min(0.62, rate)),
            pitch: max(0.8, min(1.2, pitch)),
            volume: volume
        )
    }
}

struct TTSParameters {
    var rate: Float
    var pitch: Float
    var volume: Float
}

// MARK: - Personality Manager Service

@MainActor
final class PersonalityManager: ObservableObject {

    static let shared = PersonalityManager()

    @Published private(set) var activePersonality: AgentPersonality = .professionalAssistant
    @Published private(set) var availablePersonalities: [AgentPersonality] = AgentPersonality.all

    private let storageKey = "avatarg_active_personality"

    private init() { loadSavedPersonality() }

    func setPersonality(_ personality: AgentPersonality) {
        guard !personality.isPremium || AppState.shared.isPremiumUser else { return }
        activePersonality = personality
        UserDefaults.standard.set(personality.id, forKey: storageKey)
    }

    func buildSystemPrompt(base: String, emotionalState: EmotionalState) -> String {
        let contextInjection = EmotionalResponseAdapter.buildContextInjection(
            state: emotionalState,
            personality: activePersonality
        )
        return base + contextInjection
    }

    func ttsParameters(for state: EmotionalState) -> TTSParameters {
        EmotionalResponseAdapter.adaptTTSParameters(state: state, personality: activePersonality)
    }

    private func loadSavedPersonality() {
        guard let savedId = UserDefaults.standard.string(forKey: storageKey),
              let found = AgentPersonality.all.first(where: { $0.id == savedId }) else { return }
        activePersonality = found
    }
}

// MARK: - Personality Picker View

struct PersonalityPickerView: View {
    @ObservedObject var manager = PersonalityManager.shared
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            ZStack {
                Color(hex: "#0a0a0f").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 16) {
                        Text("Agent G Personality")
                            .font(.system(.title2, design: .rounded, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.top, 8)

                        Text("Choose how Agent G speaks and responds to you")
                            .font(.system(.subheadline))
                            .foregroundColor(.white.opacity(0.55))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)

                        ForEach(manager.availablePersonalities) { personality in
                            PersonalityCard(
                                personality: personality,
                                isActive: manager.activePersonality.id == personality.id,
                                isPremiumUser: appState.isPremiumUser
                            ) {
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                                    manager.setPersonality(personality)
                                }
                                if !personality.isPremium { dismiss() }
                            }
                        }

                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal, 20)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(Color(hex: "#00d4ff"))
                }
            }
        }
    }
}

private struct PersonalityCard: View {
    let personality: AgentPersonality
    let isActive: Bool
    let isPremiumUser: Bool
    let action: () -> Void

    @State private var isPressed = false

    var accentColor: Color { Color(hex: personality.accentColor) }
    var isLocked: Bool { personality.isPremium && !isPremiumUser }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                // Icon
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 52, height: 52)
                    Image(systemName: personality.icon)
                        .font(.system(size: 22))
                        .foregroundColor(accentColor)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(personality.georgianName)
                            .font(.system(.body, design: .rounded, weight: .semibold))
                            .foregroundColor(.white)
                        if isLocked {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 11))
                                .foregroundColor(.yellow)
                        }
                        if personality.isPremium {
                            Text("PRO")
                                .font(.system(size: 9, weight: .black))
                                .foregroundColor(.black)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.yellow)
                                .cornerRadius(4)
                        }
                    }
                    Text(personality.georgianDescription)
                        .font(.system(.caption))
                        .foregroundColor(.white.opacity(0.5))
                        .lineLimit(2)
                }

                Spacer()

                if isActive {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(accentColor)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(isActive ? 0.06 : 0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(isActive ? accentColor.opacity(0.5) : Color.white.opacity(0.08), lineWidth: 1)
                    )
            )
            .scaleEffect(isPressed ? 0.97 : 1.0)
        }
        .buttonStyle(.plain)
        .disabled(isLocked)
        .opacity(isLocked ? 0.6 : 1.0)
        ._onButtonGesture(pressing: { isPressed = $0 }, perform: {})
    }
}

// MARK: - Emotion State Indicator (compact UI widget)

struct EmotionStateIndicator: View {
    let state: EmotionalState

    var body: some View {
        HStack(spacing: 6) {
            Text(state.label.emoji)
                .font(.system(size: 14))
            Text(state.label.georgianName)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white.opacity(0.55))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(Color.white.opacity(0.06))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
        )
    }
}

// Color hex init helper (reuse if not already in DesignSystem)
private extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6: (a, r, g, b) = (255, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)
    }
}

// AppState premium check stub (matches AppState.swift)
private extension AppState {
    var isPremiumUser: Bool { credits > 100 }  // placeholder — replace with real tier check
}
