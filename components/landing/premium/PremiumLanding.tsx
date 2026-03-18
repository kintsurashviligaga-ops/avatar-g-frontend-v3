'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * MyAvatar.ge world-class landing page.
 * Sections: Hero → Workflow Pipeline Builder → Services → Demo/Preview → CTA → Footer
 */

import { HeroSection } from './HeroSection'
import { WorkflowPipelineBuilder } from './WorkflowPipelineBuilder'
import { ServicesShowcase } from './ServicesShowcase'
import { DemoPreviewSection } from './DemoPreviewSection'
import { AppDownloadSection } from './AppDownloadSection'
import { LandingFooter } from './LandingFooter'
import { BottomChatBar } from '@/components/chat/bottom/BottomChatBar'

export default function PremiumLanding() {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: 'var(--color-text)' }}>
      <HeroSection />
      <Separator />
      <WorkflowPipelineBuilder />
      <Separator />
      <ServicesShowcase />
      <Separator />
      <DemoPreviewSection />
      <Separator />
      <AppDownloadSection />
      <Separator />
      <BottomChatBar mode="landing" />
      <LandingFooter />
    </div>
  )
}

function Separator() {
  return (
    <div className="max-w-lg mx-auto px-10">
      <div className="h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(34,211,238,0.15), rgba(255,255,255,0.06), rgba(34,211,238,0.15), transparent)' }} />
    </div>
  )
}
