'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, Sparkles, Shield, Zap, PhoneCall } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { GlassButton } from '@/components/ui/GlassButton'
import { NeonBadge } from '@/components/ui/NeonBadge'

interface HeroSectionProps {
  onPremiumClick?: () => void
}

const HERO_TEXT = {
  ka: {
    badge: 'AI პლატფორმა',
    title: 'შენი AI',
    titleAccent: 'ქარხანა',
    subtitle: 'ყველაფერი ერთ სივრცეში.',
    description: 'შექმენი ავატარი, ვიდეო, მუსიკა, დიზაინი და კონტენტი — ყველაფერი ერთ ინტელექტუალურ სივრცეში, 16 AI მოდულით.',
    cta: 'დაიწყე ახლა',
    secondary: 'სერვისების ნახვა',
    agent: 'ესაუბრე Agent G-ს',
    badgeModules: '16 მოდული',
    badgeUptime: '99.9% აქტიურობა',
    badgeEnterprise: 'Enterprise Ready',
  },
  en: {
    badge: 'AI Platform',
    title: 'Your AI',
    titleAccent: 'Factory',
    subtitle: 'Everything in one space.',
    description: 'Create avatars, video, music, design and content — all in one intelligent space with 16 AI modules.',
    cta: 'Get Started',
    secondary: 'View Services',
    agent: 'Talk to Agent G',
    badgeModules: '16 Modules',
    badgeUptime: '99.9% Uptime',
    badgeEnterprise: 'Enterprise Ready',
  },
  ru: {
    badge: 'AI Платформа',
    title: 'Твоя AI',
    titleAccent: 'Фабрика',
    subtitle: 'Всё в одном пространстве.',
    description: 'Создавай аватары, видео, музыку, дизайн и контент — всё в одном интеллектуальном пространстве с 16 AI модулями.',
    cta: 'Начать',
    secondary: 'Услуги',
    agent: 'Поговорить с Agent G',
    badgeModules: '16 Модулей',
    badgeUptime: '99.9% Аптайм',
    badgeEnterprise: 'Для бизнеса',
  },
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
}

export function HeroSection({ onPremiumClick }: HeroSectionProps) {
  const { language } = useLanguage()
  const text = HERO_TEXT[language as keyof typeof HERO_TEXT] || HERO_TEXT.ka

  return (
    <section className="relative min-h-[92vh] flex flex-col items-center justify-center overflow-hidden px-4 sm:px-6 pt-20 md:pt-24 pb-16">
      {/* Cinematic aurora overlays */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-cyan-500/[0.08] via-cyan-400/[0.04] to-transparent rounded-full blur-3xl" />
        <div className="absolute top-[10%] right-[-10%] w-[400px] h-[400px] bg-gradient-to-bl from-violet-500/[0.07] to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-[15%] left-[-5%] w-[350px] h-[350px] bg-gradient-to-tr from-blue-500/[0.06] to-transparent rounded-full blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 mx-auto max-w-5xl text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Badge */}
        <motion.div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.2)]" variants={itemVariants}>
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-medium text-white/60 tracking-[0.14em] uppercase">{text.badge}</span>
        </motion.div>

        {/* H1 — split with gradient accent */}
        <motion.h1
          className="mt-8 text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-white"
          variants={itemVariants}
        >
          {text.title}{' '}
          <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
            {text.titleAccent}
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="mt-5 text-xl sm:text-2xl md:text-3xl font-medium bg-gradient-to-r from-white/60 to-white/40 bg-clip-text text-transparent tracking-[-0.01em]"
          variants={itemVariants}
        >
          {text.subtitle}
        </motion.p>

        {/* Description */}
        <motion.p
          className="mt-6 text-base md:text-lg text-white/40 max-w-2xl mx-auto leading-relaxed"
          variants={itemVariants}
        >
          {text.description}
        </motion.p>

        {/* Badges row */}
        <motion.div className="mt-8 flex flex-wrap items-center justify-center gap-2.5" variants={itemVariants}>
          <NeonBadge variant="cyan"><Zap className="w-3 h-3" /> {text.badgeModules}</NeonBadge>
          <NeonBadge variant="violet"><Shield className="w-3 h-3" /> {text.badgeUptime}</NeonBadge>
          <NeonBadge variant="magenta">{text.badgeEnterprise}</NeonBadge>
        </motion.div>

        {/* CTAs */}
        <motion.div className="mt-10 flex flex-col sm:flex-row sm:flex-wrap justify-center gap-3 sm:gap-4" variants={itemVariants}>
          <GlassButton
            href={'/' + (language || 'ka') + '/services'}
            size="lg"
            variant="primary"
            className="shadow-[0_0_40px_rgba(255,255,255,0.08)] hover:shadow-[0_0_60px_rgba(255,255,255,0.14)]"
          >
            {text.cta}
            <ArrowRight className="w-4 h-4" />
          </GlassButton>

          <Link
            href={'/' + (language || 'ka') + '/services'}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl border border-white/[0.10] text-white/70 font-medium text-sm hover:bg-white/[0.05] hover:border-white/[0.18] hover:text-white transition-all duration-300 backdrop-blur-sm"
          >
            {text.secondary}
          </Link>

          <Link
            href={'/' + (language || 'ka') + '/services/agent-g'}
            onClick={(e) => { if (onPremiumClick) { e.preventDefault(); onPremiumClick(); } }}
            className="group relative inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-violet-500/15 text-cyan-100 font-semibold text-sm shadow-[0_0_24px_rgba(34,211,238,0.15)] hover:shadow-[0_0_40px_rgba(34,211,238,0.25)] hover:border-cyan-400/40 transition-all duration-300"
          >
            <PhoneCall className="w-4 h-4 text-cyan-300 group-hover:text-cyan-200 transition-colors" />
            {text.agent}
          </Link>
        </motion.div>
      </motion.div>

      {/* Bottom fade into next section */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#030712] to-transparent pointer-events-none" />
    </section>
  )
}
