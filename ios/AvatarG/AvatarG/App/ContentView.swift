import SwiftUI

// MARK: - Content View (Root Tab Container)

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var agentViewModel = AgentGViewModel()
    @State private var showAgentSheet = false

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $appState.selectedTab) {
                HomeView()
                    .tabItem {
                        Label("Home", systemImage: "house.fill")
                    }
                    .tag(0)
                    .environmentObject(appState)

                AgentGChatView()
                    .tabItem {
                        Label("Agent G", systemImage: "bubble.left.and.bubble.right.fill")
                    }
                    .tag(1)
                    .badge(appState.hasNewAgentMessage ? "●" : nil)
                    .environmentObject(agentViewModel)
                    .environmentObject(appState)

                MusicStudioView()
                    .tabItem {
                        Label("Studio", systemImage: "music.note.list")
                    }
                    .tag(2)
                    .environmentObject(appState)

                GalleryView()
                    .tabItem {
                        Label("Gallery", systemImage: "photo.on.rectangle")
                    }
                    .tag(3)
                    .environmentObject(appState)

                ProfileView()
                    .tabItem {
                        Label("Profile", systemImage: "person.circle")
                    }
                    .tag(4)
                    .environmentObject(appState)
            }
            .accentColor(AvatarGColors.cyanBase)

            // Floating Agent G Button (only show on non-agent tabs)
            if appState.selectedTab != 1 {
                FloatingAgentGButton {
                    appState.hasNewAgentMessage = false
                    showAgentSheet = true
                }
                .padding(.bottom, 80)
                .transition(.scale.combined(with: .opacity))
                .animation(.avatarGSpring, value: appState.selectedTab)
            }
        }
        .sheet(isPresented: $showAgentSheet) {
            AgentGChatView()
                .environmentObject(agentViewModel)
                .environmentObject(appState)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
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
                // Pulse rings
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
