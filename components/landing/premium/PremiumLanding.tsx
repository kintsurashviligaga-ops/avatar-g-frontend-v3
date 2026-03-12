'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * MyAvatar.ge world-class landing page.
 * Sections: Hero → Trust → Services → Agent G → Workflow → Features → Use Cases → Workspace/Templates → CTA → Footer
 */

import { HeroSection } from './HeroSection'
import { TrustStrip } from './TrustStrip'
import { ServicesOverview } from './ServicesOverview'
import { AgentGSection } from './AgentGSection'
import { WorkflowDemo } from './WorkflowDemo'
import { FeatureHighlights } from './FeatureHighlights'
import { UseCases } from './UseCases'
import { WorkspaceTemplates } from './WorkspaceTemplates'
import { LandingCTA } from './LandingCTA'
import { LandingFooter } from './LandingFooter'

export default function PremiumLanding() {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <HeroSection />
      <TrustStrip />
      <Separator />
      <ServicesOverview />
      <Separator />
      <AgentGSection />
      <Separator />
      <WorkflowDemo />
      <Separator />
      <FeatureHighlights />
      <Separator />
      <UseCases />
      <Separator />
      <WorkspaceTemplates />
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
