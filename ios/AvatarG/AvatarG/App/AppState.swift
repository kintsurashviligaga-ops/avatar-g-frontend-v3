import Foundation
import SwiftUI

// MARK: - App Language

enum AppLanguage: String, CaseIterable, Codable {
    case georgian = "ka-GE"
    case english = "en-US"
    case russian = "ru-RU"

    var displayName: String {
        switch self {
        case .georgian: return "ქართული"
        case .english: return "English"
        case .russian: return "Русский"
        }
    }

    var flag: String {
        switch self {
        case .georgian: return "🇬🇪"
        case .english: return "🇺🇸"
        case .russian: return "🇷🇺"
        }
    }

    var localeIdentifier: String {
        rawValue
    }
}

// MARK: - App State

@MainActor
final class AppState: ObservableObject {

    static let shared = AppState()

    @Published var isAuthenticated: Bool = false
    @Published var currentUser: User?
    @Published var selectedTab: Int = 0
    @Published var credits: Int = 0
    @Published var userLanguage: AppLanguage = .georgian
    @Published var authToken: String?
    @Published var isLoading: Bool = false
    @Published var globalError: String?
    @Published var hasNewAgentMessage: Bool = false

    private let userDefaultsKey = "avatar_g_auth_token"
    private let languageKey = "avatar_g_language"

    private init() {
        loadPersistedState()
    }

    // MARK: - Locale

    func localeIdentifier() -> String {
        userLanguage.localeIdentifier
    }

    func greeting() -> String {
        switch userLanguage {
        case .georgian: return "გამარჯობა"
        case .english: return "Hello"
        case .russian: return "Привет"
        }
    }

    func userName() -> String {
        currentUser?.name ?? ""
    }

    func greetingWithName() -> String {
        let name = userName()
        let base = greeting()
        if name.isEmpty { return base }
        return "\(base), \(name)"
    }

    // MARK: - Auth

    func signIn(token: String, user: User) {
        authToken = token
        currentUser = user
        isAuthenticated = true
        credits = user.credits
        userLanguage = AppLanguage(rawValue: user.preferredLanguage) ?? .georgian

        // Persist token
        UserDefaults.standard.set(token, forKey: userDefaultsKey)

        // Inject into API client
        APIClient.shared.setAuthToken(token)
        WebSocketService.shared.setAuthToken(token)
    }

    func signOut() {
        authToken = nil
        currentUser = nil
        isAuthenticated = false
        credits = 0

        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
        APIClient.shared.setAuthToken(nil)
    }

    func updateCredits(_ newAmount: Int) {
        credits = newAmount
        currentUser?.credits = newAmount
    }

    func deductCredits(_ amount: Int) {
        credits = max(0, credits - amount)
        currentUser?.credits = credits
    }

    func setLanguage(_ language: AppLanguage) {
        userLanguage = language
        UserDefaults.standard.set(language.rawValue, forKey: languageKey)
    }

    // MARK: - Navigation

    func navigateTo(tab: Int) {
        selectedTab = tab
    }

    func navigateToAgentG() {
        selectedTab = 1
    }

    func navigateToStudio() {
        selectedTab = 2
    }

    func navigateToGallery() {
        selectedTab = 3
    }

    // MARK: - Persistence

    private func loadPersistedState() {
        if let savedToken = UserDefaults.standard.string(forKey: userDefaultsKey) {
            authToken = savedToken
            APIClient.shared.setAuthToken(savedToken)
            // In production, validate token and fetch user profile
        }

        if let savedLanguage = UserDefaults.standard.string(forKey: languageKey),
           let language = AppLanguage(rawValue: savedLanguage) {
            userLanguage = language
        }
    }

    // MARK: - Demo / Mock Signin

    func signInWithMockUser() {
        let mockUser = User(
            id: "mock_user_1",
            name: "გიორგი",
            email: "kintsurashviligaga@gmail.com",
            avatarURL: nil,
            credits: 500,
            subscriptionTier: .pro,
            memberSince: Date(),
            preferredLanguage: "ka-GE"
        )
        signIn(token: "mock_token_12345", user: mockUser)
    }
}
