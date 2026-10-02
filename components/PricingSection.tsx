'use client'

import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { PRICING_TIERS, type PricingTierId } from '@/lib/billing/pricingConfig'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { signInPath } from '@/lib/routing/signIn';

// DAY-6 pricing reconciliation — the visible page renders the SINGLE SOURCE OF TRUTH tiers
// (lib/billing/pricingConfig.ts: Starter 38 / Pro Creator 299 / Studio Annual 899 GEL). Features are
// DERIVED from each tier's creditCeiling so the display can never drift from the grant. CTA routes to
// signup → the credits modal, which checks out with Bank of Georgia in ₾ (the ≈ ₾ line under each price is
// that exact monthly charge — lib/billing/bogCatalog pins it to priceGel).
//
// A4 — ULTRA-MINIMALIST redesign: flat cards, one hairline border, no gradient icon tiles / glow layers /
// bouncing badges. Mobile-first rhythm + tactile full-width CTAs. The tier NUMBERS and quota strings are
// unchanged (PricingSection.test.tsx pins them).

type Lang = 'en' | 'ka' | 'ru'

const LABELS: Record<Lang, {
  badge: string; month: string; year: string; popular: string; focus: string; ctaFree: string; ctaPaid: string;
  videos: string; music: string; images: string; credits: string; perMonth: string;
}> = {
  en: { badge: 'Pricing', month: '/mo', year: '/yr', popular: 'Most Popular', focus: 'Choose the plan that fits your workflow and scale.', ctaFree: 'Start free', ctaPaid: 'Choose',
        videos: 'Videos', music: 'Music tracks', images: 'Storyboard images', credits: 'credits included', perMonth: 'per month' },
  ka: { badge: 'ფასები', month: '/თვე', year: '/წელ', popular: 'ყველაზე პოპულარული', focus: 'აირჩიე გეგმა, რომელიც შენს სამუშაო პროცესსა და მასშტაბს შეესაბამება.', ctaFree: 'უფასოდ დაწყება', ctaPaid: 'არჩევა',
        videos: 'ვიდეო', music: 'მუსიკის ტრეკი', images: 'სთორიბორდ სურათი', credits: 'კრედიტი შედის', perMonth: 'თვეში' },
  ru: { badge: 'Тарифы', month: '/мес', year: '/год', popular: 'Самый популярный', focus: 'Выберите план под ваш рабочий процесс и масштаб.', ctaFree: 'Начать бесплатно', ctaPaid: 'Выбрать',
        videos: 'видео', music: 'музыкальных трека', images: 'storyboard-изображений', credits: 'кредитов включено', perMonth: 'в месяц' },
}

// PHASE 37.1 — localized tier NAMES (pricingConfig keeps the English canonical; the visible name is
// localized here so the Georgian locale reads natively premium: სტარტერი · პრო კრეატორი · სტუდიური წლიური).
const TIER_NAME: Record<PricingTierId, Record<Lang, string>> = {
  free: { en: 'Free', ka: 'უფასო', ru: 'Бесплатно' },
  basic: { en: 'Basic', ka: 'საბაზისო', ru: 'Базовый' },
  pro: { en: 'Pro', ka: 'პრო', ru: 'Про' },
  business: { en: 'Business', ka: 'ბიზნესი', ru: 'Бизнес' },
}
// A one-line premium sub-label per tier (who it's for).
const TIER_TAGLINE: Record<PricingTierId, Record<Lang, string>> = {
  free: { en: 'To try it out', ka: 'გასაცნობად', ru: 'Чтобы попробовать' },
  basic: { en: 'For getting started', ka: 'პირველი ნაბიჯებისთვის', ru: 'Для старта' },
  pro: { en: 'For working creators', ka: 'პროფესიონალი კრეატორებისთვის', ru: 'Для профи' },
  business: { en: 'For studios & teams', ka: 'სტუდიებისა და გუნდებისთვის', ru: 'Для студий и команд' },
}

