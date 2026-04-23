'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * Main landing flow.
 * Flow: Hero → Trust → Value → Service overview → Use cases → Avatar creation → Workflow builder → CTA → Footer
 */

import { useState } from 'react'

import { HeroSection } from './HeroSection'
import { AvatarBuilderWindow } from './AvatarBuilderWindow'
import { WorkflowPipelineBuilder } from './WorkflowPipelineBuilder'
import { LandingFooter } from './LandingFooter'
import { TrustStrip } from './TrustStrip'
import { ValueStrip } from './ValueStrip'
import FeatureGrid from './FeatureGrid'
import { UseCases } from './UseCases'
import { LandingCTA } from './LandingCTA'

export default function PremiumLanding() {
  const [createdAvatar, setCreatedAvatar] = useState<string | null>(null)

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: 'var(--color-text)' }}>
      <HeroSection />
      <Separator />
      <TrustStrip />
      <ValueStrip />
      <Separator />
      <FeatureGrid />
      <UseCases />
      <Separator />
      <AvatarBuilderWindow onAvatarCreated={setCreatedAvatar} />
      <Separator />
      <WorkflowPipelineBuilder createdAvatar={createdAvatar} />
      <Separator />
      <LandingCTA />
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
