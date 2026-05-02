import SwiftUI

// MARK: - Gallery View

struct GalleryView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedFilter: ContentFilter = .all
    @State private var searchText: String = ""
    @State private var items: [GeneratedContent] = GalleryView.mockItems()
    @State private var isRefreshing: Bool = false
    @State private var showActionMenu: Bool = false
    @State private var selectedItem: GeneratedContent?
    @FocusState private var isSearchFocused: Bool

    enum ContentFilter: String, CaseIterable {
        case all = "All"
        case images = "Images"
        case videos = "Videos"
        case music = "Music"
        case avatars = "Avatars"

        var serviceTypes: [ServiceType] {
            switch self {
            case .all: return ServiceType.allCases
            case .images: return [.image]
            case .videos: return [.video]
            case .music: return [.music]
            case .avatars: return [.avatar]
            }
        }
    }

    var filteredItems: [GeneratedContent] {
        let typeFiltered = selectedFilter == .all
            ? items
            : items.filter { selectedFilter.serviceTypes.contains($0.serviceType) }

        if searchText.isEmpty { return typeFiltered }
        return typeFiltered.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.prompt.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Header
                    galleryHeader

                    // Search bar
                    searchBar

                    // Filter bar
                    filterBar

                    // Content
                    if filteredItems.isEmpty {
                        emptyState
                    } else {
                        contentGrid
                    }
                }
            }
            .navigationBarHidden(true)
        }
        .confirmationDialog("Item Actions", isPresented: $showActionMenu, presenting: selectedItem) { item in
            Button("Share") {
                shareItem(item)
            }
            Button("Open in Studio") {
                openInStudio(item)
            }
            Button("Delete", role: .destructive) {
                deleteItem(item)
            }
            Button("Cancel", role: .cancel) {}
        } message: { item in
            Text(item.title)
        }
    }

    // MARK: - Header

    private var galleryHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Gallery")
                    .font(AvatarGFonts.displayMedium)
                    .foregroundColor(AvatarGColors.textPrimary)
                Text("\(filteredItems.count) creations")
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textTertiary)
            }

            Spacer()

            Image(systemName: "photo.stack.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(AvatarGColors.gradientCyanViolet)
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .padding(.top, AvatarGSpacing.lg)
        .padding(.bottom, AvatarGSpacing.sm)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: AvatarGSpacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16))
                .foregroundColor(isSearchFocused ? AvatarGColors.cyanBase : AvatarGColors.textTertiary)

            TextField("Search creations...", text: $searchText)
                .font(AvatarGFonts.bodyMedium)
                .foregroundColor(AvatarGColors.textPrimary)
                .focused($isSearchFocused)

            if !searchText.isEmpty {
                Button(action: { searchText = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(AvatarGColors.textTertiary)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .padding(.horizontal, AvatarGSpacing.md)
        .padding(.vertical, AvatarGSpacing.sm)
        .background(AvatarGColors.spaceCard)
        .clipShape(RoundedRectangle(cornerRadius: AvatarGRadius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: AvatarGRadius.xl)
                .stroke(isSearchFocused ? AvatarGColors.cyanBase.opacity(0.5) : AvatarGColors.glassBorder, lineWidth: 1)
        )
        .padding(.horizontal, AvatarGSpacing.md)
        .animation(.avatarGFast, value: isSearchFocused)
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AvatarGSpacing.sm) {
                ForEach(ContentFilter.allCases, id: \.self) { filter in
                    FilterChip(
                        title: filter.rawValue,
                        isSelected: selectedFilter == filter,
                        count: countForFilter(filter)
                    ) {
                        selectedFilter = filter
                    }
                }
            }
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.vertical, AvatarGSpacing.sm)
        }
    }

    // MARK: - Content Grid

    private var contentGrid: some View {
        ScrollView(showsIndicators: false) {
            Group {
                if selectedFilter == .music {
                    // Music: list layout
                    LazyVStack(spacing: AvatarGSpacing.sm) {
                        ForEach(filteredItems) { item in
                            GalleryMusicRow(item: item) {
                                selectedItem = item
                                showActionMenu = true
                            }
                        }
                    }
                    .padding(.horizontal, AvatarGSpacing.md)
                } else {
                    // Others: 2-column grid
                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: AvatarGSpacing.sm),
                            GridItem(.flexible(), spacing: AvatarGSpacing.sm)
                        ],
                        spacing: AvatarGSpacing.sm
                    ) {
                        ForEach(filteredItems) { item in
                            GalleryGridCell(item: item) {
                                selectedItem = item
                                showActionMenu = true
                            }
                        }
                    }
                    .padding(.horizontal, AvatarGSpacing.md)
                }
            }
            .padding(.top, AvatarGSpacing.sm)
            .padding(.bottom, AvatarGSpacing.xxl)
        }
        .refreshable {
            await refreshGallery()
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: AvatarGSpacing.lg) {
            Spacer()

            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 60, weight: .thin))
                .foregroundColor(AvatarGColors.textTertiary)

            VStack(spacing: AvatarGSpacing.sm) {
                Text(searchText.isEmpty ? "Your creations will appear here" : "No results found")
                    .font(AvatarGFonts.displaySmall)
                    .foregroundColor(AvatarGColors.textPrimary)
                    .multilineTextAlignment(.center)

                Text(searchText.isEmpty
                     ? "Start by chatting with Agent G or using the Studio"
                     : "Try a different search term")
                    .font(AvatarGFonts.bodyMedium)
                    .foregroundColor(AvatarGColors.textTertiary)
                    .multilineTextAlignment(.center)
            }

            Spacer()
        }
        .padding(AvatarGSpacing.xl)
    }

    // MARK: - Helpers

    private func countForFilter(_ filter: ContentFilter) -> Int {
        if filter == .all { return items.count }
        return items.filter { filter.serviceTypes.contains($0.serviceType) }.count
    }

    private func shareItem(_ item: GeneratedContent) {
        // Share logic
    }

    private func openInStudio(_ item: GeneratedContent) {
        if item.serviceType == .music {
            appState.navigateToStudio()
        }
    }

    private func deleteItem(_ item: GeneratedContent) {
        withAnimation {
            items.removeAll { $0.id == item.id }
        }
    }

    private func refreshGallery() async {
        isRefreshing = true
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        // In production, fetch from API
        isRefreshing = false
    }

    // MARK: - Mock Data

    static func mockItems() -> [GeneratedContent] {
        var items: [GeneratedContent] = []

        let types: [ServiceType] = [.music, .image, .video, .avatar, .image, .music, .video, .image, .avatar, .music]
        let titles = [
            "Summer Vibes", "Cyberpunk Portrait", "Mountain Timelapse",
            "My Avatar v1", "Georgian Warrior", "Midnight Jazz",
            "City Dreams", "Neon Forest", "Pro Headshot", "Electronic Fusion"
        ]
        let prompts = [
            "Chill summer pop", "Cyberpunk warrior art", "4K timelapse sunset",
            "AI photo avatar", "Traditional fighter", "Late night jazz",
            "Urban night scene", "Glowing forest", "Clean professional", "Electronic beats"
        ]

        for i in 0..<10 {
            items.append(GeneratedContent(
                serviceType: types[i],
                title: titles[i],
                prompt: prompts[i],
                createdAt: Date().addingTimeInterval(Double(-i) * 3600)
            ))
        }

        return items
    }
}

