'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * MyAvatar.ge modern landing page.
 * Theme-aware, clean layout, premium feel.
 */

import { HeroSection } from './HeroSection'
import { SuggestionCards } from './SuggestionCards'
import { ChatInputDock } from './ChatInputDock'
import FeatureGrid from './FeatureGrid'
import { AgentGHero } from './AgentGHero'
import { WorkflowPipelineSection } from './WorkflowPipelineSection'
import { LandingCTA } from './LandingCTA'
import { LandingFooter } from './LandingFooter'

export default function PremiumLanding() {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <HeroSection />

      {/* Content sections with consistent max-width and padding */}
      <div className="relative">
        <SuggestionCards />
        <ChatInputDock />
        <Separator />
        <AgentGHero />
        <Separator />
        <WorkflowPipelineSection />
        <Separator />
        <FeatureGrid />
        <LandingCTA />
      </div>

      <LandingFooter />
    </div>
  )
}

function Separator() {
  return (
    <div className="max-w-lg mx-auto px-10">
      <div className="h-px" style={{ background: 'linear-gradient(to right, transparent, var(--color-border), transparent)' }} />
    </div>
  )
}
