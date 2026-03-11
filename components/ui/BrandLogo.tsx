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
  nav:  { img: 32, cls: 'w-8 h-8' },
  xs:   { img: 40, cls: 'w-10 h-10' },
  sm:   { img: 52, cls: 'w-[52px] h-[52px]' },
  sm20: { img: 77, cls: 'w-[77px] h-[77px]' },
  md:   { img: 84, cls: 'w-[84px] h-[84px]' },
  lg:   { img: 112, cls: 'w-[112px] h-[112px]' },
  xl:   { img: 144, cls: 'w-[144px] h-[144px]' },
}

export function BrandLogo({ href, size = 'md', showText = true, className = '', compact = false, glow = false }: BrandLogoProps) {
  const s = sizeMap[size]
  const isHero = glow

  const logo = (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`relative flex-shrink-0 transition-all duration-300 ${compact ? 'scale-90' : 'scale-100'} ${isHero ? 'logo-hero-float' : ''} ${s.cls}`}>
        {/* Ambient glow — stronger for hero, subtle for header */}
        {isHero ? (
          <>
            <div
              className="absolute -inset-4 rounded-full logo-glow-breathe"
              style={{
                background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.08) 50%, transparent 70%)',
                filter: 'blur(16px)',
              }}
            />
            <div
              className="absolute -inset-2 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 60%)',
                filter: 'blur(10px)',
              }}
            />
          </>
        ) : (
          <div className="absolute inset-[12%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)', filter: 'blur(8px)' }} />
        )}
        <Image
          src="/brand/rocket-3d-hq.svg"
          alt="MyAvatar.ge"
          fill
          sizes={`${s.img}px`}
          priority
          className={`object-contain object-center ${
            isHero
              ? 'drop-shadow-[0_6px_20px_rgba(99,102,241,0.30)]'
              : 'drop-shadow-[0_3px_10px_rgba(99,102,241,0.20)]'
          }`}
        />
      </div>
      {showText && (
        <div className={`flex flex-col leading-none transition-all duration-300 ${compact ? 'opacity-90' : 'opacity-100'}`}>
          <span className="font-extrabold tracking-[-0.02em] text-[1.05rem] md:text-[1.1rem] leading-none" style={{ color: 'var(--color-text)' }}>
            MyAvatar<span
              className="font-semibold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent"
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
