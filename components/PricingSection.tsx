'use client'

import { motion } from 'framer-motion'
import { Check, Sparkles, Crown, Zap, Building } from 'lucide-react'
import Link from 'next/link'
import { PRICING_PLANS } from '@/lib/pricing/canonicalPricing'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const PLAN_ACCENTS = [
  { gradient: 'from-gray-400 to-slate-500', glow: 'rgba(148,163,184,0.15)', icon: Zap },
  { gradient: 'from-cyan-400 to-blue-500', glow: 'rgba(6,182,212,0.25)', icon: Sparkles },
  { gradient: 'from-purple-400 to-indigo-500', glow: 'rgba(139,92,246,0.25)', icon: Crown },
  { gradient: 'from-amber-400 to-orange-500', glow: 'rgba(245,158,11,0.25)', icon: Building },
]

const PRICING_LABELS = {
  en: { badge: 'Pricing', month: '/mo', focus: 'Choose the plan that fits your workflow and scale.', popular: 'Most Popular' },
  ka: { badge: 'ფასები', month: '/თვე', focus: 'აირჩიე გეგმა, რომელიც შენს workflow-ს შეესაბამება.', popular: 'ყველაზე პოპულარული' },
  ru: { badge: 'Тарифы', month: '/мес', focus: 'Выберите план, который подходит вашему workflow и масштабу.', popular: 'Самый популярный' },
} as const

export function PricingSection() {
  const { t, language: locale } = useLanguage()
  const labels = PRICING_LABELS[locale as keyof typeof PRICING_LABELS] || PRICING_LABELS.ka

  return (
    <section id="pricing" className="relative py-28 px-4 sm:px-6 overflow-hidden" style={{ borderTop: '1px solid var(--color-border)' }}>
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-gradient-to-b from-cyan-500/[0.03] to-transparent rounded-full blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          className="text-center mb-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/[0.08] mb-6 shadow-[0_0_16px_rgba(34,211,238,0.12)] backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span className="text-[10px] font-bold text-cyan-200 tracking-[0.12em] uppercase">{labels.badge}</span>
          </div>
          <h2 className="text-3xl md:text-5xl lg:text-[3.5rem] font-black mb-5 tracking-[-0.02em]" style={{ color: 'var(--color-text)' }}>
            {t('pricing.title')}{' '}
            <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              {t('pricing.titleAccent')}
            </span>
          </h2>
          <p className="max-w-xl mx-auto text-base md:text-lg leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {t('pricing.subtitle')}
          </p>
          <p className="mt-5 text-cyan-100/85 text-sm md:text-base font-medium">
            {labels.focus}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PRICING_PLANS.map((plan, index) => {
            const accentRaw = PLAN_ACCENTS[index] ?? PLAN_ACCENTS[0]
            if (!accentRaw) return null
            const accent = accentRaw
            const AccentIcon = accent.icon
            const isPopular = !!plan.popular || /pro/i.test(plan.name)

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative"
              >
                {/* Glow border on hover */}
                <div
                  className={`absolute -inset-[1px] rounded-2xl transition-opacity duration-500 ${
                    isPopular ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${accent.glow}, transparent 60%, ${accent.glow})`,
                  }}
                />

                <div
                  className={`relative flex flex-col h-full rounded-2xl border p-7 backdrop-blur-xl transition-all duration-500 ${
                    isPopular
                      ? 'border-cyan-400/35 shadow-[0_0_60px_rgba(6,182,212,0.16)]'
                      : 'hover:border-opacity-20'
                  }`}
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    border: isPopular ? undefined : '1px solid var(--color-border)',
                  }}
                >
                  {isPopular && (
                    <motion.div
                      className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold rounded-full flex items-center gap-1.5 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Sparkles className="w-3 h-3" /> {labels.popular}
                    </motion.div>
                  )}

                  <div className={`inline-flex w-10 h-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent.gradient} mb-4`}>
                    <AccentIcon className="w-5 h-5 text-white" />
                  </div>

                  <h3 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{plan.name}</h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{plan.description}</p>

                  <div className="flex items-baseline gap-1.5 mt-5 mb-6">
                    <span className={`text-4xl font-extrabold bg-gradient-to-br ${accent.gradient} bg-clip-text text-transparent`}>
                      ${plan.price}
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{labels.month}</span>
                  </div>

                  <div className="h-px mb-6" style={{ background: 'linear-gradient(to right, transparent, var(--color-border), transparent)' }} />

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-gradient-to-br ${accent.gradient} flex items-center justify-center`}>
                          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={
                      plan.price === 0
                        ? `/${locale}/signup`
                        : `/${locale}/signup?plan=${plan.name.toLowerCase()}`
                    }
                    className={`block text-center py-3.5 rounded-xl font-bold text-sm transition-all duration-300 ${
                      isPopular
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-[0_0_40px_rgba(6,182,212,0.3)] hover:brightness-110'
                        : 'hover:opacity-80'
                    }`}
                    style={isPopular ? undefined : {
                      backgroundColor: 'var(--card-hover)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
