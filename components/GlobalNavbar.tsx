'use client'

import Image from 'next/image'
import Link from 'next/link'
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

export function GlobalNavbar() {
  return (
    <nav className="
      fixed top-0 left-0 right-0 z-50 h-16
      flex items-center justify-between
      px-4 sm:px-6 lg:px-8
      bg-[#050510]/90 backdrop-blur-xl
      border-b border-white/[0.06]
    ">
      {/* Avatar G Logo — MANDATORY */}
      <Link
        href="/"
        className="flex items-center gap-3 flex-shrink-0"
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
        <span className="font-bold text-lg text-white tracking-tight hidden sm:block">
          MyAvatar<span className="text-white/40">.ge</span>
        </span>
      </Link>

      {/* Center: Service quick nav (desktop only) */}
      <div className="hidden lg:flex items-center gap-1">
        {['Avatar', 'Video', 'Editing', 'Music', 'Shop'].map((s) => (
          <Link
            key={s}
            href={`/services/${s.toLowerCase()}`}
            className="px-3 py-1.5 text-sm text-white/50 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all"
          >
            {s}
          </Link>
        ))}
        <Link
          href="/business"
          className="px-3 py-1.5 text-sm text-white/50 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all"
        >
          Business
        </Link>
        <Link
          href="/executive"
          className="px-3 py-1.5 text-sm font-medium text-indigo-400/80 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-all"
        >
          Executive
        </Link>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 sm:gap-3">
        <ErrorBoundary fallback={<span className="text-xs text-white/30">🌐</span>}>
          <LanguageSwitcher />
        </ErrorBoundary>
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
    </nav>
  )
}
