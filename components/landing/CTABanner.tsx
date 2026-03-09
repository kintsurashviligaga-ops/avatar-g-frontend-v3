'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { GlassButton } from '@/components/ui/GlassButton'

const CTA_COPY = {
  en: {
    badge: 'ONE PLATFORM · INFINITE OUTPUT',
    title: 'Build, Automate,',
    titleAccent: 'and Scale.',
    subtitle: 'Start free — create avatars, videos, music, automations, and entire AI-powered production pipelines in one connected workspace.',
    primary: 'Start Free Today',
    secondary: 'Explore Services',
  },
  ka: {
    badge: 'ერთი პლატფორმა · უსაზღვრო შედეგი',
    title: 'შენი AI სისტემა',
    titleAccent: 'მზად არის.',
    subtitle: 'დაიწყე უფასოდ — შექმენი ავატარები, ვიდეო, მუსიკა, ავტომაციები და AI-powered წარმოების პაიპლაინები ერთ სამუშაო სივრცეში.',
    primary: 'დაიწყე უფასოდ',
    secondary: 'ნახე სერვისები',
  },
  ru: {
    badge: 'ОДНА ПЛАТФОРМА · БЕЗГРАНИЧНЫЙ РЕЗУЛЬТАТ',
    title: 'Создавай, Автоматизируй,',
    titleAccent: 'Масштабируй.',
    subtitle: 'Начни бесплатно — создавай аватары, видео, музыку, автоматизации и полноценные AI-производственные процессы в едином пространстве.',
    primary: 'Начать бесплатно',
    secondary: 'Все сервисы',
  },
} as const

export function CTABanner() {
  const { language: locale } = useLanguage()
  const text = CTA_COPY[locale as keyof typeof CTA_COPY] || CTA_COPY.ka

  return (
    <section className="relative py-24 sm:py-36 px-4 sm:px-6 overflow-hidden border-t border-cyan-300/[0.18]">
      {/* Refined background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/[0.08] via-transparent to-violet-600/[0.09]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[640px] bg-gradient-to-r from-cyan-500/[0.10] to-violet-500/[0.10] rounded-full blur-[140px] animate-glow-pulse" />
        {/* Dot grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Top + bottom fade */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#020612] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#020612] to-transparent" />
      </div>

      <motion.div
        className="relative mx-auto max-w-3xl text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
      >
        <motion.div
          className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] backdrop-blur-sm mb-9"
          animate={{ boxShadow: ['0 0 0 rgba(6,182,212,0)', '0 0 40px rgba(6,182,212,0.14)', '0 0 0 rgba(6,182,212,0)'] }}
          transition={{ duration: 3.5, repeat: Infinity }}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold text-cyan-200/80 tracking-[0.14em] uppercase">{text.badge}</span>
        </motion.div>

        <h2 className="text-[2.1rem] sm:text-5xl lg:text-[3.8rem] font-extrabold text-white mb-6 sm:mb-7 leading-[1.07] tracking-[-0.03em]">
          {text.title}{' '}
          <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
            {text.titleAccent}
          </span>
        </h2>

        <p className="text-white/48 text-[15px] sm:text-base md:text-lg max-w-2xl mx-auto mb-11 sm:mb-13 leading-relaxed">
          {text.subtitle}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
          <GlassButton
            href={`/${locale}/signup`}
            size="lg"
            variant="ghost"
            className="group relative w-full sm:w-auto bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 text-white font-bold border border-cyan-300/40 shadow-[0_0_60px_rgba(6,182,212,0.38)] hover:shadow-[0_0_88px_rgba(6,182,212,0.54)] hover:brightness-110 px-8"
          >
            <span>{text.primary}</span>
            <ArrowRight className="relative w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
          </GlassButton>
          <GlassButton
            href={`/${locale}/services`}
            size="lg"
            variant="ghost"
            className="w-full sm:w-auto border border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm px-7"
          >
            <span>{text.secondary}</span>
          </GlassButton>
        </div>
      </motion.div>
    </section>
  )
}
