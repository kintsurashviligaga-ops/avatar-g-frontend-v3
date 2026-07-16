'use client'

import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { PRICING_TIERS, type PricingTierId } from '@/lib/billing/pricingConfig'
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
  videos: string; music: string; images: string; credits: string; perMonth: string;
}> = {
  en: { badge: 'Pricing', month: '/mo', year: '/yr', popular: 'Most Popular', focus: 'Choose the plan that fits your workflow and scale.', cta: 'Get started',
        videos: 'Videos', music: 'Music tracks', images: 'Storyboard images', credits: 'credits included', perMonth: 'per month' },
  ka: { badge: 'ფასები', month: '/თვე', year: '/წელ', popular: 'ყველაზე პოპულარული', focus: 'აირჩიე გეგმა, რომელიც შენს სამუშაო პროცესსა და მასშტაბს შეესაბამება.', cta: 'დაწყება',
        videos: 'ვიდეო', music: 'მუსიკის ტრეკი', images: 'სთორიბორდ სურათი', credits: 'კრედიტი შედის', perMonth: 'თვეში' },
  ru: { badge: 'Тарифы', month: '/мес', year: '/год', popular: 'Самый популярный', focus: 'Выберите план под ваш рабочий процесс и масштаб.', cta: 'Начать',
        videos: 'видео', music: 'музыкальных трека', images: 'storyboard-изображений', credits: 'кредитов включено', perMonth: 'в месяц' },
}

// PHASE 37.1 — localized tier NAMES (pricingConfig keeps the English canonical; the visible name is
// localized here so the Georgian locale reads natively premium: სტარტერი · პრო კრეატორი · სტუდიური წლიური).
const TIER_NAME: Record<PricingTierId, Record<Lang, string>> = {
  starter: { en: 'Starter', ka: 'სტარტერი', ru: 'Стартер' },
  pro_creator: { en: 'Pro Creator', ka: 'პრო კრეატორი', ru: 'Про-креатор' },
  studio_annual: { en: 'Studio Annual', ka: 'სტუდიური წლიური', ru: 'Студийный годовой' },
}
// A one-line premium sub-label per tier (who it's for).
const TIER_TAGLINE: Record<PricingTierId, Record<Lang, string>> = {
  starter: { en: 'For getting started', ka: 'პირველი ნაბიჯებისთვის', ru: 'Для старта' },
  pro_creator: { en: 'For working creators', ka: 'პროფესიონალი კრეატორებისთვის', ru: 'Для профи' },
  studio_annual: { en: 'For studios & teams', ka: 'სტუდიებისა და გუნდებისთვის', ru: 'Для студий и команд' },
}

