'use client'

/**
 * StudioShowcase — Immersive AI Studio preview section.
 * Shows the hub interface preview with feature highlights and CTA.
 */

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    eyebrow: 'AI PRODUCTION STUDIO',
    title: 'Your Complete AI Workspace',
    subtitle: '18 AI services in one unified studio. Create avatars, videos, music, images, marketing copy, and automate entire workflows — all from a single dashboard.',
    features: [
      { icon: '🎛️', label: 'Smart Dashboard', desc: 'Pipeline stats, activity feed, quick launch for all 18 services' },
      { icon: '🎭', label: 'Avatar Creator', desc: 'Upload, style, frame, and generate photorealistic AI avatars' },
      { icon: '🎬', label: 'Video Studio', desc: 'Scene builder, camera moves, styles, duration control' },
      { icon: '🎵', label: 'Music Composer', desc: '12 genres, mood selection, instruments, BPM control' },
      { icon: '✍️', label: 'Copy Generator', desc: '12 formats, 8 tones, multilingual, SEO optimization' },
      { icon: '⚡', label: 'Pipeline Builder', desc: 'Visual workflow canvas — chain services into automated pipelines' },
    ],
    cta: 'Open AI Studio',
    ctaSub: 'Free to start · No credit card required',
  },
  ka: {
    eyebrow: 'AI პროდაქშენ სტუდია',
    title: 'შენი სრული AI სამუშაო სივრცე',
    subtitle: '18 AI სერვისი ერთ სტუდიაში. შექმენი ავატარები, ვიდეოები, მუსიკა, სურათები, მარკეტინგული ტექსტები და ავტომატიზირე მთელი ვორქფლოუ.',
    features: [
      { icon: '🎛️', label: 'სმარტ დეშბორდი', desc: 'პაიპლაინის სტატისტიკა, აქტივობა, სწრაფი დაწყება' },
      { icon: '🎭', label: 'ავატარ შემქმნელი', desc: 'ატვირთე, სტილი, ჩარჩო და გენერაცია' },
      { icon: '🎬', label: 'ვიდეო სტუდია', desc: 'სცენების აგება, კამერის მოძრაობა, სტილები' },
      { icon: '🎵', label: 'მუსიკის კომპოზიტორი', desc: '12 ჟანრი, განწყობა, ინსტრუმენტები, BPM' },
      { icon: '✍️', label: 'ტექსტის გენერატორი', desc: '12 ფორმატი, 8 ტონი, მრავალენოვანი' },
      { icon: '⚡', label: 'პაიპლაინ ბილდერი', desc: 'ვიზუალური ვორქფლოუ — სერვისების ჯაჭვი' },
    ],
    cta: 'AI სტუდიის გახსნა',
    ctaSub: 'უფასოდ · საკრედიტო ბარათი არ სჭირდება',
  },
  ru: {
    eyebrow: 'AI ПРОДАКШН СТУДИЯ',
    title: 'Полное AI Рабочее Пространство',
    subtitle: '18 AI-сервисов в одной студии. Создавайте аватары, видео, музыку, изображения, маркетинговые тексты и автоматизируйте рабочие процессы.',
    features: [
      { icon: '🎛️', label: 'Умный дашборд', desc: 'Статистика пайплайнов, активность, быстрый запуск' },
      { icon: '🎭', label: 'Создатель аватаров', desc: 'Загрузка, стили, обрамление, генерация' },
      { icon: '🎬', label: 'Видео студия', desc: 'Построение сцен, движение камеры, стили' },
      { icon: '🎵', label: 'Музыкальный композитор', desc: '12 жанров, настроение, инструменты, BPM' },
      { icon: '✍️', label: 'Генератор текстов', desc: '12 форматов, 8 тонов, мультиязычный' },
      { icon: '⚡', label: 'Построитель пайплайнов', desc: 'Визуальный конструктор — цепочки сервисов' },
    ],
    cta: 'Открыть AI Студию',
    ctaSub: 'Бесплатно · Без кредитной карты',
  },
} as const

const STUDIO_PANELS = [
  { label: 'Dashboard', icon: '📊', active: true },
  { label: 'Avatar', icon: '🎭', active: false },
  { label: 'Video', icon: '🎬', active: false },
  { label: 'Image', icon: '🖼️', active: false },
  { label: 'Music', icon: '🎵', active: false },
  { label: 'Copy', icon: '✍️', active: false },
  { label: 'Workflow', icon: '⚡', active: false },
  { label: 'Agent G', icon: '🤖', active: false },
]

