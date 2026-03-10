'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * New MyAvatar.ge premium landing page.
 * Minimal dark interface, strong typography, mobile-first.
 * Replaces the old LandingPageClient.
 */

import { HeroSection } from './HeroSection'
import { SuggestionCards } from './SuggestionCards'
import { ChatInputDock } from './ChatInputDock'
import { FeatureGrid } from './FeatureGrid'
import { ValueStrip } from './ValueStrip'
import { LandingCTA } from './LandingCTA'
import { LandingFooter } from './LandingFooter'

export default function PremiumLanding() {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white overflow-x-hidden selection:bg-white/10">
      {/* Subtle ambient radials */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.015),transparent_65%)]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[radial-gradient(circle_at_0%_100%,rgba(255,255,255,0.008),transparent_60%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <HeroSection />
        <SuggestionCards />
        <ChatInputDock />

        {/* Separator */}
        <div className="max-w-xl mx-auto px-10">
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>

        <FeatureGrid />

        {/* Separator */}
        <div className="max-w-xl mx-auto px-10">
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>

        <ValueStrip />
        <LandingCTA />
        <LandingFooter />
      </div>
    </div>
  )
}