// MARK: - Filter Chip

struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let count: Int
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 4) {
                Text(title)
                    .font(AvatarGFonts.bodySmall)
                    .fontWeight(isSelected ? .semibold : .regular)
                    .foregroundColor(isSelected ? .white : AvatarGColors.textSecondary)

                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(isSelected ? .white.opacity(0.7) : AvatarGColors.textTertiary)
                }
            }
            .padding(.horizontal, AvatarGSpacing.md)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(isSelected
                          ? AvatarGColors.cyanBase
                          : AvatarGColors.spaceCard)
                    .overlay(
                        Capsule()
                            .stroke(isSelected ? Color.clear : AvatarGColors.glassBorder, lineWidth: 1)
                    )
            )
            .shadow(
                color: isSelected ? AvatarGColors.cyanBase.opacity(0.3) : Color.clear,
                radius: 6, x: 0, y: 2
            )
        }
        .buttonStyle(PlainButtonStyle())
        .animation(.avatarGFast, value: isSelected)
    }
}

// MARK: - Gallery Grid Cell

struct GalleryGridCell: View {
    let item: GeneratedContent
    let onLongPress: () -> Void

    var serviceColor: Color {
        switch item.serviceType {
        case .image: return AvatarGColors.violetBase
        case .video: return AvatarGColors.emeraldBase
        case .avatar: return AvatarGColors.crimsonBase
        default: return AvatarGColors.cyanBase
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AvatarGSpacing.sm) {
            // Thumbnail
            ZStack(alignment: .topTrailing) {
                Group {
                    if let thumbnailURL = item.thumbnailURL {
                        AsyncImage(url: thumbnailURL) { image in
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        } placeholder: {
                            thumbnailPlaceholder
                        }
                    } else {
                        thumbnailPlaceholder
                    }
                }
                .frame(height: 140)
                .clipShape(RoundedRectangle(cornerRadius: AvatarGRadius.md))

                // Type badge
                NeonBadge(text: item.serviceType.displayName, color: badgeColor)
                    .padding(6)
            }

            // Info
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(AvatarGFonts.bodySmall)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.textPrimary)
                    .lineLimit(1)

                Text(item.createdAt.relativeString())
                    .font(AvatarGFonts.bodyXSmall)
                    .foregroundColor(AvatarGColors.textTertiary)
            }
            .padding(.horizontal, 4)
        }
        .padding(AvatarGSpacing.sm)
        .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
        .onLongPressGesture {
            onLongPress()
        }
    }

    var thumbnailPlaceholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: AvatarGRadius.md)
                .fill(serviceColor.opacity(0.15))

            Image(systemName: item.serviceType.icon)
                .font(.system(size: 28, weight: .thin))
                .foregroundColor(serviceColor.opacity(0.7))
        }
    }

    var badgeColor: BadgeColor {
        switch item.serviceType {
        case .image: return .violet
        case .video: return .emerald
        case .avatar: return .crimson
        default: return .cyan
        }
    }
}

