'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

// ─── LOGO SPEC ────────────────────────────────────────────────────────────────
// Desktop: height 40px (h-10), auto width
// Mobile: height 32px (h-8), auto width
// Position: fixed top-0 left-0, z-50, always visible on scroll
// Clickable: navigates to home
// File: /public/logo.png — ensure file exists before deploying
// ─────────────────────────────────────────────────────────────────────────────

const PRIMARY_LINKS = [
  { href: '/services/avatar', label: 'Avatar' },
  { href: '/services/video', label: 'Video' },
  { href: '/services/editing', label: 'Editing' },
  { href: '/services/music', label: 'Music' },
  { href: '/business', label: 'Business' },
  { href: '/pricing', label: 'Pricing' },
] as const

const LOCALES = [
  { code: 'ka', label: 'ქარ' },
  { code: 'en', label: 'ENG' },
  { code: 'ru', label: 'РУС' },
] as const

function getStoredLocale(): string {
  if (typeof document === 'undefined') return 'ka'
  return document.cookie
    .split(';')
    .find(c => c.trim().startsWith('NEXT_LOCALE='))
    ?.split('=')[1]?.trim() ?? 'ka'
}

export function GlobalNavbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [locale, setLocale] = useState<string>(getStoredLocale)

  const switchLocale = (code: string) => {
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; SameSite=Lax`
    setLocale(code)
    router.refresh()
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      <nav className="
        fixed top-0 inset-x-0 z-50 h-16
        flex items-center justify-between
        px-4 sm:px-6 lg:px-10
        bg-[#050510]/95 backdrop-blur-xl
        border-b border-white/[0.06]
      ">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group" aria-label="MyAvatar.ge home">
          <div className="relative h-8 sm:h-10 w-8 sm:w-10 flex-shrink-0">
            <Image
              src="/logo.png"
              alt="Avatar G logo"
              fill
              priority
              className="object-contain"
            />
          </div>
          <span className="hidden sm:block font-bold text-[15px] text-white tracking-tight">
            MyAvatar<span className="text-white/35">.ge</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-0.5">
          {PRIMARY_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`
                px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all
                ${isActive(href)
                  ? 'text-white bg-white/[0.09]'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.06]'}
              `}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-1 py-0.5">
            {LOCALES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => switchLocale(code)}
                className={`
                  text-[11px] font-semibold px-2 py-1 rounded-full transition-all
                  ${locale === code
                    ? 'bg-white text-[#050510]'
                    : 'text-white/40 hover:text-white'}
                `}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Auth — desktop */}
          <div className="hidden sm:flex items-center gap-2">
            <Link href="/login"
              className="text-[13px] text-white/55 hover:text-white transition-colors px-3 py-1.5">
              Login
            </Link>
            <Link href="/signup"
              className="text-[13px] font-semibold bg-white text-[#050510] px-4 py-2 rounded-xl hover:bg-white/90 transition-all">
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(v => !v)}
            className="lg:hidden p-2 text-white/50 hover:text-white transition-colors"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2}>
              {open
                ? <><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></>
                : <><line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/></>
              }
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="
          fixed top-16 inset-x-0 z-40
          bg-[#050510]/98 backdrop-blur-xl
          border-b border-white/[0.06]
          px-4 py-4 space-y-1
          lg:hidden
        ">
          {PRIMARY_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`
                block px-3 py-3 text-sm rounded-xl transition-all
                ${isActive(href)
                  ? 'text-white bg-white/[0.09]'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.06]'}
              `}
            >
              {label}
            </Link>
          ))}
          <div className="border-t border-white/[0.06] pt-3 mt-1 grid grid-cols-2 gap-2">
            <Link href="/login" onClick={() => setOpen(false)}
              className="text-center text-sm text-white/60 border border-white/[0.1] py-2.5 rounded-xl hover:bg-white/[0.05]">
              Login
            </Link>
            <Link href="/signup" onClick={() => setOpen(false)}
              className="text-center text-sm font-semibold bg-white text-[#050510] py-2.5 rounded-xl hover:bg-white/90">
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
