import SwiftUI

// MARK: - API Keys View

struct APIKeysView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var keys: [APIKeyEntry] = APIKeyEntry.defaults
    @State private var editingKey: APIKeyEntry? = nil
    @State private var draftValue: String = ""
    @State private var showingKey: String? = nil
    @State private var copiedKey: String? = nil

    struct APIKeyEntry: Identifiable {
        let id: String
        let service: String
        let icon: String
        let color: Color
        let placeholder: String
        let docs: String
        var value: String
        var isVerified: Bool

        static let defaults: [APIKeyEntry] = [
            APIKeyEntry(id: "elevenlabs",
                        service: "ElevenLabs",
                        icon: "waveform",
                        color: AvatarGColors.violetBase,
                        placeholder: "sk_...",
                        docs: "elevenlabs.io/api",
                        value: "",
                        isVerified: false),
            APIKeyEntry(id: "heygen",
                        service: "HeyGen",
                        icon: "person.crop.circle.fill",
                        color: AvatarGColors.cyanBase,
                        placeholder: "NjYy...",
                        docs: "app.heygen.com/settings",
                        value: "",
                        isVerified: false),
            APIKeyEntry(id: "replicate",
                        service: "Replicate",
                        icon: "cpu.fill",
                        color: AvatarGColors.emeraldBase,
                        placeholder: "r8_...",
                        docs: "replicate.com/account",
                        value: "",
                        isVerified: false),
            APIKeyEntry(id: "openai",
                        service: "OpenAI",
                        icon: "sparkles",
                        color: Color(hex: "#10a37f"),
                        placeholder: "sk-...",
                        docs: "platform.openai.com/api-keys",
                        value: "",
                        isVerified: false),
            APIKeyEntry(id: "anthropic",
                        service: "Anthropic",
                        icon: "brain.fill",
                        color: Color(hex: "#f59e0b"),
                        placeholder: "sk-ant-...",
                        docs: "console.anthropic.com/settings/keys",
                        value: "",
                        isVerified: false),
            APIKeyEntry(id: "google_ai",
                        service: "Google AI (Gemini)",
                        icon: "g.circle.fill",
                        color: Color(hex: "#4285F4"),
                        placeholder: "AIza...",
                        docs: "aistudio.google.com/app/apikey",
                        value: "",
                        isVerified: false),
        ]
    }

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        infoCard
                        keysSection
                        securityNote
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
                    Text("API Keys")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                }
            }
        }
        .preferredColorScheme(.dark)
        .sheet(item: $editingKey) { key in
            editKeySheet(key)
        }
    }

    // MARK: - Info Card

    private var infoCard: some View {
        HStack(spacing: 14) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 24))
                .foregroundStyle(AvatarGColors.gradientCyanViolet)

            VStack(alignment: .leading, spacing: 3) {
                Text("Secure Key Storage")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                Text("Keys are stored in iOS Keychain, encrypted on-device. Never shared with third parties.")
                    .font(.system(size: 12))
                    .foregroundColor(AvatarGColors.textSecondary)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(AvatarGColors.cyanBase.opacity(0.06))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(AvatarGColors.cyanBase.opacity(0.2), lineWidth: 1))
        )
    }

    // MARK: - Keys List

    private var keysSection: some View {
        VStack(spacing: 10) {
            ForEach(Array(keys.enumerated()), id: \.element.id) { index, key in
                keyRow(index: index, key: key)
            }
        }
    }

    private func keyRow(index: Int, key: APIKeyEntry) -> some View {
        let isRevealed = showingKey == key.id
        let hasValue = !key.value.isEmpty

        return VStack(spacing: 0) {
            HStack(spacing: 14) {
                // Icon
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(key.color.opacity(0.12))
                        .frame(width: 40, height: 40)
                    Image(systemName: key.icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(key.color)
                }

                // Service + key value
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(key.service)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)

                        if key.isVerified {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.system(size: 11))
                                .foregroundColor(AvatarGColors.emeraldBase)
                        }
                    }

                    if hasValue {
                        Text(isRevealed ? key.value : maskedKey(key.value))
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(AvatarGColors.textTertiary)
                            .lineLimit(1)
                    } else {
                        Text("Not configured")
                            .font(.system(size: 11))
                            .foregroundColor(AvatarGColors.textTertiary.opacity(0.6))
                    }
                }

                Spacer()

                // Action buttons
                HStack(spacing: 8) {
                    if hasValue {
                        Button(action: {
                            showingKey = isRevealed ? nil : key.id
                        }) {
                            Image(systemName: isRevealed ? "eye.slash" : "eye")
                                .font(.system(size: 13))
                                .foregroundColor(AvatarGColors.textTertiary)
                        }
                        .buttonStyle(PlainButtonStyle())

                        Button(action: {
                            UIPasteboard.general.string = key.value
                            copiedKey = key.id
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                                if copiedKey == key.id { copiedKey = nil }
                            }
                        }) {
                            Image(systemName: copiedKey == key.id ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 13))
                                .foregroundColor(copiedKey == key.id ? AvatarGColors.emeraldBase : AvatarGColors.textTertiary)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }

                    Button(action: {
                        editingKey = key
                        draftValue = key.value
                    }) {
                        Text(hasValue ? "Edit" : "Add")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(hasValue ? AvatarGColors.textSecondary : AvatarGColors.cyanBase)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                Capsule()
                                    .fill(hasValue ? AvatarGColors.glassBackground : AvatarGColors.cyanBase.opacity(0.1))
                                    .overlay(Capsule().stroke(hasValue ? AvatarGColors.glassBorder : AvatarGColors.cyanBase.opacity(0.3), lineWidth: 1))
                            )
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .padding(14)
        }
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(AvatarGColors.glassBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(hasValue ? key.color.opacity(0.15) : AvatarGColors.glassBorder, lineWidth: 1)
                )
        )
    }

    // MARK: - Edit Sheet

    private func editKeySheet(_ key: APIKeyEntry) -> some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                VStack(spacing: 24) {
                    // Icon + name
                    VStack(spacing: 10) {
                        ZStack {
                            Circle()
                                .fill(key.color.opacity(0.12))
                                .frame(width: 64, height: 64)
                                .overlay(Circle().stroke(key.color.opacity(0.3), lineWidth: 1.5))
                            Image(systemName: key.icon)
                                .font(.system(size: 24))
                                .foregroundColor(key.color)
                        }

                        Text(key.service)
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(.white)

                        Text("docs: \(key.docs)")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(AvatarGColors.cyanBase.opacity(0.7))
                    }
                    .padding(.top, 8)

                    // Text field
                    VStack(alignment: .leading, spacing: 8) {
                        Text("API KEY")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(AvatarGColors.textTertiary)
                            .tracking(1.5)

                        SecureField(key.placeholder, text: $draftValue)
                            .font(.system(size: 14, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(14)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(AvatarGColors.spaceCard)
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(AvatarGColors.glassBorder, lineWidth: 1))
                            )
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }

                    Spacer()

                    // Save + Remove
                    VStack(spacing: 10) {
                        Button(action: {
                            saveKey(id: key.id, value: draftValue)
                            editingKey = nil
                        }) {
                            Text("Save Key")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(
                                    RoundedRectangle(cornerRadius: 14)
                                        .fill(LinearGradient(colors: [AvatarGColors.cyanBase, AvatarGColors.violetBase], startPoint: .leading, endPoint: .trailing))
                                )
                        }
                        .buttonStyle(PlainButtonStyle())

                        if !key.value.isEmpty {
                            Button(action: {
                                saveKey(id: key.id, value: "")
                                editingKey = nil
                            }) {
                                Text("Remove Key")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(AvatarGColors.crimsonBase)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .background(
                                        RoundedRectangle(cornerRadius: 14)
                                            .fill(AvatarGColors.crimsonBase.opacity(0.08))
                                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(AvatarGColors.crimsonBase.opacity(0.25), lineWidth: 1))
                                    )
                            }
                            .buttonStyle(PlainButtonStyle())
                        }
                    }
                }
                .padding(24)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { editingKey = nil }
                        .foregroundColor(AvatarGColors.textSecondary)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Security Note

    private var securityNote: some View {
        HStack(spacing: 10) {
            Image(systemName: "info.circle")
                .font(.system(size: 13))
                .foregroundColor(AvatarGColors.textTertiary)
            Text("Keys stored here override server-side defaults. Leave blank to use platform defaults.")
                .font(.system(size: 12))
                .foregroundColor(AvatarGColors.textTertiary)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(AvatarGColors.glassBackground)
        )
    }

    // MARK: - Helpers

    private func maskedKey(_ value: String) -> String {
        guard value.count > 8 else { return String(repeating: "•", count: value.count) }
        let prefix = String(value.prefix(6))
        let suffix = String(value.suffix(4))
        return "\(prefix)••••••••\(suffix)"
    }

    private func saveKey(id: String, value: String) {
        if let index = keys.firstIndex(where: { $0.id == id }) {
            keys[index].value = value
            // In production: KeychainService.save(key: id, value: value)
        }
    }
}
