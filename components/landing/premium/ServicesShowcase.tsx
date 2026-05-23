'use client'

import { memo } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Lang = 'en' | 'ka' | 'ru'

const COPY = {
  en: { eyebrow: 'AI SERVICES', title: 'Everything You Need — In One Place', sub: 'Six core AI tools that cover every creative and business workflow.', cta: 'View All Services' },
  ka: { eyebrow: 'AI სერვისები', title: 'ყველაფერი რაც გჭირდება — ერთ სივრცეში', sub: 'ექვსი AI ინსტრუმენტი, რომელიც ფარავს ყველა შემოქმედებით და ბიზნეს-ნაკადს.', cta: 'ყველა სერვისის ნახვა' },
  ru: { eyebrow: 'AI-СЕРВИСЫ', title: 'Всё что нужно — в одном месте', sub: 'Шесть AI-инструментов для любого креативного и бизнес-процесса.', cta: 'Все сервисы' },
} as const

interface SvcCard {
  slug: string
  icon: string
  accent: string
  name: { en: string; ka: string; ru: string }
  desc: { en: string; ka: string; ru: string }
  features: { en: string[]; ka: string[]; ru: string[] }
}

const CARDS: SvcCard[] = [
  {
    slug: 'avatar', icon: '👤', accent: '#38bdf8',
    name: { en: 'Avatar Studio', ka: 'ავატარ სტუდია', ru: 'Аватар-студия' },
    desc: { en: 'Create photorealistic digital humans and identity assets', ka: 'შექმენი ფოტორეალისტური ციფრული ადამიანები', ru: 'Создайте фотореалистичные цифровые аватары' },
    features: { en: ['AI Portraits', 'Brand Avatars', 'Custom Styles'], ka: ['AI პორტრეტები', 'ბრენდ ავატარები', 'სტილები'], ru: ['AI-портреты', 'Бренд-аватары', 'Стили'] },
  },
  {
    slug: 'video', icon: '🎬', accent: '#f59e0b',
    name: { en: 'Video Generation', ka: 'ვიდეო გენერაცია', ru: 'Генерация видео' },
    desc: { en: 'Generate cinematic AI video from text or image prompts', ka: 'შექმენი კინემატოგრაფიული ვიდეო ტექსტიდან', ru: 'Генерируйте кинематографическое видео из текста' },
    features: { en: ['Text to Video', 'Image to Video', 'Cinematic Prompts'], ka: ['ტექსტიდან ვიდეო', 'სურათიდან ვიდეო', 'სცენარი'], ru: ['Текст в видео', 'Фото в видео', 'Сценарии'] },
  },
  {
    slug: 'image', icon: '🖼️', accent: '#22d3ee',
    name: { en: 'Image Generation', ka: 'სურათის გენერაცია', ru: 'Генерация изображений' },
    desc: { en: 'Create campaign-grade visuals and commercial imagery', ka: 'შექმენი კამპანიის დონის ვიზუალი', ru: 'Создайте визуалы коммерческого качества' },
    features: { en: ['Posters & Ads', 'Product Shots', 'Art & Illustration'], ka: ['პოსტერები', 'პროდუქტის ფოტო', 'ხელოვნება'], ru: ['Постеры', 'Продукт-фото', 'Арт'] },
  },
  {
    slug: 'music', icon: '🎵', accent: '#34d399',
    name: { en: 'Music Production', ka: 'მუსიკის პროდაქშენი', ru: 'Музыкальное производство' },
    desc: { en: 'Compose original beats, scores, and soundscapes with AI', ka: 'შექმენი ორიგინალური ბითები და საუნდსკეიფები', ru: 'Создавайте оригинальные биты и саундскейпы' },
    features: { en: ['Original Beats', 'Film Scores', 'Soundscapes'], ka: ['ბითები', 'მუსიკა', 'საუნდსკეიფი'], ru: ['Биты', 'Саундтреки', 'Саундскейпы'] },
  },
  {
    slug: 'text', icon: '✍️', accent: '#38bdf8',
    name: { en: 'Text & Copy', ka: 'ტექსტი და კოპი', ru: 'Текст и копирайтинг' },
    desc: { en: 'Write marketing copy, scripts, articles, and translations', ka: 'დაწერე მარკეტინგული ტექსტი და სცენარები', ru: 'Пишите маркетинговые тексты и сценарии' },
    features: { en: ['Marketing Copy', 'Scripts', 'Translations'], ka: ['მარკეტინგი', 'სცენარები', 'თარგმანები'], ru: ['Маркетинг', 'Сценарии', 'Переводы'] },
  },
  {
    slug: 'agent-g', icon: '🤖', accent: '#22d3ee',
    name: { en: 'Agent G', ka: 'Agent G', ru: 'Agent G' },
    desc: { en: 'Your AI orchestrator — routes tasks across all services', ka: 'თქვენი AI ორკესტრატორი — ანაწილებს ამოცანებს', ru: 'Ваш AI-оркестратор — распределяет задачи' },
    features: { en: ['Auto-Routing', 'Multi-Service', 'Smart Pipeline'], ka: ['ავტო-როუტინგი', 'მულტი-სერვისი', 'პაიპლაინი'], ru: ['Авто-роутинг', 'Мульти-сервис', 'Пайплайн'] },
  },
]

