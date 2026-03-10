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

export function BrandLogo({ href, size = 'md', showText = true, className = '', compact = false }: BrandLogoProps) {
  const s = sizeMap[size]

  const logo = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className={`relative flex-shrink-0 transition-all duration-300 ${compact ? 'scale-90' : 'scale-100'} ${s.cls}`}>
        <div className="absolute inset-[15%] rounded-full bg-cyan-400/[0.06] blur-xl" />
        <Image
          src="/brand/rocket-3d-hq.svg"
          alt="MyAvatar.ge"
          fill
          sizes={`${s.img}px`}
          priority
          className="object-contain object-center drop-shadow-[0_6px_18px_rgba(34,211,238,0.30)]"
        />
      </div>
      {showText && (
        <div className={`flex flex-col leading-none transition-all duration-300 ${compact ? 'opacity-90' : 'opacity-100'}`}>
          <span className="font-extrabold text-white tracking-[-0.03em] text-[1.05rem] md:text-[1.1rem] leading-none">
            MyAvatar<span className="text-cyan-300/70 font-semibold">.ge</span>
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