export function StudioShowcase() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 30%, rgba(34,211,238,0.06) 0%, transparent 70%)' }} />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] pointer-events-none" style={{ background: 'radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.06) 0%, transparent 70%)' }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-14 sm:mb-20">
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-4"
            style={{ color: 'var(--color-accent)' }}
          >
            {c.eyebrow}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {c.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-4 max-w-2xl mx-auto text-sm sm:text-base"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {c.subtitle}
          </motion.p>
        </div>

        {/* Studio Preview Window */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="relative rounded-2xl sm:rounded-3xl overflow-hidden mx-auto max-w-5xl"
          style={{
            background: 'linear-gradient(170deg, #0b1219, #080e14 40%, #0a1018)',
            border: '1px solid rgba(34,211,238,0.12)',
            boxShadow: '0 20px 80px rgba(0,0,0,0.6), 0 0 60px rgba(34,211,238,0.04)',
          }}
        >
          {/* Window Chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="flex items-center gap-2 px-4 py-1 rounded-lg text-[11px]" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)' }}>
                🔒 myavatar.ge/hub
              </div>
            </div>
          </div>

          {/* Studio Layout */}
          <div className="flex min-h-[320px] sm:min-h-[400px]">
            {/* Sidebar */}
            <div className="hidden sm:flex flex-col w-[180px] border-r border-white/[0.06] py-3 px-2 gap-0.5">
              {STUDIO_PANELS.map((p) => (
                <div
                  key={p.label}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium"
                  style={{
                    color: p.active ? 'var(--color-accent)' : 'rgba(255,255,255,0.4)',
                    background: p.active ? 'rgba(34,211,238,0.08)' : 'transparent',
                    borderLeft: p.active ? '2px solid rgba(34,211,238,0.5)' : '2px solid transparent',
                  }}
                >
                  <span>{p.icon}</span>
                  {p.label}
                </div>
              ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-4 sm:p-6">
              {/* Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Avatars', value: '12', icon: '🎭', color: 'rgba(167,139,250,0.15)' },
                  { label: 'Pipelines', value: '7', icon: '⚡', color: 'rgba(34,211,238,0.15)' },
                  { label: 'Services', value: '18', icon: '📊', color: 'rgba(251,191,36,0.15)' },
                  { label: 'Success', value: '98%', icon: '✅', color: 'rgba(52,211,153,0.15)' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3" style={{ background: s.color, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-lg mb-1">{s.icon}</div>
                    <div className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{s.value}</div>
                    <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Quick Launch */}
              <div className="flex flex-wrap gap-2 mb-6">
                {['🎭 Avatar', '🎬 Video', '🖼️ Image', '🎵 Music', '✍️ Copy', '⚡ Flow'].map(s => (
                  <div key={s} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                    {s}
                  </div>
                ))}
              </div>

              {/* Pipeline Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { emoji: '🎬', name: 'Brand Video', steps: 3, status: 'Done', color: '#22d3ee' },
                  { emoji: '🎵', name: 'Music Clip', steps: 3, status: 'Running', color: '#a78bfa' },
                ].map(p => (
                  <div key={p.name} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{p.emoji}</span>
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{p.name}</span>
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full" style={{ background: p.status === 'Done' ? 'rgba(52,211,153,0.15)' : 'rgba(34,211,238,0.15)', color: p.status === 'Done' ? '#34d399' : '#22d3ee' }}>
                        {p.status}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: p.steps }).map((_, i) => (
                        <div key={i} className="flex-1 h-1 rounded-full" style={{ background: p.color + '40' }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12 sm:mt-16 max-w-5xl mx-auto">
          {c.features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * i }}
              className="rounded-2xl p-5 transition-all hover:-translate-y-1"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{f.icon}</span>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{f.label}</h3>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={lh('/hub')}
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl text-base font-bold transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-cyan-500/20"
            style={{ background: 'linear-gradient(135deg, #22d3ee, #06b6d4)', color: '#fff' }}
          >
            {c.cta}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
          <p className="mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{c.ctaSub}</p>
        </motion.div>
      </div>
    </section>
  )
}