const ServiceCard = memo(function ServiceCard({ card, lang }: { card: SvcCard; lang: Lang }) {
  const { language } = useLanguage()
  return (
    <Link
      href={`/${language}/services/${card.slug}`}
      className="group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{
        background: 'linear-gradient(165deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Glow on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ boxShadow: `inset 0 0 0 1px ${card.accent}44, 0 0 30px ${card.accent}11` }}
      />

      <div className="p-5 sm:p-6 flex flex-col flex-1">
        {/* Icon + Name */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{
              background: `linear-gradient(135deg, ${card.accent}18, ${card.accent}08)`,
              border: `1px solid ${card.accent}25`,
            }}
          >
            {card.icon}
          </div>
          <div>
            <h3 className="text-sm font-bold transition-colors group-hover:text-[var(--color-accent)]" style={{ color: 'rgba(255,255,255,0.92)' }}>
              {card.name[lang]}
            </h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs leading-relaxed mb-4 flex-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {card.desc[lang]}
        </p>

        {/* Feature tags */}
        <div className="flex flex-wrap gap-1.5">
          {card.features[lang].map(f => (
            <span
              key={f}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md"
              style={{ background: `${card.accent}12`, border: `1px solid ${card.accent}20`, color: `${card.accent}cc` }}
            >
              {f}
            </span>
          ))}
        </div>

        {/* Arrow hint */}
        <div className="mt-3 flex items-center gap-1 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: card.accent }}>
          <span>{lang === 'ka' ? 'გამოიყენე' : lang === 'ru' ? 'Открыть' : 'Launch'}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
        </div>
      </div>
    </Link>
  )
})

export function ServicesShowcase() {
  const { language } = useLanguage()
  const lang = (language as Lang) || 'en'
  const c = COPY[lang] || COPY.en

  return (
    <section className="cinematic-section relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(34,211,238,0.03) 0%, transparent 70%)' }} />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] uppercase font-black mb-3" style={{ color: '#22d3ee', textShadow: '0 0 20px rgba(34,211,238,0.3)' }}>
            {c.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.95)' }}>
            {c.title}
          </h2>
          <p className="mt-4 text-sm sm:text-base max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {c.sub}
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {CARDS.map(card => (
            <ServiceCard key={card.slug} card={card} lang={lang} />
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            href={`/${language}/services`}
            className="inline-flex items-center gap-2 text-sm font-semibold px-7 py-3.5 rounded-xl transition-all duration-300 hover:-translate-y-0.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
          >
            {c.cta}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        </div>
      </div>
    </section>
  )
}
