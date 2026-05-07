'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { HeroVideo } from './HeroVideo'
import { NeonBadge } from '@/components/ui/NeonBadge'

/* ─── Copy ──────────────────────────────────────────────── */
const COPY = {
  en: {
    georgianBadge: 'Georgia\'s first AI civilization stack',
    badge: 'Neo-Cosmic AI Platform',
    headline1: 'GEORGIA\'S FIRST',
    headline2: 'AI CIVILIZATION',
    headline3: 'STACK.',
    cta1: 'Start Free',
    cta2: 'See Services',
    trust: 'One platform. 14 AI services. Voice, image, video, music, avatar — in Georgian.',
  },
  ka: {
    georgianBadge: 'საქართველოს პირველი AI ცივილიზაციური სტეკი',
    badge: 'Neo-Cosmic AI პლატფორმა',
    headline1: 'საქართველოს',
    headline2: 'AI ცივილიზაციური',
    headline3: 'სტეკი.',
    cta1: 'დაიწყე უფასოდ',
    cta2: 'სერვისების ნახვა',
    trust: 'ერთი პლატფორმა. 14 AI სერვისი. ხმა, სურათი, ვიდეო, მუსიკა, ავატარი — ქართულად.',
  },
  ru: {
    georgianBadge: 'Первый AI civilization stack в Грузии',
    badge: 'Neo-Cosmic AI Платформа',
    headline1: 'ПЕРВЫЙ В ГРУЗИИ',
    headline2: 'AI CIVILIZATION',
    headline3: 'STACK.',
    cta1: 'Начать бесплатно',
    cta2: 'Смотреть сервисы',
    trust: 'Одна платформа. 14 AI сервисов. Голос, изображение, видео, музыка, аватар — на грузинском.',
  },
} as const

/* ─── Star field ────────────────────────────────────────── */
interface Star {
  top: string
  left: string
  size: number
  opacity: number
  duration: number
  delay: number
}

function generateStars(count: number): Star[] {
  // Deterministic pseudo-random to avoid SSR/CSR mismatch
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    const seed = i * 137.508 // golden angle
    const x = ((seed * 13.7) % 100)
    const y = ((seed * 7.3) % 100)
    const size = (i % 3 === 0) ? 1.5 : (i % 5 === 0) ? 2 : 1
    const opacity = 0.2 + (i % 5) * 0.12
    const duration = 3 + (i % 4) * 1.5
    const delay = (i % 10) * 0.4
    stars.push({
      top: `${y.toFixed(2)}%`,
      left: `${x.toFixed(2)}%`,
      size,
      opacity,
      duration,
      delay,
    })
  }
  return stars
}

const STARS = generateStars(150)

function scrollTo(anchor: string) {
  const el = document.querySelector(anchor)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function HeroSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="cinematic-section relative overflow-hidden px-4 sm:px-6 lg:px-10 pt-20 pb-12 sm:pt-36 sm:pb-24 lg:pt-48 lg:pb-32">

      {/* ── Star field ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {STARS.map((star, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              backgroundColor: '#fff',
              opacity: star.opacity,
              animation: `twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ── Scan line ── */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to right, transparent, rgba(0,212,255,0.6), transparent)',
          animation: 'scanline 6s linear infinite',
        }}
        aria-hidden="true"
      />

      {/* ── Mesh gradient layers ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 85% 65% at 50% -10%, rgba(34,211,238,0.18) 0%, rgba(6,182,212,0.08) 40%, transparent 70%)' }} />
      <div className="absolute top-0 left-1/4 -translate-x-12 w-[700px] h-[600px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 55% 60% at 50% 20%, rgba(168,85,247,0.12) 0%, rgba(168,85,247,0.04) 35%, transparent 65%)', filter: 'blur(70px)' }} />
      <div className="absolute top-0 right-1/4 translate-x-12 w-[700px] h-[600px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 55% 60% at 50% 20%, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0.03) 35%, transparent 65%)', filter: 'blur(80px)' }} />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[600px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 40%, rgba(34,211,238,0.10) 0%, rgba(168,85,247,0.05) 30%, transparent 70%)', filter: 'blur(90px)' }} />

      {/* Dot grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(var(--color-text, #fff) 0.5px, transparent 0.5px)', backgroundSize: '32px 32px' }} />

      <div className="relative z-10 mx-auto max-w-5xl flex flex-col items-center text-center gap-6 sm:gap-8 lg:gap-12">

        {/* Georgian badge — small pill above main badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <NeonBadge color="crimson" pulse>
            🇬🇪 {c.georgianBadge}
          </NeonBadge>
        </motion.div>

        {/* Main badge */}
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
          className="flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/50 transition-all hover:shadow-[0_0_24px_rgba(34,211,238,0.3)]"
          style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(168,85,247,0.08))' }}
        >
          <motion.div
            className="relative w-[47px] h-[47px]"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Image src="/brand/gemini-rocket-clean.png" alt="MyAvatar.ge" fill sizes="47px" className="object-contain drop-shadow-lg" />
          </motion.div>
          <span className="text-xs tracking-widest uppercase font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            {c.badge}
          </span>
        </motion.div>

        {/* Headline */}
        <div className="space-y-2 sm:space-y-3">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          >
            <h1
              className="text-4xl sm:text-6xl lg:text-8xl xl:text-9xl font-black tracking-[0.06em] leading-[1.0] uppercase drop-shadow-2xl"
              style={{ color: 'var(--color-text)', textShadow: '0 0 60px rgba(34,211,238,0.18)', fontFamily: 'var(--font-display, var(--font-syne, sans-serif))' }}
            >
              {c.headline1}
            </h1>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: 'easeOut' }}
          >
            <h1 className="text-4xl sm:text-6xl lg:text-8xl xl:text-9xl font-black tracking-[0.06em] leading-[1.0] uppercase" style={{ fontFamily: 'var(--font-display, var(--font-syne, sans-serif))' }}>
              <span
                className="bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-500 bg-clip-text text-transparent"
                style={{ backgroundSize: '200% 200%', animation: 'gradient-shift 4s ease infinite' }}
              >
                {c.headline2}
              </span>
            </h1>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
          >
            <h1
              className="text-4xl sm:text-6xl lg:text-8xl xl:text-9xl font-black tracking-[0.06em] leading-[1.0] uppercase"
              style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-display, var(--font-syne, sans-serif))' }}
            >
              {c.headline3}
            </h1>
          </motion.div>
        </div>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.65, ease: 'easeOut' }}
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
            <Link
              href={lh('/signup')}
              className="inline-flex items-center gap-2 text-sm font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 text-white"
              style={{
                background: 'linear-gradient(135deg, rgba(0,212,255,0.9), rgba(124,58,237,0.9))',
                boxShadow: '0 0 24px rgba(0,212,255,0.3)',
              }}
            >
              {c.cta1}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
            <button
              onClick={() => scrollTo('#services')}
              className="inline-flex items-center gap-2 text-sm font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 text-white/80 hover:text-white"
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              {c.cta2}
            </button>
          </motion.div>
        </motion.div>

        {/* Hero Video */}
        <motion.div
          className="w-full mt-10 sm:mt-14 lg:mt-16 px-2 sm:px-0"
          style={{ maxWidth: 1100 }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8, ease: 'easeOut' }}
        >
          <HeroVideo />
        </motion.div>

        {/* Trust signal */}
        <motion.p
          className="mt-8 sm:mt-12 text-sm sm:text-base font-light tracking-wide text-white/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.0 }}
        >
          {c.trust}
        </motion.p>
      </div>
    </section>
  )
}
