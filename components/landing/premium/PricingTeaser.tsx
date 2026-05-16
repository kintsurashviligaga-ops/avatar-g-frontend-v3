'use client'

import React from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { NeonBadge } from '@/components/ui/NeonBadge'
import { GlowButton } from '@/components/ui/GlowButton'
import { cn } from '@/lib/utils'
import { Check, Zap, Star, Crown } from 'lucide-react'

const COPY = {
  en: {
    section: 'Pricing',
    title: 'Simple, transparent pricing',
    subtitle: 'Start free. Scale as you grow. All prices in Georgian Lari (₾).',
    popular: 'Most Popular',
    georgianPayments: 'Georgian payments supported',
    tbcBog: 'TBC & BOG cards accepted',
    cta: 'See Full Pricing →',
    monthly: '/mo',
    free: 'Free forever',
    plans: [
      {
        id: 'starter',
        icon: Zap,
        name: 'Starter',
        price: '₾0',
        desc: 'For exploring AI tools',
        color: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.08)',
        features: ['200 credits/month', '5 AI images', '3 music tracks', 'Community support'],
      },
      {
        id: 'pro',
        icon: Star,
        name: 'Pro',
        price: '₾9',
        desc: 'For daily creators',
        color: 'rgba(124,58,237,0.06)',
        borderColor: 'rgba(124,58,237,0.3)',
        features: ['500 credits/month', 'Unlimited generations', '50 images + music', 'Email support'],
      },
      {
        id: 'ultimate',
        icon: Crown,
        name: 'Ultimate',
        price: '₾29',
        desc: 'For professionals',
        color: 'rgba(245,158,11,0.06)',
        borderColor: 'rgba(245,158,11,0.35)',
        features: ['2,000 credits/month', 'Unlimited everything', 'Batch ×4 images', 'Priority + Slack'],
        popular: true,
      },
    ],
  },
  ka: {
    section: 'ფასები',
    title: 'მარტივი, გამჭვირვალე ფასები',
    subtitle: 'დაიწყე უფასოდ. გაიზარდე შენთან ერთად. ფასები ქართულ ლარში (₾).',
    popular: 'ყველაზე პოპულარული',
    georgianPayments: 'ქართული გადახდები მხარდაჭერილია',
    tbcBog: 'TBC & BOG ბარათები მიღებულია',
    cta: 'სრული ფასების ნახვა →',
    monthly: '/თვე',
    free: 'სამუდამოდ უფასო',
    plans: [
      {
        id: 'starter',
        icon: Zap,
        name: 'სტარტერი',
        price: '₾0',
        desc: 'AI ინსტრუმენტების გასაცნობად',
        color: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.08)',
        features: ['200 კრედიტი/თვეში', '5 AI სურათი', '3 მუსიკის ტრეკი', 'Community Support'],
      },
      {
        id: 'pro',
        icon: Star,
        name: 'Pro',
        price: '₾9',
        desc: 'ყოველდღიური შემქმნელებისთვის',
        color: 'rgba(124,58,237,0.06)',
        borderColor: 'rgba(124,58,237,0.3)',
        features: ['500 კრედიტი/თვეში', 'შეუზღუდავი გენერაციები', '50 სურათი + მუსიკა', 'Email Support'],
      },
      {
        id: 'ultimate',
        icon: Crown,
        name: 'Ultimate',
        price: '₾29',
        desc: 'პროფესიონალებისთვის',
        color: 'rgba(245,158,11,0.06)',
        borderColor: 'rgba(245,158,11,0.35)',
        features: ['2,000 კრედიტი/თვეში', 'ყველაფერი შეუზღუდავი', 'Batch ×4 სურათი', 'Priority + Slack'],
        popular: true,
      },
    ],
  },
  ru: {
    section: 'Цены',
    title: 'Простые, прозрачные цены',
    subtitle: 'Начни бесплатно. Расти вместе с нами. Цены в грузинских лари (₾).',
    popular: 'Самый популярный',
    georgianPayments: 'Грузинские платежи поддерживаются',
    tbcBog: 'Карты TBC & BOG принимаются',
    cta: 'Полные цены →',
    monthly: '/мес',
    free: 'Бесплатно навсегда',
    plans: [
      {
        id: 'starter',
        icon: Zap,
        name: 'Стартер',
        price: '₾0',
        desc: 'Для знакомства с AI',
        color: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.08)',
        features: ['200 кредитов/месяц', '5 AI изображений', '3 музыкальных трека', 'Поддержка сообщества'],
      },
      {
        id: 'pro',
        icon: Star,
        name: 'Pro',
        price: '₾9',
        desc: 'Для ежедневных создателей',
        color: 'rgba(124,58,237,0.06)',
        borderColor: 'rgba(124,58,237,0.3)',
        features: ['500 кредитов/месяц', 'Неограниченные генерации', '50 изображений + музыка', 'Email поддержка'],
      },
      {
        id: 'ultimate',
        icon: Crown,
        name: 'Ultimate',
        price: '₾29',
        desc: 'Для профессионалов',
        color: 'rgba(245,158,11,0.06)',
        borderColor: 'rgba(245,158,11,0.35)',
        features: ['2,000 кредитов/месяц', 'Всё без ограничений', 'Batch ×4 изображений', 'Priority + Slack'],
        popular: true,
      },
    ],
  },
} as const