export function PricingSection() {
  const { t, language } = useLanguage()
  const locale = (language === 'en' || language === 'ru' ? language : 'ka') as Lang
  const labels = LABELS[locale]

  return (
    <section id="pricing" className="relative isolate py-24 px-4 sm:px-6" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="relative mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-[40px] font-black leading-[1.05] tracking-[-0.03em]" style={{ color: 'var(--color-text)' }}>
            {t('pricing.title')}{' '}
            <span style={{ color: 'var(--color-text)' }}>{t('pricing.titleAccent')}</span>
          </h2>
          <p className="mt-4 text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            {labels.focus}
          </p>
        </div>

        {/* PHASE 37.1 — luxury high-contrast grid. The popular tier is elevated FIVE ways: a cyan crown-glow +
            a true cyan→frost gradient border-ring + a physical lift/scale + a cyan badge + the cyan price/CTA.
            Georgian-first names read as real titles (Mkhedruli is unicase → hierarchy via size/weight, not caps).
            All alpha is inline rgba — Tailwind /8·/12 slash-opacity silently doesn't compile here. */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-center md:gap-8 pt-4">
          {PRICING_TIERS.map((tier, index) => {
            const isPopular = tier.id === 'pro_creator'
            const period = tier.billing === 'annual' ? labels.year : labels.month
            const name = TIER_NAME[tier.id][locale]
            const tagline = TIER_TAGLINE[tier.id][locale]
            const features: { count: string | number; label: string }[] = [
              { count: tier.creditCeiling.videos, label: labels.videos },
              { count: tier.creditCeiling.music, label: labels.music },
              { count: tier.creditCeiling.images, label: labels.images },
              { count: tier.creditsIncluded.toLocaleString(), label: labels.credits },
            ]

            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className={isPopular
                  ? 'group relative z-10 flex flex-col rounded-[22px] p-8 md:p-10 order-first md:order-none transition-transform duration-300 md:scale-[1.04] md:-translate-y-2'
                  : 'group relative flex flex-col rounded-[22px] p-7 md:p-9 transition-transform duration-300 hover:-translate-y-1'}
                style={isPopular
                  ? {
                      border: '1px solid transparent',
                      // 3 interior fill layers (padding-box) + the cyan→frost RING (border-box).
                      background:
                        'radial-gradient(130% 90% at 50% 0%, rgba(6,182,212,0.16) 0%, rgba(6,182,212,0.04) 32%, transparent 62%) padding-box, ' +
                        'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 46%, transparent 100%) padding-box, ' +
                        'linear-gradient(var(--color-elevated), var(--color-elevated)) padding-box, ' +
                        'linear-gradient(150deg, rgba(34,211,238,0.9) 0%, rgba(6,182,212,0.35) 48%, rgba(255,255,255,0.12) 100%) border-box',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(6,182,212,0.12), 0 30px 70px -24px rgba(6,182,212,0.34), 0 30px 60px -30px rgba(0,0,0,0.9)',
                    }
                  : {
                      backgroundColor: 'var(--color-surface)',
                      backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 42%, rgba(255,255,255,0) 100%)',
                      border: '1px solid var(--pricing-contour)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 56px -28px rgba(0,0,0,0.8)',
                    }}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1 text-[11px] font-bold tracking-[0.01em]"
                    style={{ background: 'linear-gradient(180deg, rgb(34,211,238), rgb(6,182,212))', color: '#04121a', boxShadow: '0 6px 16px -4px rgba(6,182,212,0.55)' }}>
                    <Sparkles className="h-3 w-3" strokeWidth={2.5} /> {labels.popular}
                  </span>
                )}

                {/* Localized tier name (a real premium title, not a tiny uppercase label) + who it's for. */}
                <h3 className="text-[20px] md:text-[22px] font-extrabold tracking-[-0.01em]" style={{ color: 'var(--color-text)' }}>{name}</h3>
                <p className="mt-1 text-[12.5px] font-medium" style={{ color: isPopular ? 'rgb(103,232,249)' : 'var(--color-text-tertiary)' }}>{tagline}</p>

                {/* Price — the dominant element. number-span + ₾-span are ADJACENT (JSX strips the newline
                    whitespace) so textContent stays '299₾', which the pinned test asserts. */}
                <div className="mt-6 mb-7 flex items-baseline gap-1.5">
                  <span
                    className={`font-black leading-none tracking-[-0.035em] ${isPopular ? 'text-[54px] md:text-[62px]' : 'text-[46px] md:text-[54px]'}`}
                    style={{ color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', ...(isPopular ? { textShadow: '0 0 28px rgba(6,182,212,0.30)' } : {}) }}
                  >{tier.priceGel}</span>
                  <span className="text-[22px] md:text-[24px] font-bold leading-none" style={{ color: isPopular ? 'rgb(6,182,212)' : 'var(--color-text-tertiary)' }}>₾</span>
                  <span className="ml-1 self-center text-[13px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{period}</span>
                </div>

                <div className="mb-6 h-px w-full" style={{ background: isPopular ? 'linear-gradient(90deg, rgba(6,182,212,0.4), transparent)' : 'var(--pricing-contour)' }} />

                <ul className="mb-9 flex-1 space-y-3.5">
                  {features.map((f) => (
                    <li key={f.label} className="flex items-start gap-3 text-[15px] leading-relaxed">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ background: isPopular ? 'rgba(6,182,212,0.18)' : 'rgba(6,182,212,0.10)', boxShadow: 'inset 0 0 0 1px rgba(6,182,212,0.25)' }}>
                        <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'rgb(6,182,212)' }} />
                      </span>
                      <span><span className="font-semibold" style={{ color: 'var(--color-text)' }}>{f.count}</span>{' '}<span style={{ color: 'var(--color-text-secondary)' }}>{f.label}</span></span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/${locale}/signup?plan=${tier.id}`}
                  data-iap-external
                  className={`mt-auto block w-full text-center rounded-xl min-h-[52px] leading-[52px] text-[15px] transition-all duration-200 active:scale-[0.98] hover:-translate-y-[1px] ${isPopular ? 'font-bold hover:brightness-110' : 'font-semibold'}`}
                  style={isPopular
                    ? { background: 'linear-gradient(180deg, rgb(34,211,238) 0%, rgb(6,182,212) 100%)', color: '#04121a', boxShadow: '0 10px 26px -6px rgba(6,182,212,0.5), 0 1px 0 0 rgba(255,255,255,0.4) inset' }
                    : { color: 'var(--color-text)', border: '1px solid var(--pricing-contour-pop)', background: 'rgba(255,255,255,0.025)' }}
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
