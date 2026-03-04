'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Sparkles, Shield, Zap } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { GlassButton } from '@/components/ui/GlassButton'
import { NeonBadge } from '@/components/ui/NeonBadge'

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
    <section className="relative min-h-[92vh] flex flex-col items-center justify-center overflow-hidden px-4 sm:px-6">
      {/* Subtle aurora overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 45% at 50% -10%, rgba(34,211,238,0.12), transparent),' +
            'radial-gradient(ellipse 45% 35% at 85% 45%, rgba(99,102,241,0.10), transparent),' +
            'radial-gradient(ellipse 40% 30% at 15% 70%, rgba(217,70,239,0.08), transparent)',
        }}
      />

      <motion.div
        className="relative z-10 mx-auto max-w-5xl text-center space-y-8"
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
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.03] tracking-tight text-white"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
        >
          <span className="bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent">{text.title}</span>
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
          className="text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          {text.description}
        </motion.p>

        <motion.div
          className="flex flex-wrap items-center justify-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.68, duration: 0.45 }}
        >
          <NeonBadge variant="cyan"><Zap className="w-3 h-3" /> 16 Modules</NeonBadge>
          <NeonBadge variant="violet"><Shield className="w-3 h-3" /> 99.9% Uptime</NeonBadge>
          <NeonBadge variant="magenta">Enterprise Ready</NeonBadge>
        </motion.div>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row justify-center gap-4 pt-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5 }}
        >
          <GlassButton href={'/' + (language || 'ka') + '/services'} size="lg" variant="primary" className="shadow-[0_0_30px_rgba(255,255,255,0.12)]">
            {text.cta}
            <ArrowRight className="w-4 h-4" />
          </GlassButton>
          <Link
            href={'/' + (language || 'ka') + '/services'}
            onClick={(e) => { if (onPremiumClick) { e.preventDefault(); onPremiumClick(); } }}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl border border-white/15 text-white/80 font-medium text-sm hover:bg-white/[0.06] transition-all backdrop-blur-sm"
          >
            {text.secondary}
          </Link>
        </motion.div>
      </motion.div>
    </section>
  )
}
