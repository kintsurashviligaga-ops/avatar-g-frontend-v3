'use client'

import { LandingNavbar } from './LandingNavbar'
import { HeroSection } from './HeroSection'
import { ServicesGrid } from './ServicesGrid'
import { AgentGSection } from './AgentGSection'
import { StatsSection } from './StatsSection'
import { TestimonialsSection } from './TestimonialsSection'
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
    <div className="max-w-lg mx-auto px-10">
      <div
        className="h-px"
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(34,211,238,0.15), rgba(255,255,255,0.06), rgba(34,211,238,0.15), transparent)',
        }}
      />
    </div>
  )
}
