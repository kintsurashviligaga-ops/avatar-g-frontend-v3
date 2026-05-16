'use client'

import { LandingNavbar } from './LandingNavbar'
import { HeroSection } from './HeroSection'
import { ServicesGrid } from './ServicesGrid'
import { AgentGSection } from './AgentGSection'
import { StatsSection } from './StatsSection'
import { TestimonialsSection } from './TestimonialsSection'
import { ExampleGallerySection } from './ExampleGallerySection'
import { VideoDemoSection } from './VideoDemoSection'
import { TechBadgesSection } from './TechBadgesSection'
import { PricingTeaser } from './PricingTeaser'
import { LandingCTA } from './LandingCTA'
import { LandingFooter } from './LandingFooter'

export default function PremiumLanding() {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{ backgroundColor: 'var(--color-bg, #0a0a0c)', color: 'var(--color-text)' }}
    >
      <LandingNavbar />

      {/* Each section has an id so navbar anchor links work */}
      <div id="home">
        <HeroSection />
      </div>

      <Separator />

      <div id="services">
        <ServicesGrid />
      </div>

      <Separator />

      <div id="agent-g">
        <AgentGSection />
      </div>

      <Separator />

      <StatsSection />

      <Separator />

      <div id="testimonials">
        <TestimonialsSection />
      </div>

      <Separator />

      <div id="gallery">
        <ExampleGallerySection />
      </div>

      <Separator />

      <div id="demo">
        <VideoDemoSection />
      </div>

      <Separator />

      <TechBadgesSection />

      <Separator />

      <div id="pricing">
        <PricingTeaser />
      </div>

      <Separator />

      <div id="about">
        <LandingCTA />
      </div>

      <LandingFooter />
    </div>
  )
}

function Separator() {
  return (
    <div className="relative mx-auto px-4 sm:px-10" style={{ maxWidth: '72rem' }}>
      <div
        className="h-px"
        style={{
          background:
            'linear-gradient(to right, transparent 0%, rgba(0,212,255,0.12) 20%, rgba(255,255,255,0.08) 50%, rgba(0,212,255,0.12) 80%, transparent 100%)',
        }}
      />
    </div>
  )
}
