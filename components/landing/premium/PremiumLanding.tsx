'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * MyAvatar.ge world-class landing page.
 * Flow: Hero → Services → Avatar Creation → Workflow Builder → App Download → Footer
 */

import { HeroSection } from './HeroSection'
import { ServicesSlider } from './ServicesSlider'
import { AvatarShowcase } from './AvatarShowcase'
import { WorkflowPipelineBuilder } from './WorkflowPipelineBuilder'
import { AppDownloadSection } from './AppDownloadSection'
import { LandingFooter } from './LandingFooter'

export default function PremiumLanding() {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: 'var(--color-text)' }}>
      <HeroSection />
      <Separator />
      <ServicesSlider />
      <Separator />
      <AvatarShowcase locale="en" />
      <Separator />
      <WorkflowPipelineBuilder createdAvatar={null} />
      <Separator />
      <AppDownloadSection />
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
