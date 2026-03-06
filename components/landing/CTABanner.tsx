'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { GlassButton } from '@/components/ui/GlassButton'

const CTA_COPY = {
  en: {
    badge: 'Start building for free today',
    title: 'Ready to Create',
    titleAccent: 'Something Amazing?',
    subtitle: 'Join thousands of creators using MyAvatar to produce professional content with AI — no technical skills required.',
    primary: 'Get Started Free',
  },
  ka: {
    badge: 'დაიწყე უფასოდ დღესვე',
    title: 'მზად ხარ შექმნა',
    titleAccent: 'განსაკუთრებული რამ?',
    subtitle: 'შემოუერთდი ათასობით შემქმნელს, ვინც MyAvatar-ით პროფესიონალურ კონტენტს ქმნის AI-ს დახმარებით.',
    primary: 'დაიწყე უფასოდ',
  },
  ru: {
    badge: 'Начните бесплатно уже сегодня',
    title: 'Готовы создать',
    titleAccent: 'что-то впечатляющее?',
    subtitle: 'Присоединяйтесь к тысячам креаторов, которые создают профессиональный контент с помощью MyAvatar и AI.',
    primary: 'Начать бесплатно',
  },
} as const

export function CTABanner() {
  const { language: locale } = useLanguage()
  const text = CTA_COPY[locale as keyof typeof CTA_COPY] || CTA_COPY.ka

  return (
    <section className="relative py-28 px-4 sm:px-6 overflow-hidden border-t border-cyan-300/[0.22]">
      {/* Refined background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/[0.1] via-transparent to-violet-600/[0.1]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[980px] h-[980px] bg-gradient-to-r from-cyan-500/[0.12] to-violet-500/[0.12] rounded-full blur-[130px] animate-glow-pulse" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <motion.div
        className="relative mx-auto max-w-3xl text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
      >
        <motion.div
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-cyan-400/15 bg-cyan-400/[0.05] backdrop-blur-sm mb-8"
          animate={{ boxShadow: ['0 0 0 rgba(6,182,212,0)', '0 0 40px rgba(6,182,212,0.1)', '0 0 0 rgba(6,182,212,0)'] }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-cyan-300/80">{text.badge}</span>
        </motion.div>

        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-7 leading-tight tracking-[-0.02em]">
          {text.title}{' '}
          <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
            {text.titleAccent}
          </span>
        </h2>

        <p className="text-white/35 text-base md:text-lg max-w-xl mx-auto mb-12 leading-relaxed">
          {text.subtitle}
        </p>

        <div className="flex items-center justify-center">
          <GlassButton
            href={`/${locale}/signup`}
            size="lg"
            variant="ghost"
            className="group relative bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 text-white font-semibold border border-cyan-300/40 shadow-[0_0_55px_rgba(6,182,212,0.34)] hover:shadow-[0_0_78px_rgba(6,182,212,0.5)] hover:brightness-110"
          >
            <span>{text.primary}</span>
            <ArrowRight className="relative w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
          </GlassButton>
        </div>
      </motion.div>
    </section>
  )
}
