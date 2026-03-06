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
    <section className="relative min-h-[86vh] md:min-h-[92vh] flex flex-col items-center justify-center overflow-hidden px-4 sm:px-6 pt-16 md:pt-24 pb-14 md:pb-16">
      {/* Cinematic aurora overlays */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[980px] h-[560px] bg-gradient-to-b from-cyan-400/[0.14] via-cyan-400/[0.08] to-transparent rounded-full blur-3xl" />
        <div className="absolute top-[8%] right-[-10%] w-[440px] h-[440px] bg-gradient-to-bl from-violet-400/[0.13] to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-[12%] left-[-5%] w-[390px] h-[390px] bg-gradient-to-tr from-blue-400/[0.12] to-transparent rounded-full blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 mx-auto max-w-5xl text-center ag-surface-hero rounded-[1.5rem] sm:rounded-[2rem] px-4 sm:px-8 md:px-12 py-9 sm:py-14 shadow-[0_30px_120px_rgba(2,6,18,0.68),0_0_80px_rgba(34,211,238,0.18)]"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Badge */}
        <motion.div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-white/[0.14] bg-white/[0.05] backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.2)]" variants={itemVariants}>
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-medium text-white/60 tracking-[0.14em] uppercase">{text.badge}</span>
        </motion.div>

        {/* H1 — split with gradient accent */}
        <motion.h1
          className="mt-6 sm:mt-8 text-[2.35rem] xs:text-5xl sm:text-6xl md:text-7xl lg:text-[5.6rem] font-extrabold leading-[1.03] tracking-[-0.03em] sm:tracking-[-0.035em] text-white"
          variants={itemVariants}
        >
          {text.title}{' '}
          <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
            {text.titleAccent}
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="mt-4 sm:mt-5 text-lg sm:text-2xl md:text-3xl font-medium bg-gradient-to-r from-white/60 to-white/40 bg-clip-text text-transparent tracking-[-0.01em]"
          variants={itemVariants}
        >
          {text.subtitle}
        </motion.p>

        {/* Description */}
        <motion.p
          className="mt-5 sm:mt-6 text-[15px] sm:text-base md:text-lg text-white/45 max-w-2xl mx-auto leading-relaxed"
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
        <motion.div className="mt-8 sm:mt-10 flex flex-col sm:flex-row sm:flex-wrap justify-center gap-3 sm:gap-4" variants={itemVariants}>
          <GlassButton
            href={'/' + (language || 'ka') + '/services'}
            size="lg"
            variant="primary"
            className="w-full sm:w-auto bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 text-white border border-cyan-300/30 shadow-[0_0_44px_rgba(34,211,238,0.34)] hover:shadow-[0_0_74px_rgba(34,211,238,0.48)]"
          >
            {text.cta}
            <ArrowRight className="w-4 h-4" />
          </GlassButton>

          <Link
            href={'/' + (language || 'ka') + '/services'}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl border border-white/[0.16] text-white/75 font-medium text-sm hover:bg-white/[0.08] hover:border-white/[0.24] hover:text-white transition-all duration-300 backdrop-blur-sm"
          >
            {text.secondary}
          </Link>

          <Link
            href={'/' + (language || 'ka') + '/services/agent-g'}
            onClick={(e) => { if (onPremiumClick) { e.preventDefault(); onPremiumClick(); } }}
            className="w-full sm:w-auto group relative inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-violet-500/15 text-cyan-100 font-semibold text-sm shadow-[0_0_24px_rgba(34,211,238,0.15)] hover:shadow-[0_0_40px_rgba(34,211,238,0.25)] hover:border-cyan-400/40 transition-all duration-300"
          >
            <PhoneCall className="w-4 h-4 text-cyan-300 group-hover:text-cyan-200 transition-colors" />
            {text.agent}
          </Link>
        </motion.div>
      </motion.div>

      {/* Bottom fade into next section */}
      <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-[#030712] via-[#030712]/90 to-transparent pointer-events-none" />
    </section>
  )
}
