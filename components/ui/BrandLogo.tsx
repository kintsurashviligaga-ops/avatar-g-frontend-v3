'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface BrandLogoProps {
  href?: string
  size?: 'xs' | 'sm' | 'sm20' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
}

const sizeMap = {
  xs: { img: 44, cls: 'w-[44px] h-[44px]' },
  sm: { img: 64, cls: 'w-[64px] h-[64px]' },
  sm20: { img: 77, cls: 'w-[77px] h-[77px]' },
  md: { img: 84, cls: 'w-[84px] h-[84px]' },
  lg: { img: 112, cls: 'w-[112px] h-[112px]' },
  xl: { img: 144, cls: 'w-[144px] h-[144px]' },
}

export function BrandLogo({ href, size = 'md', showText = true, className = '' }: BrandLogoProps) {
  const s = sizeMap[size]

  const logo = (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`relative ${s.cls} flex-shrink-0`}>
        <div className="absolute inset-[15%] rounded-full bg-cyan-400/[0.06] blur-2xl" />
        <Image
          src="/brand/logo-exact-transparent.png"
          alt="MyAvatar.ge"
          fill
          sizes={`${s.img}px`}
          priority
          className="object-contain object-center scale-[1.12] drop-shadow-[0_4px_16px_rgba(34,211,238,0.25)]"
        />
      </div>
      {showText && (
        <span className="font-bold text-white tracking-[-0.02em] text-[1.1rem] md:text-[1.15rem] lg:text-[1.2rem] leading-none">
          MyAvatar<span className="text-white/30 font-medium">.ge</span>
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} aria-label="MyAvatar.ge home" className="group flex-shrink-0 hover:opacity-90 transition-opacity">
        {logo}
      </Link>
    )
  }

  return logo
}
