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
  sm: { img: 52, cls: 'w-[52px] h-[52px]' },
  md: { img: 78, cls: 'w-[78px] h-[78px]' },
  lg: { img: 116, cls: 'w-[116px] h-[116px]' },
  xl: { img: 156, cls: 'w-[156px] h-[156px]' },
}

export function BrandLogo({ href, size = 'md', showText = true, className = '' }: BrandLogoProps) {
  const s = sizeMap[size]

  const logo = (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`relative ${s.cls} flex-shrink-0`}>
        <Image
          src="/brand/logo-rocket.svg"
          alt="MyAvatar.ge"
          fill
          sizes={`${s.img}px`}
          priority
          className="object-contain animate-[pulse_4s_ease-in-out_infinite] drop-shadow-[0_0_16px_rgba(34,211,238,0.45)]"
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
