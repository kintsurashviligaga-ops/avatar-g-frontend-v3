'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * Main landing flow — Neo-Cosmic Futurism redesign
 * Flow: Hero → ServicesGrid → AgentGSection → StatsSection → PricingTeaser → LandingCTA → LandingFooter
 */

import { HeroSection } from './HeroSection'
import { ServicesGrid } from './ServicesGrid'
import { AgentGSection } from './AgentGSection'
import { StatsSection } from './StatsSection'
import { PricingTeaser } from './PricingTeaser'
import { LandingCTA } from './LandingCTA'
import { LandingFooter } from './LandingFooter'

export default function PremiumLanding() {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: 'var(--color-text)' }}>
      <HeroSection />
      <Separator />
      <ServicesGrid />
      <Separator />
      <AgentGSection />
      <Separator />
      <StatsSection />
      <Separator />
      <PricingTeaser />
      <Separator />
      <LandingCTA />
      <LandingFooter />
    </div>
  )
}

function Separator() {
  return (
    <div className="max-w-lg mx-auto px-10">
      <div
        className="h-px"
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(34,211,238,0.15), rgba(255,255,255,0.06), rgba(34,211,238,0.15), transparent)',
        }}
      />
    </div>
  )
}
