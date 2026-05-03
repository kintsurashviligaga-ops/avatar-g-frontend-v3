import SwiftUI

// MARK: - Packages View

struct PackagesView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var selectedBilling: BillingPeriod = .monthly
    @State private var selectedCreditPack: CreditPack? = nil
    @State private var showPurchaseConfirm = false

    enum BillingPeriod: String, CaseIterable {
        case monthly = "Monthly"
        case annual = "Annual"

        var discount: String? {
            switch self {
            case .monthly: return nil
            case .annual: return "Save 30%"
            }
        }
    }

    struct PlanTier: Identifiable {
        let id: String
        let name: String
        let tagline: String
        let monthlyPrice: Decimal
        let annualPrice: Decimal
        let credits: Int
        let color: Color
        let glowColor: Color
        let isPopular: Bool
        let features: [PlanFeature]
    }

    struct PlanFeature {
        let text: String
        let included: Bool
    }

    struct CreditPack: Identifiable {
        let id: String
        let credits: Int
        let price: Decimal
        let bonus: Int
        let label: String
    }

    private let plans: [PlanTier] = [
        PlanTier(
            id: "starter",
            name: "Starter",
            tagline: "Perfect to explore",
            monthlyPrice: 0,
            annualPrice: 0,
            credits: 50,
            color: AvatarGColors.emeraldBase,
            glowColor: AvatarGColors.emeraldBase,
            isPopular: false,
            features: [
                PlanFeature(text: "50 credits/month", included: true),
                PlanFeature(text: "Image & Music generation", included: true),
                PlanFeature(text: "Agent G chat", included: true),
                PlanFeature(text: "Gallery storage (500MB)", included: true),
                PlanFeature(text: "Video generation", included: false),
                PlanFeature(text: "Voice cloning", included: false),
                PlanFeature(text: "Priority generation", included: false),
                PlanFeature(text: "API access", included: false),
            ]
        ),
        PlanTier(
            id: "pro",
            name: "Pro",
            tagline: "For creators & studios",
            monthlyPrice: 19,
            annualPrice: 13.30,
            credits: 500,
            color: AvatarGColors.cyanBase,
            glowColor: AvatarGColors.cyanBase,
            isPopular: true,
            features: [
                PlanFeature(text: "500 credits/month", included: true),
                PlanFeature(text: "All generation types", included: true),
                PlanFeature(text: "Agent G + Live voice mode", included: true),
                PlanFeature(text: "Gallery storage (10GB)", included: true),
                PlanFeature(text: "Video generation (LTX 2.3)", included: true),
                PlanFeature(text: "Voice cloning (ElevenLabs)", included: true),
                PlanFeature(text: "Priority generation", included: true),
                PlanFeature(text: "API access", included: false),
            ]
        ),
        PlanTier(
            id: "studio",
            name: "Studio",
            tagline: "Full power unleashed",
            monthlyPrice: 49,
            annualPrice: 34.30,
            credits: 2000,
            color: AvatarGColors.violetBase,
            glowColor: AvatarGColors.violetBase,
            isPopular: false,
            features: [
                PlanFeature(text: "2000 credits/month", included: true),
                PlanFeature(text: "All generation types", included: true),
                PlanFeature(text: "Agent G + Live voice mode", included: true),
                PlanFeature(text: "Unlimited storage", included: true),
                PlanFeature(text: "Video + Avatar (HeyGen)", included: true),
                PlanFeature(text: "Voice cloning + Podcast studio", included: true),
                PlanFeature(text: "Priority generation", included: true),
                PlanFeature(text: "Full API access", included: true),
            ]
        ),
    ]

    private let creditPacks: [CreditPack] = [
        CreditPack(id: "c100",  credits: 100,  price: 3.99,  bonus: 0,   label: ""),
        CreditPack(id: "c300",  credits: 300,  price: 9.99,  bonus: 30,  label: "+10%"),
        CreditPack(id: "c750",  credits: 750,  price: 19.99, bonus: 150, label: "+20%"),
        CreditPack(id: "c2000", credits: 2000, price: 39.99, bonus: 600, label: "Best Value"),
    ]

    var body: some View {
        NavigationView {
            ZStack {
                AvatarGColors.spaceVoid.ignoresSafeArea()

                // Ambient glow
                Circle()
                    .fill(AvatarGColors.violetBase.opacity(0.06))
                    .frame(width: 400, height: 400)
                    .blur(radius: 80)
                    .offset(x: 100, y: -100)
                    .allowsHitTesting(false)

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 28) {
                        headerSection
                        billingToggle
                        plansSection
                        Divider().background(AvatarGColors.glassBorder).padding(.horizontal)
                        creditPacksSection
                        Color.clear.frame(height: 40)
                    }
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
                    Text("Packages")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Text("Unleash Your Creativity")
                .font(.system(size: 26, weight: .black, design: .rounded))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)

            Text("Choose the plan that fits your creative flow")
                .font(.system(size: 14))
                .foregroundColor(AvatarGColors.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    // MARK: - Billing Toggle

    private var billingToggle: some View {
        HStack(spacing: 0) {
            ForEach(BillingPeriod.allCases, id: \.self) { period in
                Button(action: {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                        selectedBilling = period
                    }
                }) {
                    HStack(spacing: 6) {
                        Text(period.rawValue)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(selectedBilling == period ? .white : AvatarGColors.textTertiary)

                        if let discount = period.discount {
                            Text(discount)
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(AvatarGColors.emeraldBase)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(AvatarGColors.emeraldBase.opacity(0.15)))
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 9)
                    .background(
                        Group {
                            if selectedBilling == period {
                                Capsule().fill(AvatarGColors.cyanBase.opacity(0.2))
                                    .overlay(Capsule().stroke(AvatarGColors.cyanBase.opacity(0.4), lineWidth: 1))
                            }
                        }
                    )
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .padding(4)
        .background(
            Capsule()
                .fill(AvatarGColors.glassBackground)
                .overlay(Capsule().stroke(AvatarGColors.glassBorder, lineWidth: 1))
        )
    }

    // MARK: - Plans

    private var plansSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(plans) { plan in
                    planCard(plan)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func planCard(_ plan: PlanTier) -> some View {
        let isCurrent = appState.currentUser?.subscriptionTier.rawValue == plan.id
        let price = selectedBilling == .monthly ? plan.monthlyPrice : plan.annualPrice

        return VStack(alignment: .leading, spacing: 0) {
            // Popular badge
            if plan.isPopular {
                HStack {
                    Spacer()
                    Text("MOST POPULAR")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(plan.color))
                }
                .padding(.bottom, -12)
                .zIndex(1)
            }

            VStack(alignment: .leading, spacing: 14) {
                // Tier name
                VStack(alignment: .leading, spacing: 4) {
                    Text(plan.name.uppercased())
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(plan.color)
                        .tracking(2)

                    Text(plan.tagline)
                        .font(.system(size: 12))
                        .foregroundColor(AvatarGColors.textSecondary)
                }

                // Price
                VStack(alignment: .leading, spacing: 2) {
                    if price == 0 {
                        Text("Free")
                            .font(.system(size: 34, weight: .black, design: .rounded))
                            .foregroundColor(.white)
                    } else {
                        HStack(alignment: .top, spacing: 2) {
                            Text("$")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(AvatarGColors.textSecondary)
                                .offset(y: 8)
                            Text(String(format: "%.0f", Double(truncating: price as NSDecimalNumber)))
                                .font(.system(size: 36, weight: .black, design: .rounded))
                                .foregroundColor(.white)
                        }
                        Text("per month")
                            .font(.system(size: 11))
                            .foregroundColor(AvatarGColors.textTertiary)
                    }
                }

                // Credits highlight
                HStack(spacing: 6) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 10))
                        .foregroundColor(plan.color)
                    Text("\(plan.credits) credits/mo")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(plan.color)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: 8).fill(plan.color.opacity(0.1)))

                // Features list
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(Array(plan.features.enumerated()), id: \.offset) { _, feature in
                        HStack(spacing: 8) {
                            Image(systemName: feature.included ? "checkmark.circle.fill" : "xmark.circle")
                                .font(.system(size: 13))
                                .foregroundColor(feature.included ? plan.color : AvatarGColors.textTertiary.opacity(0.5))

                            Text(feature.text)
                                .font(.system(size: 12))
                                .foregroundColor(feature.included ? AvatarGColors.textSecondary : AvatarGColors.textTertiary.opacity(0.5))
                        }
                    }
                }

                // CTA Button
                Button(action: {}) {
                    Text(isCurrent ? "Current Plan" : (plan.id == "starter" ? "Get Started" : "Upgrade"))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(isCurrent ? AvatarGColors.textTertiary : (plan.id == "starter" ? plan.color : .white))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(isCurrent ? AvatarGColors.glassBackground : (plan.id == "starter" ? plan.color.opacity(0.12) : plan.color.opacity(0.9)))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(isCurrent ? AvatarGColors.glassBorder : plan.color.opacity(0.5), lineWidth: 1)
                                )
                        )
                }
                .buttonStyle(PlainButtonStyle())
                .disabled(isCurrent)
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(AvatarGColors.spaceCard)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(
                                plan.isPopular
                                    ? LinearGradient(colors: [plan.color.opacity(0.6), plan.color.opacity(0.2)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                    : LinearGradient(colors: [AvatarGColors.glassBorder, AvatarGColors.glassBorder], startPoint: .topLeading, endPoint: .bottomTrailing),
                                lineWidth: plan.isPopular ? 1.5 : 1
                            )
                    )
                    .shadow(color: plan.isPopular ? plan.glowColor.opacity(0.15) : .clear, radius: 20, x: 0, y: 0)
            )
        }
        .frame(width: 220)
    }

    // MARK: - Credit Packs

    private var creditPacksSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Buy Credits")
                    .font(.system(size: 20, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)

                Text("Top up anytime, no subscription needed")
                    .font(.system(size: 13))
                    .foregroundColor(AvatarGColors.textSecondary)
                    .padding(.horizontal, 20)
            }

            VStack(spacing: 10) {
                ForEach(creditPacks) { pack in
                    creditPackRow(pack)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func creditPackRow(_ pack: CreditPack) -> some View {
        let isSelected = selectedCreditPack?.id == pack.id

        return Button(action: {
            withAnimation(.spring(response: 0.24, dampingFraction: 0.8)) {
                selectedCreditPack = isSelected ? nil : pack
            }
        }) {
            HStack(spacing: 14) {
                // Credits icon
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(AvatarGColors.cyanBase.opacity(0.1))
                        .frame(width: 44, height: 44)
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(AvatarGColors.gradientCyanViolet)
                }

                // Credits info
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("\(pack.credits + pack.bonus) credits")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.white)

                        if !pack.label.isEmpty {
                            Text(pack.label)
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(AvatarGColors.emeraldBase)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(AvatarGColors.emeraldBase.opacity(0.15)))
                        }
                    }

                    if pack.bonus > 0 {
                        Text("\(pack.credits) + \(pack.bonus) bonus")
                            .font(.system(size: 11))
                            .foregroundColor(AvatarGColors.textTertiary)
                    }
                }

                Spacer()

                // Price + select
                VStack(alignment: .trailing, spacing: 4) {
                    Text("$\(String(format: "%.2f", Double(truncating: pack.price as NSDecimalNumber)))")
                        .font(.system(size: 16, weight: .black, design: .rounded))
                        .foregroundColor(isSelected ? AvatarGColors.cyanBase : .white)

                    if isSelected {
                        Text("Selected")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(AvatarGColors.cyanBase)
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(isSelected ? AvatarGColors.cyanBase.opacity(0.08) : AvatarGColors.glassBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(isSelected ? AvatarGColors.cyanBase.opacity(0.4) : AvatarGColors.glassBorder, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}
