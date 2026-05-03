import SwiftUI

// MARK: - Content View (Root Tab Container)

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var agentViewModel = AgentGViewModel()

    // Floating agent sheet
    @State private var showAgentSheet = false

    // Side menu
    @State private var isSideMenuOpen = false

    // Sheet routing from side menu
    @State private var activeRoute: SideMenuRoute? = nil
    @State private var showPackages  = false
    @State private var showSettings  = false
    @State private var showAPIKeys   = false
    @State private var showProjects  = false
    @State private var showLibrary   = false

    var body: some View {
        ZStack {
            // Main tab content
            tabContent

            // Side menu overlay (above everything)
            SideMenuView(
                isOpen: $isSideMenuOpen,
                onNavigate: { route in
                    switch route {
                    case .packages, .credits:  showPackages = true
                    case .settings:            showSettings = true
                    case .apiKeys:             showAPIKeys = true
                    case .projects:            showProjects = true
                    case .library:             showLibrary = true
                    case .account:             appState.selectedTab = 4
                    case .help, .whatsNew:     break
                    }
                },
                onTabSelect: { tab in
                    appState.selectedTab = tab
                }
            )
            .environmentObject(appState)
        }
        .sheet(isPresented: $showPackages)  { PackagesView().environmentObject(appState) }
        .sheet(isPresented: $showSettings)  { AppSettingsView().environmentObject(appState) }
        .sheet(isPresented: $showAPIKeys)   { APIKeysView() }
        .sheet(isPresented: $showProjects)  { ProjectsView() }
        .sheet(isPresented: $showLibrary)   { LibraryView() }
        .sheet(isPresented: $showAgentSheet) {
            AgentGChatView()
                .environmentObject(agentViewModel)
                .environmentObject(appState)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Tab Content

    private var tabContent: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $appState.selectedTab) {
                HomeView()
                    .tabItem { Label("Home", systemImage: "house.fill") }
                    .tag(0)
                    .environmentObject(appState)
                    .toolbar { hamburgerToolbarItem }

                AgentGChatView()
                    .tabItem { Label("Agent G", systemImage: "bubble.left.and.bubble.right.fill") }
                    .tag(1)
                    .badge(appState.hasNewAgentMessage ? "●" : nil)
                    .environmentObject(agentViewModel)
                    .environmentObject(appState)

                MusicStudioView()
                    .tabItem { Label("Studio", systemImage: "music.note.list") }
                    .tag(2)
                    .environmentObject(appState)

                GalleryView()
                    .tabItem { Label("Gallery", systemImage: "photo.on.rectangle") }
                    .tag(3)
                    .environmentObject(appState)

                ProfileView()
                    .tabItem { Label("Profile", systemImage: "person.circle") }
                    .tag(4)
                    .environmentObject(appState)
            }
            .accentColor(AvatarGColors.cyanBase)

            // Floating Agent G button (non-agent tabs only)
            if appState.selectedTab != 1 && !isSideMenuOpen {
                FloatingAgentGButton {
                    appState.hasNewAgentMessage = false
                    showAgentSheet = true
                }
                .padding(.bottom, 80)
                .transition(.scale.combined(with: .opacity))
                .animation(.avatarGSpring, value: appState.selectedTab)
            }
        }
        .overlay(alignment: .topLeading) {
            // Global hamburger button — visible on all tabs
            HamburgerButton {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
                    isSideMenuOpen.toggle()
                }
            }
            .padding(.top, topSafeInset + 8)
            .padding(.leading, 16)
        }
    }

    // The toolbar item approach is unreliable with TabView; we use overlay instead.
    private var hamburgerToolbarItem: some ToolbarContent {
        ToolbarItem(placement: .navigationBarLeading) {
            EmptyView()
        }
    }

    private var topSafeInset: CGFloat {
        (UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows
            .first?.safeAreaInsets.top) ?? 44
    }
}

// MARK: - Floating Agent G Button

struct FloatingAgentGButton: View {
    let action: () -> Void

    @State private var pulseScale: CGFloat = 1.0
    @State private var glowOpacity: Double = 0.6

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(AvatarGColors.cyanBase.opacity(0.15))
                    .frame(width: 60, height: 60)
                    .scaleEffect(pulseScale)

                Circle()
                    .fill(AvatarGColors.gradientCyanViolet)
                    .frame(width: 48, height: 48)
                    .shadow(color: AvatarGColors.cyanBase.opacity(glowOpacity), radius: 12, x: 0, y: 0)
                    .shadow(color: AvatarGColors.cyanBase.opacity(glowOpacity * 0.5), radius: 20, x: 0, y: 0)

                Text("G")
                    .font(.system(size: 20, weight: .black, design: .rounded))
                    .foregroundColor(.white)
            }
        }
        .buttonStyle(PlainButtonStyle())
        .onAppear {
            withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) {
                pulseScale = 1.25
                glowOpacity = 0.9
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState.shared)
        .preferredColorScheme(.dark)
}
