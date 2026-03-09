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
    <section className="relative py-28 sm:py-36 px-4 sm:px-6 overflow-hidden">
      {/* Top border */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />

      {/* Layered background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/[0.06] via-transparent to-violet-600/[0.07]" />
        {/* Central radial */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[700px] bg-gradient-to-r from-cyan-500/[0.07] to-violet-500/[0.07] rounded-full blur-[160px] animate-glow-pulse" />
        {/* Corner glow */}
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/[0.06] rounded-full blur-[100px]" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/[0.04] rounded-full blur-[100px]" />
        {/* Scan line */}
        <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent animate-neon-scan" />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Top + bottom fade */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#030710] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#030710] to-transparent" />
      </div>

      <motion.div
        className="relative mx-auto max-w-3xl text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
      >
        {/* Badge */}
        <motion.div
          className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full border border-cyan-400/22 bg-cyan-400/[0.07] backdrop-blur-md mb-10 shadow-[0_0_30px_rgba(34,211,238,0.12)]"
          animate={{ boxShadow: ['0 0 0 rgba(34,211,238,0)', '0 0 50px rgba(34,211,238,0.18)', '0 0 0 rgba(34,211,238,0)'] }}
          transition={{ duration: 3.5, repeat: Infinity }}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
          <span className="text-[11px] font-bold text-cyan-200/80 tracking-[0.16em] uppercase">{text.badge}</span>
        </motion.div>

        {/* Headline */}
        <h2 className="text-[2.2rem] sm:text-5xl lg:text-[4rem] font-extrabold text-white mb-6 leading-[1.06] tracking-[-0.03em]">
          {text.title}{' '}
          <span className="relative inline-block">
            <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
              {text.titleAccent}
            </span>
            {/* Neon underline */}
            <motion.span
              className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-500 rounded-full"
              style={{ boxShadow: '0 0 12px rgba(34,211,238,0.6)' }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, duration: 0.8 }}
            />
          </span>
        </h2>

        {/* Subtitle */}
        <p className="text-white/45 text-base sm:text-lg max-w-xl mx-auto mb-12 leading-relaxed">
          {text.subtitle}
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
          <GlassButton
            href={`/${locale}/signup`}
            size="lg"
            variant="ghost"
            className="group relative w-full sm:w-auto ag-btn-primary text-white font-bold border border-cyan-300/40 shadow-[0_0_60px_rgba(34,211,238,0.38)] hover:shadow-[0_0_88px_rgba(34,211,238,0.55)] px-8"
          >
            <Sparkles className="w-4 h-4" />
            <span>{text.primary}</span>
            <ArrowRight className="relative w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
          </GlassButton>
          <GlassButton
            href={`/${locale}/services`}
            size="lg"
            variant="ghost"
            className="w-full sm:w-auto btn-ghost border border-white/12 text-white/65 hover:text-white px-7"
          >
            <span>{text.secondary}</span>
          </GlassButton>
        </div>

        {/* Trust strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-10 flex items-center justify-center gap-6 flex-wrap"
        >
          {['No credit card required', '17 AI modules', '99.9% uptime SLA'].map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-white/30 font-medium">
              <span className="w-1 h-1 rounded-full bg-emerald-400/60" />
              {item}
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Bottom border */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
    </section>
  )
}
