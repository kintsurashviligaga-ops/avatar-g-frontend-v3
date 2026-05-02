import SwiftUI

// MARK: - Colors

struct AvatarGColors {
    // Core background
    static let spaceVoid = Color(hex: "#03030a")
    static let spaceDeep = Color(hex: "#0a0a0f")
    static let spaceMid = Color(hex: "#12121a")
    static let spaceCard = Color(hex: "#16161f")

    // Brand
    static let cyanBase = Color(hex: "#00d4ff")
    static let cyanLight = Color(hex: "#33ddff")
    static let cyanDark = Color(hex: "#00a8cc")

    static let violetBase = Color(hex: "#7c3aed")
    static let violetLight = Color(hex: "#9b5cf6")
    static let violetDark = Color(hex: "#5b21b6")

    static let emeraldBase = Color(hex: "#00c896")
    static let emeraldLight = Color(hex: "#33d4aa")
    static let emeraldDark = Color(hex: "#00a07a")

    static let crimsonBase = Color(hex: "#e83a3a")
    static let crimsonLight = Color(hex: "#f06060")
    static let crimsonDark = Color(hex: "#c02020")

    // Text
    static let textPrimary = Color.white
    static let textSecondary = Color(white: 0.6)
    static let textTertiary = Color(white: 0.4)

    // Glass
    static let glassBackground = Color.white.opacity(0.05)
    static let glassBorder = Color.white.opacity(0.1)
    static let glassHighlight = Color.white.opacity(0.15)

    // Gradients
    static let gradientCyanViolet = LinearGradient(
        colors: [cyanBase, violetBase],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let gradientVioletEmerald = LinearGradient(
        colors: [violetBase, emeraldBase],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let gradientCyanEmerald = LinearGradient(
        colors: [cyanBase, emeraldBase],
        startPoint: .leading,
        endPoint: .trailing
    )

    static let gradientSpaceBackground = LinearGradient(
        colors: [spaceVoid, spaceDeep],
        startPoint: .top,
        endPoint: .bottom
    )
}

// MARK: - Color Hex Extension

extension Color {
    init(hex: String) {
        var sanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        sanitized = sanitized.hasPrefix("#") ? String(sanitized.dropFirst()) : sanitized

        var rgb: UInt64 = 0
        Scanner(string: sanitized).scanHexInt64(&rgb)

        let r = Double((rgb & 0xFF0000) >> 16) / 255.0
        let g = Double((rgb & 0x00FF00) >> 8) / 255.0
        let b = Double(rgb & 0x0000FF) / 255.0

        self.init(red: r, green: g, blue: b)
    }
}

// MARK: - Typography

struct AvatarGFonts {
    // Display - Large titles (Syne-like weight)
    static func display(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    // Body - Clean readable
    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }

    // Mono - Code/data
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    // Predefined scales
    static let displayXL = display(40, weight: .black)
    static let displayLarge = display(32, weight: .bold)
    static let displayMedium = display(24, weight: .bold)
    static let displaySmall = display(20, weight: .semibold)

    static let bodyLarge = body(18)
    static let bodyMedium = body(16)
    static let bodySmall = body(14)
    static let bodyXSmall = body(12)

    static let monoMedium = mono(15)
    static let monoSmall = mono(13)
}

// MARK: - Spacing

struct AvatarGSpacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
    static let xxl: CGFloat = 48
    static let xxxl: CGFloat = 64
}

// MARK: - Corner Radius

struct AvatarGRadius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 20
    static let xxl: CGFloat = 24
    static let full: CGFloat = 100
}

// MARK: - ViewModifiers

struct GlowEffectModifier: ViewModifier {
    var color: Color
    var radius: CGFloat
    var opacity: Double

    func body(content: Content) -> some View {
        content
            .shadow(color: color.opacity(opacity), radius: radius, x: 0, y: 0)
            .shadow(color: color.opacity(opacity * 0.5), radius: radius * 2, x: 0, y: 0)
    }
}

struct GlassCardModifier: ViewModifier {
    var cornerRadius: CGFloat
    var borderOpacity: Double

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(AvatarGColors.glassBackground)
                    .background(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .fill(.ultraThinMaterial)
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(AvatarGColors.glassBorder.opacity(borderOpacity), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}

struct NeonBorderModifier: ViewModifier {
    var color: Color
    var cornerRadius: CGFloat
    var lineWidth: CGFloat

    func body(content: Content) -> some View {
        content
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(
                        LinearGradient(
                            colors: [color, color.opacity(0.3), color],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: lineWidth
                    )
                    .shadow(color: color.opacity(0.5), radius: 4, x: 0, y: 0)
            )
    }
}

// MARK: - View Extension for Modifiers

extension View {
    func glowEffect(color: Color = AvatarGColors.cyanBase, radius: CGFloat = 10, opacity: Double = 0.7) -> some View {
        modifier(GlowEffectModifier(color: color, radius: radius, opacity: opacity))
    }

    func glassCard(cornerRadius: CGFloat = AvatarGRadius.lg, borderOpacity: Double = 1.0) -> some View {
        modifier(GlassCardModifier(cornerRadius: cornerRadius, borderOpacity: borderOpacity))
    }

    func neonBorder(color: Color = AvatarGColors.cyanBase, cornerRadius: CGFloat = AvatarGRadius.lg, lineWidth: CGFloat = 1) -> some View {
        modifier(NeonBorderModifier(color: color, cornerRadius: cornerRadius, lineWidth: lineWidth))
    }

    func cardBackground(cornerRadius: CGFloat = AvatarGRadius.lg) -> some View {
        background(
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(AvatarGColors.spaceCard)
        )
    }
}

// MARK: - Gradient Shapes

struct CyanVioletGradientBackground: View {
    var body: some View {
        LinearGradient(
            colors: [AvatarGColors.cyanBase, AvatarGColors.violetBase],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - Animation Presets

extension Animation {
    static let avatarGSpring = Animation.spring(response: 0.4, dampingFraction: 0.75)
    static let avatarGSmooth = Animation.easeInOut(duration: 0.3)
    static let avatarGPulse = Animation.easeInOut(duration: 1.2).repeatForever(autoreverses: true)
    static let avatarGFast = Animation.easeOut(duration: 0.2)
}
