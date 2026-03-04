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
  sm: { img: 64, cls: 'w-[64px] h-[64px]' },
  md: { img: 92, cls: 'w-[92px] h-[92px]' },
  lg: { img: 132, cls: 'w-[132px] h-[132px]' },
  xl: { img: 172, cls: 'w-[172px] h-[172px]' },
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
          className="object-contain animate-[pulse_4s_ease-in-out_infinite] drop-shadow-[0_0_10px_rgba(34,211,238,0.38)] md:drop-shadow-[0_0_16px_rgba(34,211,238,0.46)] lg:drop-shadow-[0_0_22px_rgba(34,211,238,0.55)]"
        />
      </div>
      {showText && (
        <span className="font-bold text-white tracking-tight text-[1.28rem] md:text-[1.34rem]">
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
