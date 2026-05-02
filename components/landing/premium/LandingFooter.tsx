'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const FOOTER_COPY = {
  en: {
    services: 'Services',
    platform: 'Platform',
    resources: 'Resources',
    legal: 'Legal',
    rights: 'All rights reserved.',
    lang: 'Language',
    tagline: 'AI Production Studio',
    georgian: 'Made in Georgia',
    georgianScript: 'ქართულ ინოვაციაზე დაყრდნობით',
    firstPlatform: 'Georgia\'s First AI Platform',
  },
  ka: {
    services: 'სერვისები',
    platform: 'პლატფორმა',
    resources: 'რესურსები',
    legal: 'სამართლებრივი',
    rights: 'ყველა უფლება დაცულია.',
    lang: 'ენა',
    tagline: 'AI პროდაქშენ სტუდია',
    georgian: 'დამზადებულია საქართველოში',
    georgianScript: 'ქართულ ინოვაციაზე დაყრდნობით',
    firstPlatform: 'პირველი AI პლატფორმა საქართველოში',
  },
  ru: {
    services: 'Сервисы',
    platform: 'Платформа',
    resources: 'Ресурсы',
    legal: 'Юридическое',
    rights: 'Все права защищены.',
    lang: 'Язык',
    tagline: 'AI Production Studio',
    georgian: 'Сделано в Грузии',
    georgianScript: 'ქართულ ინოვაციაზე დაყრდნობით',
    firstPlatform: 'Первая AI платформа в Грузии',
  },
} as const

// Social icon components
function TwitterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

