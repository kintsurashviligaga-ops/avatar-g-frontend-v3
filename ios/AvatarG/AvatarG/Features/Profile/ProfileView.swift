import SwiftUI

// MARK: - Profile View

struct ProfileView: View {
    @EnvironmentObject var appState: AppState
    @State private var showLanguagePicker = false
    @State private var showDeleteConfirm = false
    @State private var showSignOutConfirm = false
    @State private var voiceLanguage: AppLanguage = .georgian
    @State private var notificationsEnabled = true
    @State private var voiceDataEnabled = false

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: AvatarGSpacing.lg) {
                        // Profile header
                        profileHeaderSection

                        // Credits card
                        creditsCard

                        // Quick stats
                        quickStatsSection

                        // Settings sections
                        languageSection
                        notificationsSection
                        privacySection

                        // Upgrade CTA (if starter)
                        if appState.currentUser?.subscriptionTier == .starter {
                            upgradeCTA
                        }

                        // Sign out
                        signOutButton

                        Color.clear.frame(height: AvatarGSpacing.xxl)
                    }
                    .padding(.top, AvatarGSpacing.sm)
                }
            }
            .navigationBarHidden(true)
        }
        .onAppear {
            if let user = appState.currentUser {
                voiceLanguage = AppLanguage(rawValue: user.preferredLanguage) ?? .georgian
            }
        }
        .confirmationDialog("Sign Out", isPresented: $showSignOutConfirm) {
            Button("Sign Out", role: .destructive) {
                appState.signOut()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to sign out?")
        }
        .alert("Delete Account", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) {
                // Apple Guideline 5.1.1(v): actually delete the account in-app.
                Task { await appState.deleteAccount() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action cannot be undone. All your data will be permanently deleted.")
        }
    }

    // MARK: - Profile Header

    private var profileHeaderSection: some View {
        VStack(spacing: AvatarGSpacing.md) {
            // Avatar
            ZStack(alignment: .bottomTrailing) {
                if let avatarURL = appState.currentUser?.avatarURL {
                    AsyncImage(url: avatarURL) { image in
                        image.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        avatarPlaceholder
                    }
                    .frame(width: 88, height: 88)
                    .clipShape(Circle())
                } else {
                    avatarPlaceholder
                }

                // Edit button
                ZStack {
                    Circle()
                        .fill(AvatarGColors.cyanBase)
                        .frame(width: 28, height: 28)
                    Image(systemName: "pencil")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                }
                .shadow(color: AvatarGColors.cyanBase.opacity(0.4), radius: 6, x: 0, y: 0)
            }

            VStack(spacing: 4) {
                Text(appState.currentUser?.name ?? "User")
                    .font(AvatarGFonts.displaySmall)
                    .foregroundColor(AvatarGColors.textPrimary)

                Text(appState.currentUser?.email ?? "")
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textSecondary)

                HStack(spacing: AvatarGSpacing.sm) {
                    if let tier = appState.currentUser?.subscriptionTier {
                        NeonBadge(text: tier.displayName, color: tierBadgeColor(tier))
                    }

                    Text("Member since \(memberSinceText)")
                        .font(AvatarGFonts.bodyXSmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                }
                .padding(.top, 2)
            }
        }
        .padding(.top, AvatarGSpacing.lg)
    }

    var avatarPlaceholder: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [AvatarGColors.cyanBase.opacity(0.3), AvatarGColors.violetBase.opacity(0.3)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 88, height: 88)
                .overlay(Circle().stroke(AvatarGColors.glassBorder, lineWidth: 1))

            Text(initials)
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
    }

    var initials: String {
        let name = appState.currentUser?.name ?? "U"
        return String(name.prefix(2)).uppercased()
    }

    var memberSinceText: String {
        let date = appState.currentUser?.memberSince ?? Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM yyyy"
        return formatter.string(from: date)
    }

    // MARK: - Credits Card

    private var creditsCard: some View {
        VStack(spacing: AvatarGSpacing.md) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Credits Balance")
                        .font(AvatarGFonts.bodySmall)
                        .foregroundColor(AvatarGColors.textSecondary)

                    Text("\(appState.credits)")
                        .font(.system(size: 40, weight: .black, design: .rounded))
                        .foregroundStyle(AvatarGColors.gradientCyanViolet)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Text("Monthly Usage")
                        .font(AvatarGFonts.bodyXSmall)
                        .foregroundColor(AvatarGColors.textTertiary)

                    Text("324 / 500")
                        .font(AvatarGFonts.monoSmall)
                        .foregroundColor(AvatarGColors.textSecondary)
                }
            }

            // Progress bar
            VStack(alignment: .leading, spacing: 4) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(AvatarGColors.glassBackground)
                            .frame(height: 8)

                        RoundedRectangle(cornerRadius: 4)
                            .fill(
                                LinearGradient(
                                    colors: [AvatarGColors.cyanBase, AvatarGColors.violetBase],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: geo.size.width * 0.648, height: 8)
                    }
                }
                .frame(height: 8)

                HStack {
                    Text("324 used")
                        .font(AvatarGFonts.bodyXSmall)
                        .foregroundColor(AvatarGColors.textTertiary)
                    Spacer()
                    Text("176 remaining")
                        .font(AvatarGFonts.bodyXSmall)
                        .foregroundColor(AvatarGColors.emeraldBase)
                }
            }

            Button(action: {}) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Add Credits")
                }
                .font(AvatarGFonts.bodySmall)
                .fontWeight(.semibold)
                .foregroundColor(AvatarGColors.cyanBase)
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(AvatarGSpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: AvatarGRadius.xl)
                .fill(AvatarGColors.spaceCard)
                .overlay(
                    RoundedRectangle(cornerRadius: AvatarGRadius.xl)
                        .stroke(
                            LinearGradient(
                                colors: [AvatarGColors.cyanBase.opacity(0.3), AvatarGColors.violetBase.opacity(0.3)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                )
        )
        .padding(.horizontal, AvatarGSpacing.md)
    }

    // MARK: - Quick Stats

    private var quickStatsSection: some View {
        HStack(spacing: AvatarGSpacing.sm) {
            ProfileStatCard(value: "188", label: "Generations", icon: "sparkles")
            ProfileStatCard(value: "24", label: "Tracks", icon: "music.note")
            ProfileStatCard(value: "47h", label: "Saved", icon: "clock.fill")
        }
        .padding(.horizontal, AvatarGSpacing.md)
    }

    // MARK: - Language Section

    private var languageSection: some View {
        SettingsSection(title: "Language & Voice") {
            SettingsRow(
                icon: "globe",
                iconColor: AvatarGColors.cyanBase,
                title: "App Language",
                trailing: {
                    AnyView(
                        Menu {
                            ForEach(AppLanguage.allCases, id: \.self) { lang in
                                Button(action: {
                                    appState.setLanguage(lang)
                                }) {
                                    HStack {
                                        Text(lang.flag)
                                        Text(lang.displayName)
                                        if appState.userLanguage == lang {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text(appState.userLanguage.flag)
                                Text(appState.userLanguage.displayName)
                                    .font(AvatarGFonts.bodySmall)
                                    .foregroundColor(AvatarGColors.textSecondary)
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 10))
                                    .foregroundColor(AvatarGColors.textTertiary)
                            }
                        }
                    )
                }
            )

            Divider()
                .background(AvatarGColors.glassBorder)

            SettingsRow(
                icon: "waveform",
                iconColor: AvatarGColors.violetBase,
                title: "Voice Language",
                trailing: {
                    AnyView(
                        Menu {
                            ForEach(AppLanguage.allCases, id: \.self) { lang in
                                Button(action: { voiceLanguage = lang }) {
                                    HStack {
                                        Text(lang.flag)
                                        Text(lang.displayName)
                                        if voiceLanguage == lang {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text(voiceLanguage.flag)
                                Text(voiceLanguage.displayName)
                                    .font(AvatarGFonts.bodySmall)
                                    .foregroundColor(AvatarGColors.textSecondary)
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 10))
                                    .foregroundColor(AvatarGColors.textTertiary)
                            }
                        }
                    )
                }
            )
        }
        .padding(.horizontal, AvatarGSpacing.md)
    }

    // MARK: - Notifications

    private var notificationsSection: some View {
        SettingsSection(title: "Notifications") {
            SettingsRow(
                icon: "bell.fill",
                iconColor: AvatarGColors.emeraldBase,
                title: "Push Notifications",
                trailing: {
                    AnyView(Toggle("", isOn: $notificationsEnabled).tint(AvatarGColors.cyanBase))
                }
            )
        }
        .padding(.horizontal, AvatarGSpacing.md)
    }

    // MARK: - Privacy

    private var privacySection: some View {
        SettingsSection(title: "Privacy") {
            SettingsRow(
                icon: "mic.fill",
                iconColor: AvatarGColors.textTertiary,
                title: "Voice Data Storage",
                trailing: {
                    AnyView(Toggle("", isOn: $voiceDataEnabled).tint(AvatarGColors.cyanBase))
                }
            )

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(
                icon: "trash.fill",
                iconColor: AvatarGColors.crimsonBase,
                title: "Delete Account",
                trailing: {
                    AnyView(
                        Button(action: { showDeleteConfirm = true }) {
                            Text("Delete")
                                .font(AvatarGFonts.bodySmall)
                                .foregroundColor(AvatarGColors.crimsonBase)
                        }
                        .buttonStyle(PlainButtonStyle())
                    )
                }
            )
        }
        .padding(.horizontal, AvatarGSpacing.md)
    }

    // MARK: - Upgrade CTA

    private var upgradeCTA: some View {
        VStack(spacing: AvatarGSpacing.md) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Upgrade to Pro")
                        .font(AvatarGFonts.displaySmall)
                        .foregroundColor(.white)
                    Text("Get 10x more credits + priority generation")
                        .font(AvatarGFonts.bodySmall)
                        .foregroundColor(.white.opacity(0.7))
                }
                Spacer()
                Image(systemName: "crown.fill")
                    .font(.system(size: 28))
                    .foregroundColor(.yellow)
            }

            Button(action: {}) {
                Text("Upgrade Now →")
                    .font(AvatarGFonts.bodyMedium)
                    .fontWeight(.bold)
                    .foregroundColor(AvatarGColors.violetDark)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, AvatarGSpacing.md)
                    .background(Capsule().fill(Color.white))
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(AvatarGSpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: AvatarGRadius.xl)
                .fill(
                    LinearGradient(
                        colors: [AvatarGColors.violetBase, AvatarGColors.violetDark],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
        .padding(.horizontal, AvatarGSpacing.md)
    }

    // MARK: - Sign Out

    private var signOutButton: some View {
        Button(action: { showSignOutConfirm = true }) {
            HStack {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .foregroundColor(AvatarGColors.crimsonBase)
                Text("Sign Out")
                    .font(AvatarGFonts.bodyMedium)
                    .fontWeight(.medium)
                    .foregroundColor(AvatarGColors.crimsonBase)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, AvatarGSpacing.md)
            .background(
                RoundedRectangle(cornerRadius: AvatarGRadius.lg)
                    .fill(AvatarGColors.crimsonBase.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: AvatarGRadius.lg)
                            .stroke(AvatarGColors.crimsonBase.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
        .padding(.horizontal, AvatarGSpacing.md)
    }

    // MARK: - Helpers

    private func tierBadgeColor(_ tier: User.SubscriptionTier) -> BadgeColor {
        switch tier {
        case .starter: return .emerald
        case .pro: return .cyan
        case .studio: return .violet
        }
    }
}

// MARK: - Settings Section

struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            Text(title)
                .font(AvatarGFonts.bodyXSmall)
                .fontWeight(.semibold)
                .foregroundColor(AvatarGColors.textTertiary)
                .textCase(.uppercase)
                .padding(.horizontal, 4)

            VStack(spacing: 0) {
                content()
            }
            .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
        }
    }
}

// MARK: - Settings Row

struct SettingsRow<TrailingContent: View>: View {
    let icon: String
    let iconColor: Color
    let title: String
    @ViewBuilder var trailing: () -> TrailingContent

    var body: some View {
        HStack(spacing: AvatarGSpacing.md) {
            ZStack {
                RoundedRectangle(cornerRadius: 7)
                    .fill(iconColor.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(iconColor)
            }

            Text(title)
                .font(AvatarGFonts.bodyMedium)
                .foregroundColor(AvatarGColors.textPrimary)

            Spacer()

            trailing()
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .padding(.vertical, AvatarGSpacing.sm)
    }
}

// MARK: - Profile Stat Card

struct ProfileStatCard: View {
    let value: String
    let label: String
    let icon: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(AvatarGColors.cyanBase)

            Text(value)
                .font(AvatarGFonts.displaySmall)
                .foregroundColor(AvatarGColors.textPrimary)

            Text(label)
                .font(AvatarGFonts.bodyXSmall)
                .foregroundColor(AvatarGColors.textTertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AvatarGSpacing.md)
        .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
    }
}

#Preview {
    ProfileView()
        .environmentObject({
            let state = AppState.shared
            state.signInWithMockUser()
            return state
        }())
        .preferredColorScheme(.dark)
}
