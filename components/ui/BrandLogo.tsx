'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface BrandLogoProps {
  href?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
}

const sizeMap = {
  sm: { img: 40, cls: 'w-[40px] h-[40px]' },
  md: { img: 64, cls: 'w-[64px] h-[64px]' },
  lg: { img: 96, cls: 'w-[96px] h-[96px]' },
  xl: { img: 140, cls: 'w-[140px] h-[140px]' },
}

export function BrandLogo({ href, size = 'md', showText = true, className = '' }: BrandLogoProps) {
  const s = sizeMap[size]

  const logo = (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`relative ${s.cls} flex-shrink-0`}>
        <Image
          src="/brand/logo.png"
          alt="MyAvatar.ge"
          fill
          sizes={`${s.img}px`}
          priority
          className="object-contain drop-shadow-[0_0_12px_rgba(34,211,238,0.35)] mix-blend-screen"
        />
      </div>
      {showText && (
        <span className="font-bold text-white tracking-tight text-xl">
          MyAvatar<span className="text-white/30">.ge</span>
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} aria-label="MyAvatar.ge home" className="group flex-shrink-0">
        {logo}
      </Link>
    )
  }

  return logo
}