export function LandingFooter() {
  const { language, setLanguage } = useLanguage()
  const c = FOOTER_COPY[language] || FOOTER_COPY.en
  const lh = (p: string) => `/${language}${p}`

  const socialLinks = [
    { href: 'https://twitter.com/myavatar_ge', label: 'Twitter', Icon: TwitterIcon, hoverColor: 'hover:text-cyan-400 hover:shadow-[0_0_10px_rgba(0,212,255,0.4)]' },
    { href: 'https://linkedin.com/company/myavatar-ge', label: 'LinkedIn', Icon: LinkedInIcon, hoverColor: 'hover:text-blue-400 hover:shadow-[0_0_10px_rgba(59,130,246,0.4)]' },
    { href: 'https://instagram.com/myavatar.ge', label: 'Instagram', Icon: InstagramIcon, hoverColor: 'hover:text-pink-400 hover:shadow-[0_0_10px_rgba(236,72,153,0.4)]' },
  ]

  return (
    <footer
      className="relative px-4 sm:px-6 lg:px-10 pt-16 pb-8 overflow-hidden"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* Georgian flag decorative line */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 opacity-60"
        style={{
          background: 'linear-gradient(to right, #e83a3a 33%, #ffffff 33%, #ffffff 66%, #e83a3a 66%)',
        }}
      />

      {/* Subtle gradient backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,212,255,0.03) 0%, transparent 60%)',
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Top: Logo + columns */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative w-9 h-9">
                <Image src="/brand/gemini-rocket-clean.png" alt="MyAvatar.ge" fill sizes="36px" className="object-contain" />
              </div>
              <span className="text-sm font-bold text-white">
                MyAvatar<span className="text-cyan-400">.ge</span>
              </span>
            </div>
            <p className="text-xs leading-relaxed text-white/40 mb-4">{c.tagline}</p>

            {/* Social links */}
            <div className="flex items-center gap-2">
              {socialLinks.map(({ href, label, Icon, hoverColor }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg text-white/35 transition-all duration-200 border border-white/8 hover:-translate-y-0.5 ${hoverColor}`}
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  <Icon />
                </a>
              ))}
            </div>

            {/* Made in Georgia badge */}
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/3 relative overflow-hidden group">
              <span>🇬🇪</span>
              <span className="text-[11px] text-white/55 font-medium">{c.georgian}</span>
              {/* Shimmer animation */}
              <span
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
                  animation: 'shimmer 1.5s infinite',
                }}
              />
            </div>
          </div>

          {/* Services */}
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider text-white/40">{c.services}</p>
            <div className="space-y-2.5 text-[13px] text-white/45">
              <Link href={lh('/services/avatar')} className="block py-0.5 transition-colors hover:text-white/80">Avatar Studio</Link>
              <Link href={lh('/services/video')} className="block py-0.5 transition-colors hover:text-white/80">Video</Link>
              <Link href={lh('/services/image')} className="block py-0.5 transition-colors hover:text-white/80">Image</Link>
              <Link href={lh('/services/music')} className="block py-0.5 transition-colors hover:text-white/80">Music</Link>
              <Link href={lh('/services/text')} className="block py-0.5 transition-colors hover:text-white/80">Text &amp; Copy</Link>
              <Link href={lh('/services/agent-g')} className="block py-0.5 transition-colors hover:text-white/80">Agent G</Link>
            </div>
          </div>

          {/* Platform */}
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider text-white/40">{c.platform}</p>
            <div className="space-y-2.5 text-[13px] text-white/45">
              <Link href={lh('/services')} className="block py-0.5 transition-colors hover:text-white/80">{c.services}</Link>
              <Link href={lh('/pricing')} className="block py-0.5 transition-colors hover:text-white/80">Pricing</Link>
              <Link href={lh('/workspace')} className="block py-0.5 transition-colors hover:text-white/80">Workspace</Link>
              <Link href={lh('/business')} className="block py-0.5 transition-colors hover:text-white/80">Business</Link>
            </div>
          </div>

          {/* Resources */}
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider text-white/40">{c.resources}</p>
            <div className="space-y-2.5 text-[13px] text-white/45">
              <Link href={lh('/about')} className="block py-0.5 transition-colors hover:text-white/80">About</Link>
              <Link href={lh('/contact')} className="block py-0.5 transition-colors hover:text-white/80">Contact</Link>
              <Link href={lh('/blog')} className="block py-0.5 transition-colors hover:text-white/80">Blog</Link>
              <Link href={lh('/careers')} className="block py-0.5 transition-colors hover:text-white/80">Careers</Link>
            </div>
          </div>

          {/* Legal */}
          <div>
            <p className="font-medium mb-3 text-[11px] uppercase tracking-wider text-white/40">{c.legal}</p>
            <div className="space-y-2.5 text-[13px] text-white/45">
              <Link href={lh('/privacy')} className="block py-0.5 transition-colors hover:text-white/80">Privacy</Link>
              <Link href={lh('/terms')} className="block py-0.5 transition-colors hover:text-white/80">Terms</Link>
              <Link href={lh('/cookies')} className="block py-0.5 transition-colors hover:text-white/80">Cookies</Link>
              <Link href={lh('/licenses')} className="block py-0.5 transition-colors hover:text-white/80">Licenses</Link>
            </div>
          </div>
        </div>

        {/* Georgian innovation text */}
        <div className="text-center mb-6">
          <p
            className="text-sm font-medium"
            style={{
              background: 'linear-gradient(90deg, rgba(232,58,58,0.8), rgba(255,255,255,0.6), rgba(232,58,58,0.8))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {c.georgianScript}
          </p>
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-white/30"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span>&copy; {new Date().getFullYear()} MyAvatar.ge &mdash; {c.rights}</span>
            <span className="hidden sm:inline text-white/15">|</span>
            <span className="text-white/40 font-medium">{c.firstPlatform}</span>
          </div>

          {/* Language switch */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider mr-1 text-white/25">{c.lang}:</span>
            {(['en', 'ka', 'ru'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: language === l ? 'rgba(0,212,255,0.1)' : 'transparent',
                  color: language === l ? '#00d4ff' : 'rgba(255,255,255,0.3)',
                }}
              >
                {l === 'en' ? 'English' : l === 'ka' ? 'ქართული' : 'Русский'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
