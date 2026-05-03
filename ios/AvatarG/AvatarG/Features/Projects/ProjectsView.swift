import SwiftUI

// MARK: - Projects View

struct ProjectsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var selectedFilter: ProjectFilter = .all
    @State private var selectedSort: ProjectSort = .newest
    @State private var showSortMenu = false
    @State private var projects: [Project] = Project.mockData

    enum ProjectFilter: String, CaseIterable {
        case all      = "All"
        case image    = "Images"
        case video    = "Videos"
        case music    = "Music"
        case avatar   = "Avatars"
        case text     = "Text"
    }

    enum ProjectSort: String, CaseIterable {
        case newest   = "Newest"
        case oldest   = "Oldest"
        case nameAZ   = "Name A–Z"
    }

    struct Project: Identifiable {
        let id: String
        let title: String
        let type: ProjectFilter
        let thumbnailColor: Color
        let icon: String
        let createdAt: Date
        let duration: String?
        let service: String

        static let mockData: [Project] = [
            Project(id: "1", title: "Tbilisi Night Video", type: .video, thumbnailColor: AvatarGColors.violetBase, icon: "play.rectangle.fill", createdAt: Date().addingTimeInterval(-3600), duration: "0:32", service: "Video Studio"),
            Project(id: "2", title: "Mountain Sunset", type: .image, thumbnailColor: AvatarGColors.cyanBase, icon: "photo.fill", createdAt: Date().addingTimeInterval(-7200), duration: nil, service: "Image"),
            Project(id: "3", title: "Georgian Folk Remix", type: .music, thumbnailColor: AvatarGColors.emeraldBase, icon: "music.note", createdAt: Date().addingTimeInterval(-86400), duration: "2:14", service: "Music Studio"),
            Project(id: "4", title: "AI Avatar — Nino", type: .avatar, thumbnailColor: Color(hex: "#f59e0b"), icon: "person.crop.circle.fill", createdAt: Date().addingTimeInterval(-172800), duration: "1:05", service: "Avatar"),
            Project(id: "5", title: "Product Launch Script", type: .text, thumbnailColor: AvatarGColors.textSecondary, icon: "doc.text.fill", createdAt: Date().addingTimeInterval(-259200), duration: nil, service: "Content Writer"),
            Project(id: "6", title: "City Ambient Loop", type: .music, thumbnailColor: AvatarGColors.violetBase, icon: "waveform", createdAt: Date().addingTimeInterval(-345600), duration: "3:00", service: "Music Studio"),
            Project(id: "7", title: "Interior Render — Loft", type: .image, thumbnailColor: Color(hex: "#f43f5e"), icon: "photo.fill", createdAt: Date().addingTimeInterval(-432000), duration: nil, service: "Interior Design"),
            Project(id: "8", title: "Tech Podcast Ep. 1", type: .text, thumbnailColor: AvatarGColors.cyanBase, icon: "mic.fill", createdAt: Date().addingTimeInterval(-518400), duration: nil, service: "Podcast Studio"),
        ]
    }

    private var filtered: [Project] {
        var result = projects

        if selectedFilter != .all {
            result = result.filter { $0.type == selectedFilter }
        }

        if !searchText.isEmpty {
            result = result.filter { $0.title.localizedCaseInsensitiveContains(searchText) }
        }

        switch selectedSort {
        case .newest:  result = result.sorted { $0.createdAt > $1.createdAt }
        case .oldest:  result = result.sorted { $0.createdAt < $1.createdAt }
        case .nameAZ:  result = result.sorted { $0.title < $1.title }
        }

        return result
    }

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search bar
                    searchBar
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 12)

                    // Filter chips
                    filterChips
                        .padding(.bottom, 12)

                    // Sort row
                    HStack {
                        Text("\(filtered.count) project\(filtered.count == 1 ? "" : "s")")
                            .font(.system(size: 12))
                            .foregroundColor(AvatarGColors.textTertiary)

                        Spacer()

                        Menu {
                            ForEach(ProjectSort.allCases, id: \.self) { sort in
                                Button(action: { selectedSort = sort }) {
                                    HStack {
                                        Text(sort.rawValue)
                                        if selectedSort == sort { Image(systemName: "checkmark") }
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.up.arrow.down")
                                    .font(.system(size: 11))
                                Text(selectedSort.rawValue)
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundColor(AvatarGColors.textSecondary)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)

                    // Grid
                    if filtered.isEmpty {
                        emptyState
                    } else {
                        projectsGrid
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
                    Text("My Projects")
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

            TextField("Search projects...", text: $searchText)
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

    // MARK: - Filter Chips

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ProjectFilter.allCases, id: \.self) { filter in
                    filterChip(filter)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func filterChip(_ filter: ProjectFilter) -> some View {
        let isSelected = selectedFilter == filter

        return Button(action: {
            withAnimation(.spring(response: 0.24, dampingFraction: 0.8)) {
                selectedFilter = filter
            }
        }) {
            Text(filter.rawValue)
                .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? .white : AvatarGColors.textSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(
                    Capsule()
                        .fill(isSelected ? AvatarGColors.cyanBase.opacity(0.2) : AvatarGColors.glassBackground)
                        .overlay(Capsule().stroke(isSelected ? AvatarGColors.cyanBase.opacity(0.5) : AvatarGColors.glassBorder, lineWidth: 1))
                )
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - Projects Grid

    private var projectsGrid: some View {
        ScrollView(showsIndicators: false) {
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                spacing: 12
            ) {
                ForEach(filtered) { project in
                    projectCard(project)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
    }

    private func projectCard(_ project: Project) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Thumbnail
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(
                        LinearGradient(
                            colors: [project.thumbnailColor.opacity(0.3), project.thumbnailColor.opacity(0.08)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(height: 110)

                Image(systemName: project.icon)
                    .font(.system(size: 28))
                    .foregroundColor(project.thumbnailColor.opacity(0.8))

                if let duration = project.duration {
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            Text(duration)
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .foregroundColor(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Color.black.opacity(0.5)))
                        }
                        .padding(8)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Meta
            VStack(alignment: .leading, spacing: 2) {
                Text(project.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)

                Text(project.service)
                    .font(.system(size: 11))
                    .foregroundColor(AvatarGColors.textTertiary)

                Text(relativeDate(project.createdAt))
                    .font(.system(size: 10))
                    .foregroundColor(AvatarGColors.textTertiary.opacity(0.7))
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(AvatarGColors.spaceCard)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(AvatarGColors.glassBorder, lineWidth: 1))
        )
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "folder.badge.questionmark")
                .font(.system(size: 48))
                .foregroundColor(AvatarGColors.textTertiary)

            Text("No projects found")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(AvatarGColors.textSecondary)

            if !searchText.isEmpty {
                Text("Try a different search term")
                    .font(.system(size: 13))
                    .foregroundColor(AvatarGColors.textTertiary)
            }
            Spacer()
        }
    }

    // MARK: - Helpers

    private func relativeDate(_ date: Date) -> String {
        let diff = Date().timeIntervalSince(date)
        if diff < 3600 { return "\(Int(diff / 60))m ago" }
        if diff < 86400 { return "\(Int(diff / 3600))h ago" }
        return "\(Int(diff / 86400))d ago"
    }
}
