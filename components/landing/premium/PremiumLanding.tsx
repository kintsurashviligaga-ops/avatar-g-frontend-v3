'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * MyAvatar.ge modern landing page.
 * Theme-aware, clean layout, premium feel.
 */

import dynamic from 'next/dynamic'
import { HeroSection } from './HeroSection'
import { SuggestionCards } from './SuggestionCards'
import { ChatInputDock } from './ChatInputDock'
import { FeatureGrid } from './FeatureGrid'
import { ValueStrip } from './ValueStrip'
import { LandingCTA } from './LandingCTA'
import { LandingFooter } from './LandingFooter'
import { WorkflowPipelineSection } from './WorkflowPipelineSection'

export default function PremiumLanding() {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <HeroSection />
      <SuggestionCards />
      <ChatInputDock />
      <Separator />
      <FeatureGrid />
      <Separator />
      <WorkflowPipelineSection />
      <Separator />
      <ValueStrip />
      <LandingCTA />
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
