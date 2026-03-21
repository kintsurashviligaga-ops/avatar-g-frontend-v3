'use client'

/**
 * PremiumLanding.tsx
 * ==================
 * MyAvatar.ge world-class landing page.
 * Flow: Hero → Avatar Creation → Workflow Builder → App Download → Footer
 */

import { useState, useCallback } from 'react'
import { HeroSection } from './HeroSection'
import { WorkflowPipelineBuilder } from './WorkflowPipelineBuilder'
import { AppDownloadSection } from './AppDownloadSection'
import { LandingFooter } from './LandingFooter'
import { AvatarBuilderWindow } from './AvatarBuilderWindow'

export default function PremiumLanding() {
  const [createdAvatar, setCreatedAvatar] = useState<string | null>(null)

  const handleAvatarCreated = useCallback((avatarSrc: string) => {
    setCreatedAvatar(avatarSrc)
  }, [])

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: 'var(--color-text)' }}>
      <HeroSection />
      <Separator />
      <div className="px-4 sm:px-6 py-10 sm:py-14 lg:py-16">
        <AvatarBuilderWindow onAvatarCreated={handleAvatarCreated} />
      </div>
      <Separator />
      <WorkflowPipelineBuilder createdAvatar={createdAvatar} />
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
