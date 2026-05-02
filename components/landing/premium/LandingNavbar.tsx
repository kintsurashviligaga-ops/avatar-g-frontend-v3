'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { cn } from '@/lib/utils'

const LOCALES = [
  { code: 'ka', label: 'ქარ' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'РУ' },
] as const

const NAV_LINKS = {
  en: [
    { label: 'Services', href: '/services' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'About', href: '/about' },
  ],
  ka: [
    { label: 'სერვისები', href: '/services' },
    { label: 'ფასები', href: '/pricing' },
    { label: 'ჩვენს შესახებ', href: '/about' },
  ],
  ru: [
    { label: 'Услуги', href: '/services' },
    { label: 'Цены', href: '/pricing' },
    { label: 'О нас', href: '/about' },
  ],
} as const

const mobileOverlayVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
}

const mobileLinkVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.06, duration: 0.3, ease: 'easeOut' },
  }),
}

export function LandingNavbar() {
  const { language: locale, setLanguage, t } = useLanguage()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const links = NAV_LINKS[locale] || NAV_LINKS.en
  const localeHref = useCallback((path: string) => `/${locale}${path}`, [locale])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [locale])

  const switchLocale = (code: string) => {
    setLanguage(code as 'ka' | 'en' | 'ru')
  }

  return (
    <>
      <nav
        className={cn(
          'fixed top-0 inset-x-0 z-[200] h-14 flex items-center justify-between px-4 sm:px-6 lg:px-10 transition-all duration-300',
          scrolled
            ? 'backdrop-blur-xl border-b border-cyan-500/10'
            : 'bg-transparent border-b border-transparent',
        )}
        style={
          scrolled
            ? { backgroundColor: 'rgba(10,10,15,0.85)' }
            : { backgroundColor: 'transparent' }
        }
      >
        {/* Logo */}
        <BrandLogo href={localeHref('/')} size="nav" showText compact={scrolled} />

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={localeHref(link.href)}
              className="relative group px-3 py-2 text-[13px] font-medium text-white/65 hover:text-white transition-colors duration-200"
            >
              {link.label}
              {/* Animated underline */}
              <span
                className="absolute bottom-0.5 left-3 right-3 h-px bg-cyan-400 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-200"
              />
            </Link>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Language switcher */}
          <div
            className="flex items-center gap-0.5 rounded-full px-1 py-0.5"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {LOCALES.map((loc) => (
              <button
                key={loc.code}
                onClick={() => switchLocale(loc.code)}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full transition-all duration-200"
                style={{
                  backgroundColor: locale === loc.code ? 'rgba(0,212,255,0.2)' : 'transparent',
                  color: locale === loc.code ? '#00d4ff' : 'rgba(255,255,255,0.4)',
                }}
              >
                {loc.label}
              </button>
            ))}
          </div>

          {/* Login — hidden on small mobile */}
          <Link
            href={localeHref('/login')}
            className="hidden sm:block text-[13px] font-medium transition-colors px-3 py-1.5 text-white/55 hover:text-white"
          >
            {t('nav.login')}
          </Link>

          {/* Get Started */}
          <Link
            href={localeHref('/signup')}
            className="text-[12px] sm:text-[13px] font-semibold px-4 py-1.5 rounded-full transition-all duration-200 hover:shadow-[0_0_16px_rgba(0,212,255,0.4)] hover:-translate-y-px"
            style={{
              background: 'linear-gradient(135deg, rgba(0,212,255,0.9), rgba(124,58,237,0.9))',
              color: '#fff',
            }}
          >
            {t('nav.getStarted')}
          </Link>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5 ml-1"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <span
              className={cn(
                'block w-5 h-0.5 bg-white/70 transition-all duration-200',
                mobileOpen && 'rotate-45 translate-y-2',
              )}
            />
            <span
              className={cn(
                'block w-5 h-0.5 bg-white/70 transition-all duration-200',
                mobileOpen && 'opacity-0',
              )}
            />
            <span
              className={cn(
                'block w-5 h-0.5 bg-white/70 transition-all duration-200',
                mobileOpen && '-rotate-45 -translate-y-2',
              )}
            />
          </button>
        </div>
      </nav>

      {/* Mobile fullscreen overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            variants={mobileOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-[199] md:hidden flex flex-col"
            style={{ backgroundColor: 'rgba(3,3,10,0.97)', backdropFilter: 'blur(20px)' }}
          >
            {/* Spacer for navbar */}
            <div className="h-14" />

            <div className="flex flex-col gap-1 px-6 pt-8">
              {links.map((link, i) => (
                <motion.div key={link.href} custom={i} variants={mobileLinkVariants} initial="hidden" animate="visible">
                  <Link
                    href={localeHref(link.href)}
                    onClick={() => setMobileOpen(false)}
                    className="block py-4 text-2xl font-bold text-white/80 hover:text-white border-b border-white/6 transition-colors"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}

              {/* Auth links */}
              <motion.div custom={links.length} variants={mobileLinkVariants} initial="hidden" animate="visible" className="flex flex-col gap-3 mt-8">
                <Link
                  href={localeHref('/login')}
                  onClick={() => setMobileOpen(false)}
                  className="block text-center py-3 rounded-xl text-base font-semibold text-white/70 border border-white/10 hover:bg-white/5"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  href={localeHref('/signup')}
                  onClick={() => setMobileOpen(false)}
                  className="block text-center py-3 rounded-xl text-base font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #00d4ff, #7c3aed)' }}
                >
                  {t('nav.getStarted')}
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