export function PricingTeaser() {
  const { language } = useLanguage()
  const c = COPY[language] || COPY.en
  const lh = (p: string) => `/${language}${p}`

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
          <p className="text-base text-white/50 max-w-md mx-auto">{c.subtitle}</p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {c.plans.map((plan) => {
            const isPopular = 'popular' in plan && plan.popular
            const Icon = plan.icon
            return (
              <div
                key={plan.id}
                className="relative flex flex-col gap-5 p-6 rounded-2xl border transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: plan.color,
                  borderColor: plan.borderColor,
                  boxShadow: isPopular
                    ? '0 0 40px rgba(245,158,11,0.12), 0 8px 32px rgba(0,0,0,0.3)'
                    : '0 4px 24px rgba(0,0,0,0.2)',
                }}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white whitespace-nowrap"
                    style={{
                      background: 'linear-gradient(90deg, #d97706, #f59e0b)',
                    }}
                  >
                    {c.popular}
                  </div>
                )}

                {/* Header */}
                <div className={cn('flex items-center gap-3', isPopular && 'pt-2')}>
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-xl"
                    style={{
                      background: isPopular
                        ? 'rgba(245,158,11,0.15)'
                        : plan.id === 'pro'
                        ? 'rgba(124,58,237,0.15)'
                        : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <Icon
                      size={18}
                      style={{
                        color: isPopular ? '#f59e0b' : plan.id === 'pro' ? '#a855f7' : 'rgba(255,255,255,0.5)',
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/90">{plan.name}</p>
                    <p className="text-[11px] text-white/40">{plan.desc}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-4xl font-extrabold"
                    style={{
                      color: isPopular ? '#f59e0b' : plan.id === 'pro' ? '#a855f7' : 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {plan.price}
                  </span>
                  {plan.price !== '₾0' && (
                    <span className="text-white/40 text-sm">{c.monthly}</span>
                  )}
                  {plan.price === '₾0' && (
                    <span className="text-white/30 text-xs">{c.free}</span>
                  )}
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-2.5">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-[13px] text-white/65">
                      <Check
                        size={13}
                        className="mt-0.5 flex-shrink-0"
                        style={{
                          color: isPopular ? '#f59e0b' : plan.id === 'pro' ? '#a855f7' : 'rgba(255,255,255,0.35)',
                        }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={lh(plan.id === 'starter' ? '/signup' : '/pricing')}
                  className={cn(
                    'block w-full text-center text-sm font-semibold py-2.5 px-4 rounded-xl transition-all duration-200',
                    isPopular
                      ? 'text-white hover:shadow-[0_0_24px_rgba(245,158,11,0.4)]'
                      : plan.id === 'pro'
                      ? 'text-white hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]'
                      : 'text-white/70 border border-white/10 hover:bg-white/10 hover:text-white',
                  )}
                  style={
                    isPopular
                      ? { background: 'linear-gradient(135deg, #d97706, #f59e0b)' }
                      : plan.id === 'pro'
                      ? { background: 'linear-gradient(135deg, #6d28d9, #a855f7)' }
                      : { backgroundColor: 'rgba(255,255,255,0.05)' }
                  }
                >
                  {plan.id === 'starter'
                    ? language === 'ka' ? 'დაიწყე უფასოდ' : language === 'ru' ? 'Начать бесплатно' : 'Get started free'
                    : language === 'ka' ? 'დაიწყე' : language === 'ru' ? 'Начать' : 'Get started'}
                </Link>
              </div>
            )
          })}
        </div>

        {/* Trust badges */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' }}
          >
            <span>🇬🇪</span>
            <span className="text-[12px] text-white/55">{c.georgianPayments}</span>
          </div>
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' }}
          >
            <span className="text-[12px] text-white/40">💳</span>
            <span className="text-[12px] text-white/55">{c.tbcBog}</span>
          </div>
        </div>

        {/* See all pricing link */}
        <div className="text-center mt-8">
          <GlowButton href={lh('/pricing')} variant="ghost" size="sm">
            {c.cta}
          </GlowButton>
        </div>
      </div>
    </section>
  )
}
