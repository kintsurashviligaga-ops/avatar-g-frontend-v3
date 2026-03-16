'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface BrandLogoProps {
  href?: string
  size?: 'nav' | 'xs' | 'sm' | 'sm20' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
  /** When true, renders slightly smaller — use when navbar is in scrolled/compact state */
  compact?: boolean
  /** Enable enhanced glow + breathing animation (hero variant) */
  glow?: boolean
}

const sizeMap = {
  nav:  { img: 42, cls: 'w-[42px] h-[42px]' },
  xs:   { img: 52, cls: 'w-[52px] h-[52px]' },
  sm:   { img: 68, cls: 'w-[68px] h-[68px]' },
  sm20: { img: 100, cls: 'w-[100px] h-[100px]' },
  md:   { img: 109, cls: 'w-[109px] h-[109px]' },
  lg:   { img: 146, cls: 'w-[146px] h-[146px]' },
  xl:   { img: 187, cls: 'w-[187px] h-[187px]' },
}

export function BrandLogo({ href, size = 'md', showText = true, className = '', compact = false, glow = false }: BrandLogoProps) {
  const s = sizeMap[size]
  const isHero = glow

  const logo = (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`relative flex-shrink-0 transition-all duration-300 ${compact ? 'scale-90' : 'scale-100'} ${isHero ? 'logo-hero-float' : ''} ${s.cls}`}>
        {/* Ambient glow — layered for hero, crisp for header */}
        {isHero ? (
          <>
            {/* Outer breathing halo */}
            <div
              className="absolute -inset-6 rounded-full logo-glow-breathe"
              style={{
                background: 'radial-gradient(circle, rgba(34,211,238,0.16) 0%, rgba(6,182,212,0.06) 50%, transparent 70%)',
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
          <div className="absolute inset-[10%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 70%)', filter: 'blur(6px)' }} />
        )}
        <Image
          src="/brand/gemini-rocket-clean.png"
          alt="MyAvatar.ge"
          fill
          sizes={`${s.img}px`}
          priority
          className={`object-contain object-center ${
            isHero
              ? 'drop-shadow-[0_8px_24px_rgba(34,211,238,0.28)] drop-shadow-[0_2px_6px_rgba(6,182,212,0.18)]'
              : 'drop-shadow-[0_2px_8px_rgba(34,211,238,0.15)]'
          }`}
        />
      </div>
      {showText && (
        <div className={`flex flex-col leading-none transition-all duration-300 ${compact ? 'opacity-90' : 'opacity-100'}`}>
          <span className="font-extrabold tracking-[-0.02em] text-[1.05rem] md:text-[1.1rem] leading-none" style={{ color: 'var(--color-text)' }}>
            MyAvatar<span
              className="font-semibold bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent"
            >.ge</span>
          </span>
        </div>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} aria-label="MyAvatar.ge home" className="group flex-shrink-0 hover:opacity-90 transition-opacity duration-200">
        {logo}
      </Link>
    )
  }

  return logo
}