export function PricingSection() {
  const { t, language } = useLanguage()
  const locale = (language === 'en' || language === 'ru' ? language : 'ka') as Lang
  const labels = LABELS[locale]

  return (
    <section id="pricing" className="relative isolate py-24 px-4 sm:px-6" style={{ borderTop: '1px solid var(--color-border)' }}>
      {/* ⚠️ A CONTAINER, NOT THE VIEWPORT. This page renders inside the studio shell, whose sidebar takes ~220 px:
          at a 1024-px window the old `lg:grid-cols-4` packed four cards into ~800 px — 154 px each — and Georgian /
          Russian words broke mid-syllable („საბაზის/ო", „Бесплат/но"). The grid now reads ITS OWN width (CSS container
          queries via Tailwind's arbitrary at-rule variants): 1 column, then 2×2 from 540 px, 4 across only from
          1040 px, where every card keeps ≥ 245 px. The 2-column rule is a RANGE: two overlapping variants of the same
          property resolve by stylesheet order, not width, and the 2-column one won at every size. */}
      <div className="relative mx-auto max-w-6xl [container-type:inline-size]">
        <div className="text-center mb-16">
          <h2 className="break-words text-3xl font-black leading-[1.05] tracking-[-0.03em] md:text-[40px]" style={{ color: 'var(--color-text)' }}>
            {t('pricing.title')}{' '}
            <span style={{ color: 'var(--color-text)' }}>{t('pricing.titleAccent')}</span>
          </h2>
          <p className="mt-4 text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            {labels.focus}
          </p>
        </div>

        {/* PHASE 37.1 — luxury high-contrast grid. The popular tier is elevated by a rocket-blue crown-glow, a
            blue→frost gradient border-ring, a lift, a badge and the blue CTA (it no longer SCALES: a 1.04× card in a
            four-column row is exactly what pushed its price out of the frame).
            Georgian-first names read as real titles (Mkhedruli is unicase → hierarchy via size/weight, not caps).
            All alpha is inline rgba — Tailwind /8·/12 slash-opacity silently doesn't compile here. */}
        <div className="grid grid-cols-1 items-stretch gap-6 pt-4 [@container(min-width:540px)_and_(max-width:1039.98px)]:grid-cols-2 [@container(min-width:1040px)]:grid-cols-4 [@container(min-width:1040px)]:gap-5">
          {PRICING_TIERS.map((tier, index) => {
            const isPopular = tier.id === 'pro'
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
                // framer-motion OWNS this element's transform (its inline style beats any translate/scale class), so the
                // hover lift and the press live here — as classes they never ran (review, 2026-10-01).
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.99 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
                // ⚠️ min-w-0: a grid item's default min-width is its content, so one long word or a wide price used
                // to WIDEN its column and push text past the card's border (owner report, 2026-10-01). Everything
                // inside wraps or truncates instead; the frame is NOT overflow-hidden only because the „popular"
                // badge deliberately sits on its top edge.
                className={`group relative flex min-w-0 cursor-pointer flex-col rounded-[22px] p-6 [@container(min-width:1180px)]:p-7 ${isPopular
                  ? 'z-10 order-first [@container(min-width:540px)]:order-none'
                  : ''}`}
                style={isPopular
                  ? {
                      border: '1px solid transparent',
                      // Interior fills (padding-box) + the rocket-blue → frost RING (border-box). Brand tokens only:
                      // the true-black + rocket-blue theme lives in app/globals.css (--app-accent / --app-accent-deep).
                      background:
                        'radial-gradient(130% 90% at 50% 0%, rgb(var(--app-accent) / 0.16) 0%, rgb(var(--app-accent) / 0.04) 32%, transparent 62%) padding-box, ' +
                        'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.012) 46%, transparent 100%) padding-box, ' +
                        'linear-gradient(rgb(var(--app-surface)), rgb(var(--app-surface))) padding-box, ' +
                        'linear-gradient(150deg, rgb(var(--app-accent) / 0.95) 0%, rgb(var(--app-accent-deep) / 0.4) 48%, rgba(255,255,255,0.12) 100%) border-box',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgb(var(--app-accent) / 0.12), 0 30px 70px -24px rgb(var(--app-accent-deep) / 0.45), 0 30px 60px -30px rgba(0,0,0,0.9)',
                    }
                  : {
                      backgroundColor: 'rgb(var(--app-surface))',
                      backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 42%, rgba(255,255,255,0) 100%)',
                      border: '1px solid var(--pricing-contour)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 56px -28px rgba(0,0,0,0.8)',
                    }}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 z-20 inline-flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full px-3.5 py-1 text-[11px] font-bold tracking-[0.01em]"
                    style={{ background: 'linear-gradient(180deg, rgb(var(--app-accent)), rgb(var(--app-accent-deep)))', color: 'rgb(var(--app-bg))', boxShadow: '0 6px 16px -4px rgb(var(--app-accent) / 0.55)' }}>
                    <Sparkles className="h-3 w-3 shrink-0" strokeWidth={2.5} /> <span className="truncate">{labels.popular}</span>
                  </span>
                )}

                {/* Localized tier name (a real premium title) + who it's for. Both wrap inside the card — Georgian
                    words are long, and Mkhedruli is unicase, so hierarchy comes from size/weight, not caps. */}
                <h3 className="min-w-0 break-words text-[20px] font-extrabold leading-tight tracking-[-0.01em] [@container(min-width:1180px)]:text-[22px]" style={{ color: 'var(--color-text)' }}>{name}</h3>
                <p className="mt-1 min-w-0 break-words text-[12.5px] font-medium leading-snug" style={{ color: isPopular ? 'rgb(var(--app-accent))' : 'var(--color-text-tertiary)' }}>{tagline}</p>

                {/* Price — the dominant element, sized to FIT the narrowest card the container rules allow (≥ 245 px),
                    a step larger once the row is wide. The period never splits from itself (nowrap) but the row wraps, so
                    on the narrowest card „/თვე" drops under the number instead of spilling out of the frame.
                    The "$N" stays ONE span so textContent reads '$99' (PricingSection.test.tsx pins it). */}
                <div className="mb-6 mt-5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span
                    className={`min-w-0 font-black leading-none tracking-[-0.035em] ${isPopular ? 'text-[46px] [@container(min-width:1180px)]:text-[52px]' : 'text-[42px] [@container(min-width:1180px)]:text-[48px]'}`}
                    style={{ color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', ...(isPopular ? { textShadow: '0 0 28px rgb(var(--app-accent) / 0.3)' } : {}) }}
                  >{`$${tier.priceUsd}`}</span>
                  <span className="whitespace-nowrap text-[13px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{period}</span>
                  {tier.priceGel > 0 && (
                    <span className="basis-full text-[12.5px] font-medium tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>{`≈ ${tier.priceGel} ₾`}</span>
                  )}
                </div>

                <div className="mb-6 h-px w-full" style={{ background: isPopular ? 'linear-gradient(90deg, rgb(var(--app-accent) / 0.45), transparent)' : 'var(--pricing-contour)' }} />

                <ul className="mb-8 min-w-0 flex-1 space-y-3">
                  {features.map((f) => (
                    <li key={f.label} className="flex min-w-0 items-start gap-3 text-[14.5px] leading-relaxed">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ background: isPopular ? 'rgb(var(--app-accent) / 0.2)' : 'rgb(var(--app-accent) / 0.1)', boxShadow: 'inset 0 0 0 1px rgb(var(--app-accent) / 0.28)' }}>
                        <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'rgb(var(--app-accent))' }} />
                      </span>
                      <span className="min-w-0 [overflow-wrap:anywhere]"><span className="font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{f.count}</span>{' '}<span style={{ color: 'var(--color-text-secondary)' }}>{f.label}</span></span>
                    </li>
                  ))}
                </ul>

                {/* ⚠️ EVERY TIER SHOWED THE SAME WORD. A $0 card and a $79.99 card both said "დაწყება", so
                    nothing on any card told you which one takes money. The free tier says it is free and a paid
                    tier names its price on the button itself — the price only, the period is printed right above
                    (the full „არჩევა — $39.99/თვე" wrapped into a two-line, 104-px button on the narrow cards).
                    ⚠️ AND THE WHOLE CARD IS THE TAP TARGET. `after:absolute after:inset-0` stretches this
                    ONE link over the entire card (the card is `relative`), so a finger anywhere on it
                    works — without nesting interactive elements inside each other. One card, one link, one name. */}
                <Link
                  href={signInPath(locale, { mode: 'signup', plan: tier.id })}
                  data-iap-external
                  aria-label={`${name} — ${tier.priceUsd > 0 ? `$${tier.priceUsd}${period}` : labels.ctaFree}`}
                  className={`mt-auto flex min-h-[52px] w-full min-w-0 items-center justify-center rounded-xl px-4 py-3 text-center text-[15px] leading-snug transition-[filter,background-color] duration-200 [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] ${isPopular ? 'font-bold hover:brightness-110' : 'bg-white/[0.025] font-semibold hover:bg-white/[0.06]'}`}
                  style={isPopular
                    ? { background: 'linear-gradient(180deg, rgb(var(--app-accent)) 0%, rgb(var(--app-accent-deep)) 100%)', color: 'rgb(var(--app-bg))', boxShadow: '0 10px 26px -6px rgb(var(--app-accent) / 0.5), 0 1px 0 0 rgba(255,255,255,0.35) inset' }
                    // The resting fill is a CLASS (above), so its hover can win — an inline background never let it.
                    : { color: 'var(--color-text)', border: '1px solid var(--pricing-contour-pop)' }}
                >
                  {tier.priceUsd > 0 ? `${labels.ctaPaid} · $${tier.priceUsd}` : labels.ctaFree}
                </Link>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
