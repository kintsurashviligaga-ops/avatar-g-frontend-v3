'use client'

import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { PRICING_TIERS } from '@/lib/billing/pricingConfig'
import { useLanguage } from '@/lib/i18n/LanguageContext'

// DAY-6 pricing reconciliation — the visible page renders the SINGLE SOURCE OF TRUTH tiers
// (lib/billing/pricingConfig.ts: Starter 38 / Pro Creator 299 / Studio Annual 899 GEL). Features are
// DERIVED from each tier's creditCeiling so the display can never drift from the grant. CTA routes to
// signup (checkout charges via Stripe Price IDs, unset for now).
//
// A4 — ULTRA-MINIMALIST redesign: flat cards, one hairline border, no gradient icon tiles / glow layers /
// bouncing badges. Mobile-first rhythm + tactile full-width CTAs. The tier NUMBERS and quota strings are
// unchanged (PricingSection.test.tsx pins them).

type Lang = 'en' | 'ka' | 'ru'

const LABELS: Record<Lang, {
  badge: string; month: string; year: string; popular: string; focus: string; cta: string;
  videos: string; music: string; images: string; credits: string;
}> = {
  en: { badge: 'Pricing', month: '/mo', year: '/yr', popular: 'Most Popular', focus: 'Choose the plan that fits your workflow and scale.', cta: 'Get started',
        videos: 'Videos', music: 'Music tracks', images: 'Storyboard images', credits: 'credits included' },
  ka: { badge: 'ფასები', month: '/თვე', year: '/წელ', popular: 'ყველაზე პოპულარული', focus: 'აირჩიე გეგმა, რომელიც შენს სამუშაო პროცესს შეესაბამება.', cta: 'დაწყება',
        videos: 'ვიდეო', music: 'მუსიკის ტრეკი', images: 'სთორიბორდ სურათი', credits: 'კრედიტი შედის' },
  ru: { badge: 'Тарифы', month: '/мес', year: '/год', popular: 'Самый популярный', focus: 'Выберите план под ваш рабочий процесс и масштаб.', cta: 'Начать',
        videos: 'видео', music: 'музыкальных трека', images: 'storyboard-изображений', credits: 'кредитов включено' },
}

export function PricingSection() {
  const { t, language } = useLanguage()
  const locale = (language === 'en' || language === 'ru' ? language : 'ka') as Lang
  const labels = LABELS[locale]

  return (
    <section id="pricing" className="relative py-16 px-4 sm:px-6" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="relative mx-auto max-w-4xl">
        {/* Heading — quiet, no motion decoration */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border mb-5" style={{ borderColor: 'var(--color-border)' }}>
            <Sparkles className="w-3 h-3 text-cyan-300" />
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--color-text-secondary)' }}>{labels.badge}</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-[-0.02em]" style={{ color: 'var(--color-text)' }}>
            {t('pricing.title')}{' '}
            <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              {t('pricing.titleAccent')}
            </span>
          </h2>
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {labels.focus}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PRICING_TIERS.map((tier, index) => {
            const isPopular = tier.id === 'pro_creator'
            const period = tier.billing === 'annual' ? labels.year : labels.month
            const features = [
              `${tier.creditCeiling.videos} ${labels.videos}`,
              `${tier.creditCeiling.music} ${labels.music}`,
              `${tier.creditCeiling.images} ${labels.images}`,
              `${tier.creditsIncluded.toLocaleString()} ${labels.credits}`,
            ]

            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.06 }}
                className="relative flex flex-col rounded-2xl p-5"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  border: isPopular ? '1px solid rgba(34,211,238,0.45)' : '1px solid var(--color-border)',
                }}
              >
                {isPopular && (
                  <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-cyan-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    <Sparkles className="w-2.5 h-2.5" /> {labels.popular}
                  </span>
                )}

                <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{tier.name}</h3>

                <div className="flex items-baseline gap-1 mt-3 mb-5">
                  <span className="text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>{tier.priceGel}₾</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{period}</span>
                </div>

                <ul className="space-y-2.5 mb-6 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-cyan-400" strokeWidth={3} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/${locale}/signup?plan=${tier.id}`}
                  // Apple IAP compliance: paid-plan CTA hidden inside the iOS shell.
                  data-iap-external
                  className="block text-center min-h-[48px] leading-[48px] rounded-xl font-bold text-sm transition-transform duration-150 active:scale-[0.98]"
                  style={isPopular
                    ? { backgroundColor: 'rgb(6,182,212)', color: '#fff' }
                    : { backgroundColor: 'var(--card-hover)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                >
                  {labels.cta}
                </Link>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
