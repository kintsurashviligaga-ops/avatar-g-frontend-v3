'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
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
    <section id="pricing" className="relative py-20 px-4 sm:px-6" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="relative mx-auto max-w-4xl">
        {/* Heading — MONOCHROME (cyan is reserved for the single popular CTA), no eyebrow / gradient. */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-[40px] font-black leading-[1.05] tracking-[-0.03em]" style={{ color: 'var(--color-text)' }}>
            {t('pricing.title')}{' '}
            <span style={{ color: 'var(--color-text)' }}>{t('pricing.titleAccent')}</span>
          </h2>
          <p className="mt-4 text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            {labels.focus}
          </p>
        </div>

        {/* Deep-matte cards on generous dark-canvas buffers — each reads as an isolated premium object. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
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
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex flex-col rounded-[20px] p-7 md:p-8"
                style={{
                  // Deep-matte SOLID charcoal (theme-aware): the popular tier is a hair lifted
                  // (elevated) over the deepest surface. No translucent white veil.
                  backgroundColor: isPopular ? 'var(--color-elevated)' : 'var(--color-surface)',
                  // Razor-thin near-neutral contour (Apple/Stripe). NO cyan — the accent is
                  // reserved to the single popular CTA. Popular gets a hair-stronger neutral edge.
                  border: `1px solid ${isPopular ? 'var(--pricing-contour-pop)' : 'var(--pricing-contour)'}`,
                }}
              >
                {isPopular && (
                  // Neutral ghost hairline badge — whispers, doesn't glow (no cyan).
                  <span
                    className="absolute -top-2.5 left-7 rounded-full px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.16em]"
                    style={{ backgroundColor: 'var(--color-elevated)', border: '1px solid var(--pricing-contour-pop)', color: 'var(--color-text-secondary)' }}
                  >
                    {labels.popular}
                  </span>
                )}

                {/* Tier name as a quiet label; the price is the single dominant element. */}
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-tertiary)' }}>{tier.name}</h3>

                <div className="flex items-baseline gap-1.5 mt-5 mb-8">
                  <span className="text-[40px] font-black leading-none tracking-[-0.03em]" style={{ color: 'var(--color-text)' }}>{tier.priceGel}₾</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{period}</span>
                </div>

                <ul className="space-y-3.5 mb-9 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {/* Desaturated tick — cyan is reserved for the popular tier's price/CTA. */}
                      <Check className="mt-[3px] h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.5} style={{ color: 'var(--color-text-tertiary)' }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/${locale}/signup?plan=${tier.id}`}
                  // Apple IAP compliance: paid-plan CTA hidden inside the iOS shell.
                  data-iap-external
                  className="block text-center min-h-[48px] leading-[48px] rounded-xl font-semibold text-sm transition-all duration-150 active:scale-[0.98]"
                  style={isPopular
                    ? { backgroundColor: 'rgb(6,182,212)', color: '#04121a' } // the ONE cyan accent on the whole panel
                    : { backgroundColor: 'transparent', color: 'var(--color-text)', border: '1px solid var(--pricing-contour)' }}
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