// MARK: - Gallery Music Row

struct GalleryMusicRow: View {
    let item: GeneratedContent
    let onLongPress: () -> Void

    var body: some View {
        HStack(spacing: AvatarGSpacing.md) {
            // Cover
            ZStack {
                RoundedRectangle(cornerRadius: AvatarGRadius.sm)
                    .fill(AvatarGColors.gradientCyanViolet)
                    .frame(width: 56, height: 56)
                Image(systemName: "music.note.list")
                    .foregroundColor(.white)
                    .font(.system(size: 20, weight: .bold))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(AvatarGFonts.bodyMedium)
                    .fontWeight(.semibold)
                    .foregroundColor(AvatarGColors.textPrimary)
                    .lineLimit(1)

                Text(item.prompt)
                    .font(AvatarGFonts.bodySmall)
                    .foregroundColor(AvatarGColors.textTertiary)
                    .lineLimit(1)

                Text(item.createdAt.relativeString())
                    .font(AvatarGFonts.bodyXSmall)
                    .foregroundColor(AvatarGColors.textTertiary)
            }

            Spacer()

            Button(action: {}) {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(AvatarGColors.gradientCyanViolet)
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(AvatarGSpacing.md)
        .glassCard(cornerRadius: AvatarGRadius.lg, padding: 0)
        .onLongPressGesture {
            onLongPress()
        }
    }
}

#Preview {
    GalleryView()
        .environmentObject(AppState.shared)
        .preferredColorScheme(.dark)
}
