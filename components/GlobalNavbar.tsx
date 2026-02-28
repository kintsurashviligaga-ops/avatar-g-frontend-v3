'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import ErrorBoundary from '@/components/landing/ErrorBoundary'
import LanguageSwitcher from './LanguageSwitcher'

// ─── LOGO ENFORCEMENT RULES ─────────────────────────────────────────────────
// Desktop: 40px height (h-10), auto width
// Mobile: 32px height (h-8), auto width
// Position: fixed top-left, z-50
// Color: white on dark (always, because background is always dark/noir)
// Clickable: navigates to /
// NEVER remove this component. NEVER move logo to the right.
// ────────────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: '/services/avatar-builder', label: 'Avatar' },
  { href: '/services/video-studio', label: 'Video' },
  { href: '/services/music-studio', label: 'Music' },
  { href: '/business', label: 'Business' },
  { href: '/pricing', label: 'Pricing' },
] as const

export function GlobalNavbar() {
  const pathname = usePathname()
  const [menuOpen, setMenu] = useState(false)

  return (
    <nav
      className="
        fixed top-0 left-0 right-0 z-50 h-16
        flex items-center justify-between
        px-4 sm:px-6 lg:px-8
        bg-[#050510]/95 backdrop-blur-xl
        border-b border-white/[0.06]
      "
      aria-label="Main navigation"
    >
      {/* Avatar G Logo — MANDATORY */}
      <Link
        href="/"
        className="flex items-center gap-2.5 flex-shrink-0"
        aria-label="MyAvatar.ge — Home"
      >
        <Image
          src="/brand/logo.png"
          alt="Avatar G"
          width={40}
          height={40}
          priority
          className="h-8 w-auto sm:h-10 object-contain"
        />
        <span className="font-bold text-base text-white tracking-tight hidden sm:block">
          MyAvatar<span className="text-white/40">.ge</span>
        </span>
      </Link>

      {/* Desktop nav links */}
      <div className="hidden lg:flex items-center gap-0.5">
        {NAV_LINKS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`
                px-3 py-1.5 text-sm rounded-lg transition-all
                ${active
                  ? 'text-white bg-white/[0.08]'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.05]'}
              `}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Right: lang switcher + auth */}
      <div className="flex items-center gap-1 sm:gap-2">
        <ErrorBoundary fallback={<span className="text-xs text-white/30">🌐</span>}>
          <LanguageSwitcher />
        </ErrorBoundary>

        {/* Auth links (desktop) */}
        <div className="hidden sm:flex items-center gap-2">
          <Link
            href="/login"
            className="text-sm text-white/60 hover:text-white transition-colors px-3 py-1.5"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="text-sm font-semibold bg-white text-[#050510] px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMenu(v => !v)}
          className="lg:hidden p-2 text-white/50 hover:text-white"
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            {menuOpen
              ? <path fillRule="evenodd" clipRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              : <path fillRule="evenodd" clipRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 110-2zm0 4h14a1 1 0 010 2H3a1 1 0 110-2zm0 4h14a1 1 0 010 2H3a1 1 0 110-2z" />
            }
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="
            absolute top-16 left-0 right-0
            bg-[#050510]/98 border-b border-white/[0.06]
            px-4 py-4 space-y-1
            lg:hidden
          "
        >
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenu(false)}
              className="block px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.05] rounded-xl transition-all"
            >
              {label}
            </Link>
          ))}
          <div className="border-t border-white/[0.06] pt-3 mt-2 flex gap-2">
            <Link
              href="/login"
              onClick={() => setMenu(false)}
              className="flex-1 text-center text-sm text-white/60 border border-white/10 py-2 rounded-xl"
            >
              Login
            </Link>
            <Link
              href="/signup"
              onClick={() => setMenu(false)}
              className="flex-1 text-center text-sm font-semibold bg-white text-[#050510] py-2 rounded-xl"
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
