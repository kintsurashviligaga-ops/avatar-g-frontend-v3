import SwiftUI

// MARK: - App Settings View

struct AppSettingsView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    // Appearance
    @AppStorage("settings_haptics") private var hapticsEnabled = true
    @AppStorage("settings_animations") private var animationsEnabled = true
    @AppStorage("settings_high_quality_preview") private var highQualityPreview = true

    // Notifications
    @AppStorage("settings_notif_generation") private var notifGeneration = true
    @AppStorage("settings_notif_credits") private var notifCredits = true
    @AppStorage("settings_notif_marketing") private var notifMarketing = false

    // Privacy
    @AppStorage("settings_voice_storage") private var voiceStorage = false
    @AppStorage("settings_analytics") private var analyticsEnabled = true
    @AppStorage("settings_crash_reports") private var crashReports = true

    // Generation
    @AppStorage("settings_auto_save") private var autoSaveEnabled = true
    @AppStorage("settings_generation_quality") private var generationQuality = "balanced"

    @State private var showClearCacheConfirm = false
    @State private var showDeleteDataConfirm = false
    @State private var cacheSize = "128 MB"

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        languageSection
                        appearanceSection
                        generationSection
                        notificationsSection
                        privacySection
                        storageSection
                        aboutSection
                        Color.clear.frame(height: 40)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(AvatarGColors.textSecondary)
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text("Settings")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                }
            }
        }
        .preferredColorScheme(.dark)
        .confirmationDialog("Clear Cache", isPresented: $showClearCacheConfirm) {
            Button("Clear \(cacheSize)", role: .destructive) { cacheSize = "0 MB" }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will remove all cached previews and temporary files.")
        }
        .alert("Delete All Data", isPresented: $showDeleteDataConfirm) {
            Button("Delete", role: .destructive) {}
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("All local data will be permanently deleted. This cannot be undone.")
        }
    }

    // MARK: - Language

    private var languageSection: some View {
        SettingsSection(title: "Language & Region") {
            SettingsRow(icon: "globe", iconColor: AvatarGColors.cyanBase, title: "App Language") {
                AnyView(
                    Menu {
                        ForEach(AppLanguage.allCases, id: \.self) { lang in
                            Button(action: { appState.setLanguage(lang) }) {
                                HStack {
                                    Text(lang.flag)
                                    Text(lang.displayName)
                                    if appState.userLanguage == lang { Image(systemName: "checkmark") }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(appState.userLanguage.flag)
                            Text(appState.userLanguage.displayName)
                                .font(.system(size: 13))
                                .foregroundColor(AvatarGColors.textSecondary)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 10))
                                .foregroundColor(AvatarGColors.textTertiary)
                        }
                    }
                )
            }
        }
    }

    // MARK: - Appearance

    private var appearanceSection: some View {
        SettingsSection(title: "Appearance & Interaction") {
            SettingsRow(icon: "iphone.radiowaves.left.and.right", iconColor: AvatarGColors.violetBase, title: "Haptic Feedback") {
                AnyView(Toggle("", isOn: $hapticsEnabled).tint(AvatarGColors.cyanBase))
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "sparkles", iconColor: AvatarGColors.cyanBase, title: "Animations") {
                AnyView(Toggle("", isOn: $animationsEnabled).tint(AvatarGColors.cyanBase))
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "photo.fill", iconColor: AvatarGColors.emeraldBase, title: "High Quality Previews") {
                AnyView(Toggle("", isOn: $highQualityPreview).tint(AvatarGColors.cyanBase))
            }
        }
    }

    // MARK: - Generation

    private var generationSection: some View {
        SettingsSection(title: "Generation") {
            SettingsRow(icon: "square.and.arrow.down.fill", iconColor: AvatarGColors.emeraldBase, title: "Auto-Save Results") {
                AnyView(Toggle("", isOn: $autoSaveEnabled).tint(AvatarGColors.cyanBase))
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "dial.medium.fill", iconColor: AvatarGColors.violetBase, title: "Generation Quality") {
                AnyView(
                    Menu {
                        Button(action: { generationQuality = "fast" }) {
                            HStack {
                                Text("Fast")
                                if generationQuality == "fast" { Image(systemName: "checkmark") }
                            }
                        }
                        Button(action: { generationQuality = "balanced" }) {
                            HStack {
                                Text("Balanced")
                                if generationQuality == "balanced" { Image(systemName: "checkmark") }
                            }
                        }
                        Button(action: { generationQuality = "best" }) {
                            HStack {
                                Text("Best Quality")
                                if generationQuality == "best" { Image(systemName: "checkmark") }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(generationQuality.capitalized)
                                .font(.system(size: 13))
                                .foregroundColor(AvatarGColors.textSecondary)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 10))
                                .foregroundColor(AvatarGColors.textTertiary)
                        }
                    }
                )
            }
        }
    }

    // MARK: - Notifications

    private var notificationsSection: some View {
        SettingsSection(title: "Notifications") {
            SettingsRow(icon: "checkmark.circle.fill", iconColor: AvatarGColors.emeraldBase, title: "Generation Complete") {
                AnyView(Toggle("", isOn: $notifGeneration).tint(AvatarGColors.cyanBase))
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "bolt.fill", iconColor: AvatarGColors.cyanBase, title: "Low Credits Alert") {
                AnyView(Toggle("", isOn: $notifCredits).tint(AvatarGColors.cyanBase))
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "megaphone.fill", iconColor: AvatarGColors.textTertiary, title: "Product Updates") {
                AnyView(Toggle("", isOn: $notifMarketing).tint(AvatarGColors.cyanBase))
            }
        }
    }

    // MARK: - Privacy

    private var privacySection: some View {
        SettingsSection(title: "Privacy & Data") {
            SettingsRow(icon: "mic.fill", iconColor: AvatarGColors.textTertiary, title: "Voice Data Storage") {
                AnyView(Toggle("", isOn: $voiceStorage).tint(AvatarGColors.cyanBase))
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "chart.bar.fill", iconColor: AvatarGColors.cyanBase, title: "Usage Analytics") {
                AnyView(Toggle("", isOn: $analyticsEnabled).tint(AvatarGColors.cyanBase))
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "exclamationmark.triangle.fill", iconColor: AvatarGColors.violetBase, title: "Crash Reports") {
                AnyView(Toggle("", isOn: $crashReports).tint(AvatarGColors.cyanBase))
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "hand.raised.fill", iconColor: AvatarGColors.textSecondary, title: "Privacy Policy") {
                AnyView(
                    Button(action: {}) {
                        Image(systemName: "arrow.up.right.square")
                            .font(.system(size: 14))
                            .foregroundColor(AvatarGColors.cyanBase)
                    }
                    .buttonStyle(PlainButtonStyle())
                )
            }
        }
    }

    // MARK: - Storage

    private var storageSection: some View {
        SettingsSection(title: "Storage") {
            SettingsRow(icon: "internaldrive.fill", iconColor: AvatarGColors.emeraldBase, title: "Cache Size") {
                AnyView(
                    HStack(spacing: 8) {
                        Text(cacheSize)
                            .font(.system(size: 13))
                            .foregroundColor(AvatarGColors.textSecondary)
                        Button(action: { showClearCacheConfirm = true }) {
                            Text("Clear")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(AvatarGColors.crimsonBase)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                )
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "trash.fill", iconColor: AvatarGColors.crimsonBase, title: "Delete All Local Data") {
                AnyView(
                    Button(action: { showDeleteDataConfirm = true }) {
                        Text("Delete")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(AvatarGColors.crimsonBase)
                    }
                    .buttonStyle(PlainButtonStyle())
                )
            }
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        SettingsSection(title: "About") {
            SettingsRow(icon: "info.circle.fill", iconColor: AvatarGColors.cyanBase, title: "App Version") {
                AnyView(
                    Text("1.0.0 (1)")
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundColor(AvatarGColors.textTertiary)
                )
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "globe", iconColor: AvatarGColors.violetBase, title: "Website") {
                AnyView(
                    Button(action: {}) {
                        Text("myavatar.ge")
                            .font(.system(size: 12))
                            .foregroundColor(AvatarGColors.cyanBase)
                    }
                    .buttonStyle(PlainButtonStyle())
                )
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "envelope.fill", iconColor: AvatarGColors.emeraldBase, title: "Contact Support") {
                AnyView(
                    Button(action: {}) {
                        Image(systemName: "arrow.up.right.square")
                            .font(.system(size: 14))
                            .foregroundColor(AvatarGColors.cyanBase)
                    }
                    .buttonStyle(PlainButtonStyle())
                )
            }

            Divider().background(AvatarGColors.glassBorder)

            SettingsRow(icon: "star.fill", iconColor: Color(hex: "#f59e0b"), title: "Rate on App Store") {
                AnyView(
                    Button(action: {}) {
                        Image(systemName: "arrow.up.right.square")
                            .font(.system(size: 14))
                            .foregroundColor(AvatarGColors.cyanBase)
                    }
                    .buttonStyle(PlainButtonStyle())
                )
            }
        }
    }
}
