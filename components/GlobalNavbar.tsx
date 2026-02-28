'use client'

import Image from 'next/image'
import Link from 'next/link'
import { LanguageSwitcher } from './LanguageSwitcher'

interface GlobalNavbarProps {
  variant?: 'light' | 'dark' | 'transparent'
}

/**
 * GlobalNavbar
 * LOGO ENFORCEMENT RULES:
 * - Desktop: 40px height (h-10), auto width
 * - Mobile: 32px height (h-8), auto width
 * - Position: top-left, always visible
 * - Clickable: navigates to home ('/')
 * - Dark variant: white logo
 * - Sticky: position fixed, z-50, full width, backdrop blur
 */
export function GlobalNavbar({ variant = 'dark' }: GlobalNavbarProps) {
  const isDark = variant === 'dark' || variant === 'transparent'

  return (
    <nav
      className={`
        fixed top-0 left-0 right-0 z-50
        flex items-center justify-between
        px-4 sm:px-6 lg:px-8
        h-16
        ${isDark
          ? 'bg-black/80 border-b border-white/10 text-white'
          : 'bg-white/90 border-b border-black/10 text-black'}
        backdrop-blur-xl
        transition-colors
      `}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Avatar G Logo — MANDATORY, NEVER REMOVE */}
      <Link
        href="/"
        className="flex items-center gap-2.5 flex-shrink-0"
        aria-label="MyAvatar.ge home"
      >
        <Image
          src="/brand/logo.png"
          alt="Avatar G"
          width={40}
          height={40}
          priority
          className="h-8 w-auto sm:h-10 object-contain"
        />
        <span
          className={`
            font-bold text-lg tracking-tight hidden sm:block
            ${isDark ? 'text-white' : 'text-gray-900'}
          `}
        >
          MyAvatar.ge
        </span>
      </Link>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <Link
          href="/login"
          className={`text-sm font-medium transition-colors ${
            isDark
              ? 'text-white/70 hover:text-white'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Login
        </Link>
        <Link
          href="/signup"
          className="bg-white text-black text-sm font-semibold px-4 py-2 rounded-full hover:bg-white/90 transition-colors"
        >
          Get Started
        </Link>
      </div>
    </nav>
  )
}
