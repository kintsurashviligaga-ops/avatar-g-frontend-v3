'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Wordmark } from '@/components/brand/Wordmark'

interface BrandLogoProps {
  href?: string
  size?: 'nav' | 'xs' | 'sm' | 'sm20' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
  /** When true, renders slightly smaller — use when navbar is in scrolled/compact state */
  compact?: boolean
  /** Enable enhanced glow + breathing animation (hero variant) */
  glow?: boolean
  /** Show the brand tagline "AI CREATIVE STUDIO" under the wordmark */
  tagline?: boolean
}

const sizeMap = {
  // Phones get a 34 px rocket in the nav bar: at 42 px the mark + "MyAvatar.ge" pushed the header CTA off a
  // 360 px screen.
  nav:  { img: 42, cls: 'w-[34px] h-[34px] sm:w-[42px] sm:h-[42px]' },
  xs:   { img: 52, cls: 'w-[52px] h-[52px]' },
  sm:   { img: 68, cls: 'w-[68px] h-[68px]' },
  sm20: { img: 100, cls: 'w-[100px] h-[100px]' },
  md:   { img: 109, cls: 'w-[109px] h-[109px]' },
  lg:   { img: 146, cls: 'w-[146px] h-[146px]' },
  xl:   { img: 187, cls: 'w-[187px] h-[187px]' },
}

export function BrandLogo({ href, size = 'md', showText = true, className = '', compact = false, glow = false, tagline = false }: BrandLogoProps) {
  const s = sizeMap[size]
  const isHero = glow
  // The nav bar is the one tight row: there the wordmark is all-or-nothing — mark and name are two items of
  // the row's own height in a wrapping, clipped row, so a name that does not fit WHOLE drops to the hidden
  // second line instead of being cut ("MyAvata", brief §8).
  const isNav = size === 'nav'
  const rowH = 'h-[34px] sm:h-[42px]'

  const logo = (
    <div className={`flex items-center ${isNav ? `${rowH} min-w-0 flex-wrap gap-x-2.5 overflow-hidden sm:gap-x-3` : 'gap-3'} ${className}`}>
      <div className={`relative flex-shrink-0 transition-all duration-300 ${compact ? 'scale-90' : 'scale-100'} ${isHero ? 'logo-hero-float' : ''} ${s.cls}`}>
        {/* Ambient glow — layered for hero, crisp for header */}
        {isHero ? (
          <>
            {/* Outer breathing halo */}
            <div
              className="absolute -inset-6 rounded-full logo-glow-breathe"
              style={{
                background: 'radial-gradient(circle, rgba(51,143,232,0.16) 0%, rgba(6,182,212,0.06) 50%, transparent 70%)',
                filter: 'blur(20px)',
              }}
            />
            {/* Inner blue accent ring */}
            <div
              className="absolute -inset-3 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(99,130,241,0.12) 0%, transparent 60%)',
                filter: 'blur(12px)',
              }}
            />
          </>
        ) : (
          <div className="absolute inset-[10%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(51,143,232,0.05) 0%, transparent 70%)', filter: 'blur(6px)' }} />
        )}
        <Image
          src="/brand/rocket-mark.png"
          alt="MyAvatar.ge"
          fill
          sizes={`${s.img}px`}
          priority
          className={`object-contain object-center ${
            isHero
              ? 'drop-shadow-[0_8px_24px_rgba(51,143,232,0.28)]'
              : 'drop-shadow-[0_2px_8px_rgba(51,143,232,0.15)]'
          }`}
        />
      </div>
      {showText && (
        <span className={isNav ? `flex ${rowH} items-center` : 'contents'}>
          <Wordmark size={isNav ? 'sm' : 'md'} tagline={tagline} className={`transition-opacity duration-300 ${compact ? 'opacity-90' : 'opacity-100'}`} />
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} aria-label="MyAvatar.ge" className={`group ${isNav ? 'min-w-0' : 'flex-shrink-0'} hover:opacity-90 transition-opacity duration-200`}>
        {logo}
      </Link>
    )
  }

  return logo
}
