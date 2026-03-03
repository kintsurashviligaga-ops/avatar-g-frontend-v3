'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface HeroSectionProps {
  onPremiumClick?: () => void
}

const HERO_TEXT = {
  ka: {
    badge: 'AI პლატფორმა',
    title: 'შენი AI ქარხანა',
    subtitle: 'ყველაფერი ერთ სივრცეში.',
    description: 'შექმენი ავატარი, ვიდეო, მუსიკა, დიზაინი და კონტენტი — ყველაფერი ერთ ინტელექტუალურ სივრცეში, 16 AI მოდულით.',
    cta: 'დაიწყე ახლა',
    secondary: 'სერვისების ნახვა',
  },
  en: {
    badge: 'AI Platform',
    title: 'Your AI Factory',
    subtitle: 'Everything in one space.',
    description: 'Create avatars, video, music, design and content — all in one intelligent space with 16 AI modules.',
    cta: 'Get Started',
    secondary: 'View Services',
  },
  ru: {
    badge: 'AI Платформа',
    title: 'Твоя AI Фабрика',
    subtitle: 'Всё в одном пространстве.',
    description: 'Создавай аватары, видео, музыку, дизайн и контент — всё в одном интеллектуальном пространстве с 16 AI модулями.',
    cta: 'Начать',
    secondary: 'Услуги',
  },
}

export function HeroSection({ onPremiumClick }: HeroSectionProps) {
  const { language } = useLanguage()
  const text = HERO_TEXT[language as keyof typeof HERO_TEXT] || HERO_TEXT.ka

  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden px-4 sm:px-6">
      {/* Subtle aurora overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.08), transparent),' +
            'radial-gradient(ellipse 60% 40% at 80% 50%, rgba(99,102,241,0.06), transparent)',
        }}
      />

      <motion.div
        className="relative z-10 mx-auto max-w-4xl text-center space-y-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        {/* Badge */}
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-medium text-white/70 tracking-wide">{text.badge}</span>
        </motion.div>

        {/* H1 */}
        <motion.h1
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.05] tracking-tight text-white"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
        >
          {text.title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="text-xl sm:text-2xl md:text-3xl font-medium text-white/60 tracking-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6 }}
        >
          {text.subtitle}
        </motion.p>

        {/* Description */}
        <motion.p
          className="text-base md:text-lg text-white/45 max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          {text.description}
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row justify-center gap-4 pt-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5 }}
        >
          <Link
            href={'/' + (language || 'ka') + '/services'}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-white text-[#050510] font-semibold text-sm hover:bg-white/90 transition-all shadow-lg shadow-white/10"
          >
            {text.cta}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href={'/' + (language || 'ka') + '/services'}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl border border-white/15 text-white/80 font-medium text-sm hover:bg-white/[0.06] transition-all backdrop-blur-sm"
          >
            {text.secondary}
          </Link>
        </motion.div>
      </motion.div>
    </section>
  )
}
