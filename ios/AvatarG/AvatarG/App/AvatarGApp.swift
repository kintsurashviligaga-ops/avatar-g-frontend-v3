import SwiftUI

@main
struct AvatarGApp: App {

    @StateObject private var appState = AppState.shared

    init() {
        configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if appState.isAuthenticated {
                    ContentView()
                        .environmentObject(appState)
                        .preferredColorScheme(.dark)
                } else {
                    OnboardingView()
                        .environmentObject(appState)
                        .preferredColorScheme(.dark)
                }
            }
            .animation(.easeInOut(duration: 0.4), value: appState.isAuthenticated)
            .onAppear {
                // Configure locale
                configureLocale()
            }
        }
    }

    // MARK: - Configuration

    private func configureAppearance() {
        // Navigation bar appearance
        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithTransparentBackground()
        navAppearance.backgroundColor = UIColor(AvatarGColors.spaceVoid).withAlphaComponent(0.9)
        navAppearance.titleTextAttributes = [
            .foregroundColor: UIColor.white,
            .font: UIFont.systemFont(ofSize: 18, weight: .semibold)
        ]
        navAppearance.largeTitleTextAttributes = [
            .foregroundColor: UIColor.white,
            .font: UIFont.systemFont(ofSize: 34, weight: .bold)
        ]
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().compactAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        UINavigationBar.appearance().tintColor = UIColor(AvatarGColors.cyanBase)

        // Tab bar appearance
        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithTransparentBackground()
        tabAppearance.backgroundColor = UIColor(AvatarGColors.spaceDeep).withAlphaComponent(0.95)
        tabAppearance.stackedLayoutAppearance.normal.iconColor = UIColor(AvatarGColors.textTertiary)
        tabAppearance.stackedLayoutAppearance.selected.iconColor = UIColor(AvatarGColors.cyanBase)
        tabAppearance.stackedLayoutAppearance.normal.titleTextAttributes = [
            .foregroundColor: UIColor(AvatarGColors.textTertiary)
        ]
        tabAppearance.stackedLayoutAppearance.selected.titleTextAttributes = [
            .foregroundColor: UIColor(AvatarGColors.cyanBase)
        ]
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance

        // Text field appearance
        UITextField.appearance().tintColor = UIColor(AvatarGColors.cyanBase)
        UITextView.appearance().tintColor = UIColor(AvatarGColors.cyanBase)
    }

    private func configureLocale() {
        // Georgian locale setup - just informational, iOS handles fonts automatically
        // Georgian Mkhedruli script is natively supported
    }
}

// MARK: - Onboarding View

struct OnboardingView: View {
    @EnvironmentObject var appState: AppState
    @State private var showLogin = false
    @State private var logoScale: CGFloat = 0.8
    @State private var textOpacity: Double = 0

    var body: some View {
        ZStack {
            // Background
            AvatarGColors.spaceVoid.ignoresSafeArea()

            // Animated gradient orbs
            ZStack {
                Circle()
                    .fill(AvatarGColors.cyanBase.opacity(0.08))
                    .frame(width: 300, height: 300)
                    .offset(x: -80, y: -200)
                    .blur(radius: 60)

                Circle()
                    .fill(AvatarGColors.violetBase.opacity(0.1))
                    .frame(width: 250, height: 250)
                    .offset(x: 100, y: 100)
                    .blur(radius: 60)
            }

            VStack(spacing: AvatarGSpacing.xl) {
                Spacer()

                // Logo & Brand
                VStack(spacing: AvatarGSpacing.md) {
                    ZStack {
                        Circle()
                            .fill(AvatarGColors.gradientCyanViolet)
                            .frame(width: 90, height: 90)
                            .shadow(color: AvatarGColors.cyanBase.opacity(0.5), radius: 20, x: 0, y: 0)

                        Text("AG")
                            .font(.system(size: 32, weight: .black, design: .rounded))
                            .foregroundColor(.white)
                    }
                    .scaleEffect(logoScale)
                    .onAppear {
                        withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                            logoScale = 1.0
                        }
                    }

                    Text("Avatar G")
                        .font(.system(size: 42, weight: .black, design: .rounded))
                        .foregroundStyle(AvatarGColors.gradientCyanViolet)

                    Text("შენი AI კრეატიული სტუდია")
                        .font(AvatarGFonts.bodyLarge)
                        .foregroundColor(AvatarGColors.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .opacity(textOpacity)
                .onAppear {
                    withAnimation(.easeOut(duration: 0.8).delay(0.3)) {
                        textOpacity = 1.0
                    }
                }

                // Feature highlights
                VStack(spacing: AvatarGSpacing.md) {
                    FeatureRow(icon: "waveform", title: "Georgian AI Chat", subtitle: "ლაპარაკე Agent G-სთან ქართულად")
                    FeatureRow(icon: "music.note.list", title: "Music Studio", subtitle: "შექმენი ტრეკები სიტყვიერი კომანდებით")
                    FeatureRow(icon: "photo.stack", title: "AI Gallery", subtitle: "სურათები, ვიდეოები და ავატარები")
                }
                .padding(.horizontal, AvatarGSpacing.lg)
                .opacity(textOpacity)

                Spacer()

                // CTA Buttons
                VStack(spacing: AvatarGSpacing.sm) {
                    GlowButton(
                        title: "დაწყება",
                        icon: "arrow.right",
                        action: {
                            // For demo: sign in with mock user
                            appState.signInWithMockUser()
                        },
                        isFullWidth: true
                    )

                    Button("უკვე გაქვს ანგარიში? შედი") {
                        showLogin = true
                    }
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textSecondary)
                }
                .padding(.horizontal, AvatarGSpacing.xl)
                .padding(.bottom, AvatarGSpacing.xxl)
                .opacity(textOpacity)
            }
        }
        .sheet(isPresented: $showLogin) {
            LoginView()
                .environmentObject(appState)
        }
    }
}

