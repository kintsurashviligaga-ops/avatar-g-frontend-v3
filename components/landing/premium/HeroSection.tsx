'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { HeroVideo } from './HeroVideo'

/* ─── Copy ──────────────────────────────────────────────── */
const COPY = {
  en: {
    headline1: 'Create Everything with AI',
    headline2: 'All in One Place.',
    cta1: 'Start Creating',
    cta2: 'Explore Tools',
    trust: 'Trusted by creators, businesses and developers worldwide',
  },
  ka: {
    headline1: 'შექმენი ყველაფერი AI-ით',
    headline2: 'ერთ სივრცეში.',
    cta1: 'შექმნის დაწყება',
    cta2: 'ინსტრუმენტების ნახვა',
    trust: 'კრეატორების, ბიზნესისა და დეველოპერების ნდობით მსოფლიოში',
  },
  ru: {
    headline1: 'Создавайте всё с помощью AI',
    headline2: 'В одном месте.',
    cta1: 'Начать создание',
    cta2: 'Обзор инструментов',
    trust: 'Доверяют создатели, бизнесы и разработчики по всему миру',
  },
} as const

export function HeroSection() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="cinematic-section relative overflow-hidden px-4 sm:px-6 lg:px-10 pt-20 pb-12 sm:pt-36 sm:pb-24 lg:pt-48 lg:pb-32">

      {/* Modern mesh gradient — multi-color depth layers */}
      {/* Layer 1: Primary cyan glow (top-center) */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 85% 65% at 50% -10%, rgba(34,211,238,0.18) 0%, rgba(6,182,212,0.08) 40%, transparent 70%)' }} />
      
      {/* Layer 2: Purple accent (left-top) */}
      <div className="absolute top-0 left-1/4 -translate-x-12 w-[700px] h-[600px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 55% 60% at 50% 20%, rgba(168,85,247,0.12) 0%, rgba(168,85,247,0.04) 35%, transparent 65%)', filter: 'blur(70px)' }} />
      
      {/* Layer 3: Deep blue accent (right-top) */}
      <div className="absolute top-0 right-1/4 translate-x-12 w-[700px] h-[600px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 55% 60% at 50% 20%, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0.03) 35%, transparent 65%)', filter: 'blur(80px)' }} />
      
      {/* Layer 4: Dynamic center glow (enhanced depth) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[600px] pointer-events-none animate-gradient-x" style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 40%, rgba(34,211,238,0.14) 0%, rgba(168,85,247,0.06) 30%, transparent 70%)', filter: 'blur(90px)' }} />

      {/* Subtle grid overlay for structure */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(var(--color-text) 0.5px, transparent 0.5px)', backgroundSize: '32px 32px' }} />
      
      {/* Modern edge fade — prevents harsh edges */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.4]" style={{ background: 'radial-gradient(ellipse 90% 100% at 50% 50%, transparent 0%, rgba(10,18,36,0.3) 100%)' }} />

      <div className="relative z-10 mx-auto max-w-5xl flex flex-col items-center text-center gap-6 sm:gap-8 lg:gap-12">

        {/* Badge — modern glass capsule with animation */}
        <motion.div 
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex items-center gap-3 holo-panel px-4 py-2 !rounded-full backdrop-blur-md border border-cyan-500/20 hover:border-cyan-500/50 transition-all hover:shadow-[0_0_24px_rgba(34,211,238,0.3)]" 
          style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(168,85,247,0.08))' }}>
          <motion.div 
            className="relative w-[47px] h-[47px]"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Image src="/brand/gemini-rocket-clean.png" alt="MyAvatar.ge" fill sizes="47px" className="object-contain drop-shadow-lg" />
          </motion.div>
          <span className="text-xs tracking-widest uppercase font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent" style={{ backgroundSize: '200%' }}>
            AI Creation Platform
          </span>
        </motion.div>

        {/* Headline — modern cinematic type with animation */}
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          >
            <h1 className="text-4xl sm:text-5xl lg:text-7xl xl:text-8xl font-900 tracking-tight leading-[1.05] drop-shadow-2xl" style={{ color: 'var(--color-text)', textShadow: '0 0 40px rgba(34,211,238,0.15)' }}>
              {c.headline1}
            </h1>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          >
            <h2 className="text-4xl sm:text-5xl lg:text-7xl xl:text-8xl font-900 tracking-tight leading-[1.05]">
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent animate-pulse-slow" style={{ backgroundSize: '200% 200%' }}>
                {c.headline2}
              </span>
            </h2>
          </motion.div>
        </div>

        {/* CTA Buttons — cinematic treatment with staggered animation */}
        <motion.div 
          className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
        >
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <Link
              href={lh('/signup')}
              className="cinematic-btn cinematic-btn-primary text-sm px-8 py-3.5 rounded-xl"
            >
              {c.cta1}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <Link
              href={lh('/services')}
              className="cinematic-btn cinematic-btn-secondary text-sm px-8 py-3.5 rounded-xl"
            >
              {c.cta2}
            </Link>
          </motion.div>
        </motion.div>

        {/* ── Cinematic Hero Video ── */}
        <motion.div 
          className="w-full mt-10 sm:mt-14 lg:mt-16 px-2 sm:px-0" 
          style={{ maxWidth: 1100 }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8, ease: "easeOut" }}
        >
          <HeroVideo />
        </motion.div>

        {/* Trust signal — improved typography with fade-in */}
        <motion.p 
          className="mt-8 sm:mt-12 text-sm sm:text-base font-light tracking-wide" 
          style={{ color: 'var(--color-text-tertiary)' }}
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
