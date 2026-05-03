import SwiftUI

// MARK: - Library View

struct LibraryView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedTab: LibraryTab = .prompts
    @State private var searchText = ""

    enum LibraryTab: String, CaseIterable {
        case prompts   = "Prompts"
        case styles    = "Styles"
        case presets   = "Presets"
        case templates = "Templates"
    }

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search
                    searchBar
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 12)

                    // Tab bar
                    tabBar
                        .padding(.bottom, 16)

                    // Content
                    Group {
                        switch selectedTab {
                        case .prompts:    promptsSection
                        case .styles:     stylesSection
                        case .presets:    presetsSection
                        case .templates:  templatesSection
                        }
                    }
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
                    Text("Libraries")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundColor(AvatarGColors.textTertiary)
            TextField("Search library...", text: $searchText)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .autocorrectionDisabled()
            if !searchText.isEmpty {
                Button(action: { searchText = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(AvatarGColors.textTertiary)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(AvatarGColors.glassBackground)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(AvatarGColors.glassBorder, lineWidth: 1))
        )
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(LibraryTab.allCases, id: \.self) { tab in
                    Button(action: {
                        withAnimation(.spring(response: 0.24, dampingFraction: 0.8)) {
                            selectedTab = tab
                        }
                    }) {
                        Text(tab.rawValue)
                            .font(.system(size: 13, weight: selectedTab == tab ? .semibold : .regular))
                            .foregroundColor(selectedTab == tab ? .white : AvatarGColors.textSecondary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(selectedTab == tab ? AvatarGColors.cyanBase.opacity(0.18) : AvatarGColors.glassBackground)
                                    .overlay(Capsule().stroke(selectedTab == tab ? AvatarGColors.cyanBase.opacity(0.5) : AvatarGColors.glassBorder, lineWidth: 1))
                            )
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Prompts

    struct PromptItem: Identifiable {
        let id: String
        let category: String
        let prompt: String
        let service: String
        let color: Color
    }

    private let savedPrompts: [PromptItem] = [
        PromptItem(id: "p1", category: "Video", prompt: "Cinematic Tbilisi night aerial with neon lights and mist", service: "Video Studio", color: AvatarGColors.violetBase),
        PromptItem(id: "p2", category: "Image", prompt: "Georgian mountain village at golden hour, hyperrealistic", service: "Image", color: AvatarGColors.cyanBase),
        PromptItem(id: "p3", category: "Music", prompt: "Ambient electronic with Georgian folk instruments, 120 BPM", service: "Music Studio", color: AvatarGColors.emeraldBase),
        PromptItem(id: "p4", category: "Avatar", prompt: "Professional Georgian woman, studio lighting, business attire", service: "Avatar", color: Color(hex: "#f59e0b")),
        PromptItem(id: "p5", category: "Text", prompt: "Write a Georgian tech startup pitch deck for AI platform", service: "Content Writer", color: AvatarGColors.textSecondary),
    ]

    private var promptsSection: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 10) {
                ForEach(savedPrompts) { item in
                    promptCard(item)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
    }

    private func promptCard(_ item: PromptItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(item.color.opacity(0.12))
                    .frame(width: 36, height: 36)
                Text(item.category.prefix(1))
                    .font(.system(size: 13, weight: .black))
                    .foregroundColor(item.color)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(item.prompt)
                    .font(.system(size: 13))
                    .foregroundColor(AvatarGColors.textPrimary)
                    .lineLimit(3)

                Text(item.service)
                    .font(.system(size: 11))
                    .foregroundColor(AvatarGColors.textTertiary)
            }

            Spacer()

            Button(action: {
                UIPasteboard.general.string = item.prompt
            }) {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 13))
                    .foregroundColor(AvatarGColors.textTertiary)
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(AvatarGColors.glassBackground)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(AvatarGColors.glassBorder, lineWidth: 1))
        )
    }

    // MARK: - Styles

    struct StyleItem: Identifiable {
        let id: String
        let name: String
        let category: String
        let color: Color
        let tags: [String]
    }

    private let styleItems: [StyleItem] = [
        StyleItem(id: "s1", name: "Neo-Cosmic Futurism", category: "Visual", color: AvatarGColors.cyanBase, tags: ["dark", "neon", "space"]),
        StyleItem(id: "s2", name: "Georgian Folk", category: "Music", color: AvatarGColors.emeraldBase, tags: ["folk", "traditional", "warm"]),
        StyleItem(id: "s3", name: "Cyberpunk Tbilisi", category: "Visual", color: AvatarGColors.violetBase, tags: ["urban", "night", "neon"]),
        StyleItem(id: "s4", name: "Cinematic Drama", category: "Video", color: Color(hex: "#f59e0b"), tags: ["cinema", "moody", "epic"]),
        StyleItem(id: "s5", name: "Minimalist Tech", category: "Visual", color: AvatarGColors.cyanBase, tags: ["clean", "white", "modern"]),
        StyleItem(id: "s6", name: "Ambient Electronic", category: "Music", color: AvatarGColors.violetBase, tags: ["ambient", "electronic", "chill"]),
    ]

    private var stylesSection: some View {
        ScrollView(showsIndicators: false) {
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                spacing: 10
            ) {
                ForEach(styleItems) { style in
                    styleCard(style)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
    }

    private func styleCard(_ style: StyleItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(LinearGradient(
                        colors: [style.color.opacity(0.3), style.color.opacity(0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(height: 70)

                Text(style.name.prefix(1))
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundColor(style.color.opacity(0.5))
            }

            Text(style.name)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(2)

            Text(style.category)
                .font(.system(size: 10))
                .foregroundColor(style.color)

            HStack(spacing: 4) {
                ForEach(style.tags.prefix(2), id: \.self) { tag in
                    Text(tag)
                        .font(.system(size: 9))
                        .foregroundColor(AvatarGColors.textTertiary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(AvatarGColors.glassBackground))
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(AvatarGColors.spaceCard)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(AvatarGColors.glassBorder, lineWidth: 1))
        )
    }

    // MARK: - Presets

    struct PresetItem: Identifiable {
        let id: String
        let name: String
        let icon: String
        let color: Color
        let description: String
        let service: String
    }

    private let presets: [PresetItem] = [
        PresetItem(id: "pr1", name: "Quick Portrait", icon: "person.fill", color: AvatarGColors.cyanBase, description: "Professional headshot in 20s", service: "Image"),
        PresetItem(id: "pr2", name: "30s Music Loop", icon: "music.note", color: AvatarGColors.emeraldBase, description: "Background loop, any style", service: "Music Studio"),
        PresetItem(id: "pr3", name: "Social Video", icon: "play.rectangle.fill", color: AvatarGColors.violetBase, description: "9:16 format, 15s", service: "Video Studio"),
        PresetItem(id: "pr4", name: "Blog Post", icon: "doc.text.fill", color: AvatarGColors.textSecondary, description: "800-word SEO article", service: "Content Writer"),
        PresetItem(id: "pr5", name: "Voice Sample", icon: "waveform", color: Color(hex: "#f59e0b"), description: "30s cloning sample", service: "Voice Clone"),
        PresetItem(id: "pr6", name: "Interior Render", icon: "house.fill", color: Color(hex: "#f43f5e"), description: "Photorealistic room design", service: "Interior Design"),
    ]

    private var presetsSection: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 8) {
                ForEach(presets) { preset in
                    presetRow(preset)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
    }

    private func presetRow(_ preset: PresetItem) -> some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(preset.color.opacity(0.12))
                    .frame(width: 42, height: 42)
                Image(systemName: preset.icon)
                    .font(.system(size: 16))
                    .foregroundColor(preset.color)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(preset.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                Text(preset.description)
                    .font(.system(size: 12))
                    .foregroundColor(AvatarGColors.textSecondary)
            }

            Spacer()

            Text(preset.service)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(preset.color)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(preset.color.opacity(0.1)))

            Image(systemName: "chevron.right")
                .font(.system(size: 11))
                .foregroundColor(AvatarGColors.textTertiary)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(AvatarGColors.glassBackground)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(AvatarGColors.glassBorder, lineWidth: 1))
        )
    }

    // MARK: - Templates

    struct TemplateItem: Identifiable {
        let id: String
        let name: String
        let description: String
        let steps: Int
        let color: Color
        let icon: String
    }

    private let templates: [TemplateItem] = [
        TemplateItem(id: "t1", name: "Brand Identity Kit", description: "Logo + avatar + social assets", steps: 4, color: AvatarGColors.cyanBase, icon: "paintpalette.fill"),
        TemplateItem(id: "t2", name: "Music Release", description: "Track + cover + promo video", steps: 3, color: AvatarGColors.emeraldBase, icon: "music.note.list"),
        TemplateItem(id: "t3", name: "Podcast Episode", description: "Script + audio + thumbnail", steps: 3, color: AvatarGColors.violetBase, icon: "mic.fill"),
        TemplateItem(id: "t4", name: "Product Launch", description: "Video + copy + social posts", steps: 5, color: Color(hex: "#f59e0b"), icon: "rocket"),
        TemplateItem(id: "t5", name: "Event Promo", description: "Poster + script + teaser", steps: 3, color: Color(hex: "#f43f5e"), icon: "party.popper.fill"),
    ]

    private var templatesSection: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 10) {
                ForEach(templates) { template in
                    templateCard(template)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
    }

    private func templateCard(_ template: TemplateItem) -> some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(template.color.opacity(0.12))
                    .frame(width: 48, height: 48)
                Image(systemName: template.icon)
                    .font(.system(size: 20))
                    .foregroundColor(template.color)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(template.name)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                Text(template.description)
                    .font(.system(size: 12))
                    .foregroundColor(AvatarGColors.textSecondary)
                Text("\(template.steps) steps")
                    .font(.system(size: 10))
                    .foregroundColor(template.color.opacity(0.8))
            }

            Spacer()

            Image(systemName: "arrow.right.circle.fill")
                .font(.system(size: 22))
                .foregroundColor(template.color.opacity(0.6))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(AvatarGColors.spaceCard)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(
                            LinearGradient(colors: [template.color.opacity(0.25), template.color.opacity(0.05)],
                                           startPoint: .topLeading,
                                           endPoint: .bottomTrailing),
                            lineWidth: 1
                        )
                )
        )
    }
}