struct FeatureRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: AvatarGSpacing.md) {
            ZStack {
                RoundedRectangle(cornerRadius: AvatarGRadius.md)
                    .fill(AvatarGColors.cyanBase.opacity(0.1))
                    .frame(width: 44, height: 44)
                    .overlay(
                        RoundedRectangle(cornerRadius: AvatarGRadius.md)
                            .stroke(AvatarGColors.cyanBase.opacity(0.3), lineWidth: 1)
                    )

                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(AvatarGColors.cyanBase)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AvatarGFonts.bodyMedium)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.textPrimary)
                Text(subtitle)
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textSecondary)
            }

            Spacer()
        }
        .padding(AvatarGSpacing.md)
        .glassCard(cornerRadius: AvatarGRadius.lg)
    }
}

// MARK: - Login View

struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                VStack(spacing: AvatarGSpacing.xl) {
                    Text("შესვლა")
                        .font(AvatarGFonts.displayLarge)
                        .foregroundColor(AvatarGColors.textPrimary)

                    VStack(spacing: AvatarGSpacing.md) {
                        AvatarGTextField(
                            placeholder: "ელ-ფოსტა",
                            text: $email,
                            icon: "envelope"
                        )

                        AvatarGTextField(
                            placeholder: "პაროლი",
                            text: $password,
                            icon: "lock",
                            isSecure: true
                        )
                    }

                    if let error = errorMessage {
                        Text(error)
                            .font(AvatarGFonts.bodySmall)
                            .foregroundColor(AvatarGColors.crimsonBase)
                    }

                    GlowButton(
                        title: "შესვლა",
                        action: performLogin,
                        isLoading: isLoading,
                        isFullWidth: true
                    )

                    Button("გამოიყენე demo ანგარიში") {
                        appState.signInWithMockUser()
                        dismiss()
                    }
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.cyanBase)
                }
                .padding(AvatarGSpacing.xl)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("გაუქმება") { dismiss() }
                        .foregroundColor(AvatarGColors.textSecondary)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func performLogin() {
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "გთხოვთ შეავსოთ ყველა ველი"
            return
        }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                let body = ["email": email, "password": password]
                let response: AuthResponse = try await APIClient.shared.post(.login, body: body)
                appState.signIn(token: response.accessToken, user: response.user)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

// MARK: - AvatarG TextField

struct AvatarGTextField: View {
    let placeholder: String
    @Binding var text: String
    var icon: String?
    var isSecure: Bool = false

    var body: some View {
        HStack(spacing: AvatarGSpacing.sm) {
            if let icon = icon {
                Image(systemName: icon)
                    .foregroundColor(AvatarGColors.textTertiary)
                    .frame(width: 20)
            }

            if isSecure {
                SecureField(placeholder, text: $text)
                    .foregroundColor(AvatarGColors.textPrimary)
                    .font(AvatarGFonts.bodyMedium)
            } else {
                TextField(placeholder, text: $text)
                    .foregroundColor(AvatarGColors.textPrimary)
                    .font(AvatarGFonts.bodyMedium)
                    .autocapitalization(.none)
            }
        }
        .padding(AvatarGSpacing.md)
        .background(AvatarGColors.spaceCard)
        .clipShape(RoundedRectangle(cornerRadius: AvatarGRadius.md))
        .overlay(
            RoundedRectangle(cornerRadius: AvatarGRadius.md)
                .stroke(AvatarGColors.glassBorder, lineWidth: 1)
        )
    }
}
