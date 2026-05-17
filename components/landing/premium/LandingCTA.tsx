'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { GlowButton } from '@/components/ui/GlowButton'

const CTA_COPY = {
  en: {
    preTitle: 'Start your AI journey today',
    title1: 'Create with',
    titleAccent: 'AI',
    title2: '— built in',
    titleGeorgian: 'Georgia',
    subtitle: 'Join thousands of creators using myavatar.ge to build, automate, and create.',
    cta1: 'Get Started Free',
    cta2: 'Explore Platform',
  },
  ka: {
    preTitle: 'დაიწყე AI მოგზაურობა დღეს',
    title1: 'შექმენი',
    titleAccent: 'AI-ით',
    title2: '— ქართული',
    titleGeorgian: 'ინოვაცია',
    subtitle: 'ათასობით შემქმნელი იყენებს myavatar.ge-ს კონტენტის შესაქმნელად.',
    cta1: 'დაიწყე უფასოდ',
    cta2: 'პლატფორმის ნახვა',
  },
  ru: {
    preTitle: 'Начни AI путь сегодня',
    title1: 'Создавай с',
    titleAccent: 'AI',
    title2: '— из',
    titleGeorgian: 'Грузии',
    subtitle: 'Тысячи создателей используют myavatar.ge для контента, автоматизации и бизнеса.',
    cta1: 'Начать бесплатно',
    cta2: 'Обзор платформы',
  },
} as const

interface Particle {
  x: string
  y: string
  size: number
  duration: number
  delay: number
  opacity: number
}

function buildParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i + 1) * 97.3
    return {
      x: `${(seed * 7.7) % 100}%`,
      y: `${(seed * 3.3) % 100}%`,
      size: 2 + (i % 3),
      duration: 4 + (i % 5),
      delay: (i % 8) * 0.5,
      opacity: 0.15 + (i % 4) * 0.08,
    }
  })
}

const PARTICLES = buildParticles(14)

function scrollTo(anchor: string) {
  const el = document.querySelector(anchor)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function LandingCTA() {
  const { language } = useLanguage()
  const c = CTA_COPY[language] || CTA_COPY.en
  const lh = (p: string) => `/${language}${p}`

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-28 sm:py-36 overflow-hidden">
      {/* Background gradients */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,212,255,0.08) 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 50% at 80% 80%, rgba(124,58,237,0.08) 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 40% 40% at 20% 20%, rgba(0,212,255,0.05) 0%, transparent 60%)',
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              backgroundColor: i % 2 === 0 ? '#00d4ff' : '#7c3aed',
              opacity: p.opacity,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [p.opacity, p.opacity * 1.8, p.opacity],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative max-w-3xl mx-auto text-center flex flex-col items-center gap-7">
        {/* Pre-title */}
        <motion.p
          className="text-sm font-semibold tracking-widest uppercase text-white/40"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {c.preTitle}
        </motion.p>

        {/* Title */}
        <motion.h2
          className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white/95 leading-[1.1]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
        >
          {c.title1}{' '}
          <span
            className="inline-block"
            style={{
              background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {c.titleAccent}
          </span>
          {' '}{c.title2}{' '}
          <span className="relative inline-block">
            <span
              style={{
                background: 'linear-gradient(135deg, #e83a3a, #f97316)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {c.titleGeorgian}
            </span>
            {/* Underline accent */}
            <span
              className="absolute bottom-0 left-0 right-0 h-px"
              style={{
                background: 'linear-gradient(to right, transparent, rgba(232,58,58,0.5), transparent)',
              }}
            />
          </span>
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          className="text-base sm:text-lg text-white/50 leading-relaxed max-w-xl"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
        >
          {c.subtitle}
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3 mt-2"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
        >
          <GlowButton href={lh('/signup')} variant="primary" size="lg">
            {c.cta1}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </GlowButton>
          <GlowButton onClick={() => scrollTo('#services')} variant="ghost" size="lg">
            {c.cta2}
          </GlowButton>
        </motion.div>
      </div>
    </section>
  )
}
