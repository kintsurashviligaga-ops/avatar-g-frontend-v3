'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * MyAvatar.ge world-class landing page.
 * Sections: Hero → Trust → Services → Agent G → Workflow → Features → Use Cases → Workspace/Templates → ChatBar → CTA → Footer
 */

import { HeroSection } from './HeroSection'
import { TrustStrip } from './TrustStrip'
import { ServicesOverview } from './ServicesOverview'
import { AgentGSection } from './AgentGSection'
import { PromoVideo } from './PromoVideo'
import { WorkflowDemo } from './WorkflowDemo'
import { FeatureHighlights } from './FeatureHighlights'
import { UseCases } from './UseCases'
import { WorkspaceTemplates } from './WorkspaceTemplates'
import { LandingCTA } from './LandingCTA'
import { LandingFooter } from './LandingFooter'
import { BottomChatBar } from '@/components/chat/bottom/BottomChatBar'

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
      <PromoVideo />
      <Separator />
      <WorkflowDemo />
      <Separator />
      <FeatureHighlights />
      <Separator />
      <UseCases />
      <Separator />
      <WorkspaceTemplates />
      <Separator />
      <LandingCTA />
      <LandingFooter />

      {/* Spacer for the fixed bottom chat bar + bottom nav */}
      <div className="h-44 md:h-36" />

      {/* Sticky bottom chat bar — always visible, sits above bottom nav on mobile */}
      <BottomChatBar mode="landing" className="fixed bottom-0 inset-x-0 z-[190] pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]" />
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
