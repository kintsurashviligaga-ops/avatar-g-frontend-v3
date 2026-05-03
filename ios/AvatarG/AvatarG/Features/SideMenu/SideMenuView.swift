import SwiftUI

// MARK: - Side Menu View

struct SideMenuView: View {
    @EnvironmentObject var appState: AppState
    @Binding var isOpen: Bool
    let onNavigate: (SideMenuRoute) -> Void
    let onTabSelect: (Int) -> Void

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Dim overlay
                if isOpen {
                    Color.black.opacity(0.6)
                        .ignoresSafeArea()
                        .onTapGesture { close() }
                        .transition(.opacity)
                }

                // Drawer panel
                if isOpen {
                    drawerPanel(width: min(geo.size.width * 0.82, 340))
                        .transition(.move(edge: .leading))
                        .zIndex(1)
                }
            }
            .animation(.spring(response: 0.32, dampingFraction: 0.88), value: isOpen)
        }
        .ignoresSafeArea()
    }

    // MARK: - Drawer Panel

    private func drawerPanel(width: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            // Background
            Rectangle()
                .fill(AvatarGColors.spaceDeep)
                .overlay(alignment: .trailing) {
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [AvatarGColors.cyanBase.opacity(0.08), .clear],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: 1)
                }

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    profileHeader
                    Divider().background(AvatarGColors.glassBorder).padding(.vertical, 8)
                    menuSection(title: "NAVIGATION", items: mainNavItems)
                    Divider().background(AvatarGColors.glassBorder).padding(.vertical, 8)
                    menuSection(title: "ACCOUNT", items: accountItems)
                    Divider().background(AvatarGColors.glassBorder).padding(.vertical, 8)
                    menuSection(title: "CONTENT", items: contentItems)
                    Divider().background(AvatarGColors.glassBorder).padding(.vertical, 8)
                    menuSection(title: "CONFIGURATION", items: configItems)
                    Divider().background(AvatarGColors.glassBorder).padding(.vertical, 8)
                    menuSection(title: "SUPPORT", items: supportItems)
                    Divider().background(AvatarGColors.glassBorder).padding(.vertical, 8)
                    signOutRow
                    versionFooter
                    Color.clear.frame(height: 40)
                }
                .padding(.top, 56)
            }
        }
        .frame(width: width)
        .ignoresSafeArea()
    }

    // MARK: - Profile Header

    private var profileHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Avatar
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [AvatarGColors.cyanBase.opacity(0.3), AvatarGColors.violetBase.opacity(0.3)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                    .overlay(Circle().stroke(AvatarGColors.cyanBase.opacity(0.4), lineWidth: 1.5))

                Text(initials)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(appState.currentUser?.name ?? "User")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundColor(.white)

                Text(appState.currentUser?.email ?? "")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(AvatarGColors.textSecondary)
                    .lineLimit(1)
            }

            HStack(spacing: 8) {
                tierBadge
                creditsBadge
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 4)
    }

    private var initials: String {
        let name = appState.currentUser?.name ?? "U"
        return String(name.prefix(2)).uppercased()
    }

    private var tierBadge: some View {
        let tier = appState.currentUser?.subscriptionTier ?? .starter
        let color: Color = tier == .studio ? AvatarGColors.violetBase : (tier == .pro ? AvatarGColors.cyanBase : AvatarGColors.emeraldBase)
        return Text(tier.displayName.uppercased())
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(color.opacity(0.15)))
            .overlay(Capsule().stroke(color.opacity(0.3), lineWidth: 1))
    }

    private var creditsBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(AvatarGColors.cyanBase)
            Text("\(appState.credits) credits")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(AvatarGColors.textSecondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Capsule().fill(AvatarGColors.glassBackground))
        .overlay(Capsule().stroke(AvatarGColors.glassBorder, lineWidth: 1))
    }

    // MARK: - Menu Sections

    struct MenuItem {
        let icon: String
        let label: String
        let color: Color
        let badge: String?
        let action: () -> Void

        init(icon: String, label: String, color: Color, badge: String? = nil, action: @escaping () -> Void) {
            self.icon = icon
            self.label = label
            self.color = color
            self.badge = badge
            self.action = action
        }
    }

    private func menuSection(title: String, items: [MenuItem]) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(AvatarGColors.textTertiary)
                .padding(.horizontal, 20)
                .padding(.bottom, 4)

            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                menuRow(item)
            }
        }
        .padding(.vertical, 6)
    }

    private func menuRow(_ item: MenuItem) -> some View {
        Button(action: {
            item.action()
        }) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(item.color.opacity(0.12))
                        .frame(width: 34, height: 34)
                    Image(systemName: item.icon)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(item.color)
                }

                Text(item.label)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(AvatarGColors.textPrimary)

                Spacer()

                if let badge = item.badge {
                    Text(badge)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(AvatarGColors.cyanBase))
                }

                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AvatarGColors.textTertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowButtonStyle())
    }

    // MARK: - Nav Item Groups

    private var mainNavItems: [MenuItem] {
        [
            MenuItem(icon: "house.fill", label: "Home", color: AvatarGColors.cyanBase) {
                onTabSelect(0); close()
            },
            MenuItem(icon: "bubble.left.and.bubble.right.fill", label: "Agent G", color: AvatarGColors.violetBase,
                     badge: appState.hasNewAgentMessage ? "●" : nil) {
                onTabSelect(1); close()
            },
            MenuItem(icon: "music.note.list", label: "Music Studio", color: AvatarGColors.emeraldBase) {
                onTabSelect(2); close()
            },
            MenuItem(icon: "photo.on.rectangle", label: "Gallery", color: Color(hex: "#f59e0b")) {
                onTabSelect(3); close()
            },
        ]
    }

    private var accountItems: [MenuItem] {
        [
            MenuItem(icon: "person.fill", label: "My Account", color: AvatarGColors.cyanBase) {
                onTabSelect(4); close()
            },
            MenuItem(icon: "crown.fill", label: "Packages & Pricing", color: Color(hex: "#f59e0b")) {
                onNavigate(.packages); close()
            },
            MenuItem(icon: "bolt.fill", label: "Credits", color: AvatarGColors.emeraldBase) {
                onNavigate(.credits); close()
            },
        ]
    }

    private var contentItems: [MenuItem] {
        [
            MenuItem(icon: "folder.fill", label: "My Projects", color: AvatarGColors.violetBase) {
                onNavigate(.projects); close()
            },
            MenuItem(icon: "books.vertical.fill", label: "Libraries", color: AvatarGColors.cyanBase) {
                onNavigate(.library); close()
            },
        ]
    }

    private var configItems: [MenuItem] {
        [
            MenuItem(icon: "gearshape.fill", label: "Settings", color: AvatarGColors.textSecondary) {
                onNavigate(.settings); close()
            },
            MenuItem(icon: "key.fill", label: "API Keys", color: Color(hex: "#f59e0b")) {
                onNavigate(.apiKeys); close()
            },
        ]
    }

    private var supportItems: [MenuItem] {
        [
            MenuItem(icon: "questionmark.circle.fill", label: "Help & FAQ", color: AvatarGColors.cyanBase) {
                onNavigate(.help); close()
            },
            MenuItem(icon: "sparkles", label: "What's New", color: AvatarGColors.violetBase) {
                onNavigate(.whatsNew); close()
            },
        ]
    }

    // MARK: - Sign Out Row

    private var signOutRow: some View {
        Button(action: {
            close()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                appState.signOut()
            }
        }) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(AvatarGColors.crimsonBase.opacity(0.12))
                        .frame(width: 34, height: 34)
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(AvatarGColors.crimsonBase)
                }

                Text("Sign Out")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(AvatarGColors.crimsonBase)

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowButtonStyle())
        .padding(.vertical, 6)
    }

    // MARK: - Version Footer

    private var versionFooter: some View {
        VStack(spacing: 4) {
            Text("Avatar G · myavatar.ge")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(AvatarGColors.textTertiary)

            Text("Version 1.0.0 · Build 1")
                .font(.system(size: 10))
                .foregroundColor(AvatarGColors.textTertiary.opacity(0.6))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .padding(.horizontal, 20)
    }

    private func close() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
            isOpen = false
        }
    }
}

// MARK: - Menu Row Button Style

struct MenuRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                configuration.isPressed
                    ? AvatarGColors.glassBackground
                    : Color.clear
            )
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Hamburger Button

struct HamburgerButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(AvatarGColors.textPrimary)
                        .frame(width: 22, height: 2)
                }
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(AvatarGColors.glassBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(AvatarGColors.glassBorder, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}
