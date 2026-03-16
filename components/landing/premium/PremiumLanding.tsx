'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * MyAvatar.ge world-class landing page.
 * Sections: Hero → Workflow Pipeline Builder → CTA → Footer
 */

import { HeroSection } from './HeroSection'
import { WorkflowPipelineBuilder } from './WorkflowPipelineBuilder'
import { LandingFooter } from './LandingFooter'

export default function PremiumLanding() {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <HeroSection />
      <Separator />
      <WorkflowPipelineBuilder />
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
