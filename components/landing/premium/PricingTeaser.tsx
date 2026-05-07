'use client'

import React from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { NeonBadge } from '@/components/ui/NeonBadge'
import { GlowButton } from '@/components/ui/GlowButton'
import { cn } from '@/lib/utils'

const COPY = {
  en: {
    section: 'Pricing',
    title: 'Simple, transparent pricing',
    subtitle: 'Start free. Scale as you grow.',
    popular: 'Most Popular',
    georgianPayments: 'Georgian payments supported',
    tbcBog: 'TBC & BOG cards accepted',
    cta: 'See Full Pricing',
    monthly: '/mo',
    plans: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        desc: 'Perfect for exploring AI tools',
        features: ['5 AI generations/day', 'Avatar Builder access', '3 languages', 'Community support'],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 29,
        desc: 'For creators and professionals',
        features: [
          'Unlimited generations',
          'All 14 AI services',
          'Priority processing',
          'HD exports',
          '24/7 support',
        ],
      },
      {
        id: 'business',
        name: 'Business',
        price: 99,
        desc: 'For teams and businesses',
        features: [
          'Everything in Pro',
          'Team workspace',
          'API access',
          'Custom branding',
          'Dedicated manager',
        ],
      },
    ],
  },
  ka: {
    section: 'ფასები',
    title: 'მარტივი, გამჭვირვალე ფასები',
    subtitle: 'დაიწყე უფასოდ. გაიზარდე შენთან ერთად.',
    popular: 'ყველაზე პოპულარული',
    georgianPayments: 'ქართული გადახდები მხარდაჭერილია',
    tbcBog: 'TBC & BOG ბარათები მიღებულია',
    cta: 'სრული ფასების ნახვა',
    monthly: '/თვე',
    plans: [
      {
        id: 'free',
        name: 'უფასო',
        price: 0,
        desc: 'AI ინსტრუმენტების გასაცნობად',
        features: ['5 გენერაცია/დღეში', 'ავატარ ბილდერი', '3 ენა', 'საზოგადოების მხარდაჭერა'],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 29,
        desc: 'შემქმნელებისა და პროფესიონალებისთვის',
        features: [
          'Unlimited გენერაცია',
          '14 AI სერვისი',
          'პრიორიტეტული დამუშავება',
          'HD ექსპორტი',
          '24/7 მხარდაჭერა',
        ],
      },
      {
        id: 'business',
        name: 'ბიზნესი',
        price: 99,
        desc: 'გუნდებისა და ბიზნესებისთვის',
        features: [
          'Pro-ს ყველაფერი',
          'გუნდური სამუშაო სივრცე',
          'API წვდომა',
          'კორპორატიული ბრენდი',
          'პირადი მენეჯერი',
        ],
      },
    ],
  },
  ru: {
    section: 'Цены',
    title: 'Простые, прозрачные цены',
    subtitle: 'Начни бесплатно. Расти вместе с нами.',
    popular: 'Самый популярный',
    georgianPayments: 'Грузинские платежи поддерживаются',
    tbcBog: 'Карты TBC & BOG принимаются',
    cta: 'Полные цены',
    monthly: '/мес',
    plans: [
      {
        id: 'free',
        name: 'Бесплатно',
        price: 0,
        desc: 'Для знакомства с AI',
        features: ['5 генераций/день', 'Конструктор аватаров', '3 языка', 'Поддержка сообщества'],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 29,
        desc: 'Для создателей и профессионалов',
        features: [
          'Неограниченные генерации',
          'Все 14 AI сервисов',
          'Приоритетная обработка',
          'HD экспорт',
          'Поддержка 24/7',
        ],
      },
      {
        id: 'business',
        name: 'Бизнес',
        price: 99,
        desc: 'Для команд и бизнеса',
        features: [
          'Всё из Pro',
          'Командное пространство',
          'Доступ к API',
          'Корпоративный брендинг',
          'Персональный менеджер',
        ],
      },
    ],
  },
} as const

export function PricingTeaser() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => `/${language}${p}`
  const scrollTo = (anchor: string) => {
    const el = document.querySelector(anchor)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(124,58,237,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <NeonBadge color="violet" className="mb-4">
            {c.section}
          </NeonBadge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white/95 mb-4">
            {c.title}
          </h2>
          <p className="text-base text-white/50">{c.subtitle}</p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {c.plans.map((plan, i) => {
            const isPro = plan.id === 'pro'
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative flex flex-col gap-5 p-6 rounded-2xl border transition-all duration-300',
                  isPro
                    ? 'border-transparent bg-[rgba(124,58,237,0.08)]'
                    : 'border-white/8 bg-[rgba(255,255,255,0.02)]',
                )}
              >
                {/* Pro animated gradient border */}
                {isPro && (
                  <div
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{
                      padding: '1px',
                      background: 'linear-gradient(135deg, rgba(0,212,255,0.6), rgba(124,58,237,0.6), rgba(0,212,255,0.6))',
                      backgroundSize: '200% 200%',
                      animation: 'gradient-shift 3s ease infinite',
                      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                      WebkitMaskComposite: 'xor',
                      maskComposite: 'exclude',
                    }}
                  />
                )}

                {/* Popular badge */}
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <NeonBadge color="violet" pulse>
                      {c.popular}
                    </NeonBadge>
                  </div>
                )}

                {/* Plan name */}
                <div className={cn('pt-1', isPro && 'pt-3')}>
                  <p className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-1">
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1">
                    <span
                      className={cn(
                        'text-4xl font-extrabold',
                        isPro ? 'text-white' : 'text-white/80',
                      )}
                    >
                      {plan.price === 0 ? 'Free' : `$${plan.price}`}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-white/40 text-sm mb-1.5">{c.monthly}</span>
                    )}
                  </div>
                  <p className="text-[13px] text-white/45 mt-1">{plan.desc}</p>
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-2">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-[13px] text-white/65">
                      <span
                        className="mt-0.5 flex-shrink-0 text-[10px]"
                        style={{ color: isPro ? '#00d4ff' : 'rgba(255,255,255,0.4)' }}
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={lh('/signup')}
                  className={cn(
                    'block w-full text-center text-sm font-semibold py-2.5 px-4 rounded-xl transition-all duration-200',
                    isPro
                      ? 'bg-gradient-to-r from-cyan-500 to-violet-600 text-white hover:shadow-[0_0_20px_rgba(0,212,255,0.3)]'
                      : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {plan.price === 0 ? (language === 'ka' ? 'დაიწყე უფასოდ' : language === 'ru' ? 'Начать бесплатно' : 'Get started free') : (language === 'ka' ? 'დაიწყე' : language === 'ru' ? 'Начать' : 'Get started')}
                </Link>
              </div>
            )
          })}
        </div>

        {/* Georgian payments badge */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/3">
            <span>🇬🇪</span>
            <span className="text-[12px] text-white/60">{c.georgianPayments}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/3">
            <span className="text-[12px] text-white/40">💳</span>
            <span className="text-[12px] text-white/60">{c.tbcBog}</span>
          </div>
        </div>

        {/* See all pricing link */}
        <div className="text-center mt-8">
          <GlowButton href={lh('/signup')} variant="ghost" size="sm">
            {c.cta} →
          </GlowButton>
        </div>
      </div>
    </section>
  )
}
