'use client'

import { motion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { PRICING_PLANS } from '@/lib/pricing/canonicalPricing'
import { useLanguage } from '@/lib/i18n/LanguageContext'

/**
 * PricingSection — Renders the 4-plan pricing grid.
 * Uses canonical pricing data from lib/pricing/canonicalPricing.ts.
 * Plans: Free/$0, Pro/$39, Business/$150, Enterprise/$500.
 */
export function PricingSection() {
  const { t } = useLanguage()

  return (
    <section id="pricing" className="relative py-20 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            {t('pricing.title')} <span className="text-cyan-400">{t('pricing.titleAccent')}</span>
          </h2>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            {t('pricing.subtitle')}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PRICING_PLANS.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className={`relative flex flex-col rounded-2xl border p-6 backdrop-blur-lg ${
                plan.popular
                  ? 'bg-gradient-to-b from-cyan-500/20 to-blue-500/20 border-cyan-400/60 ring-2 ring-cyan-400/30'
                  : 'bg-white/5 border-white/15'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-medium rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> {t('pricing.popular')}
                </div>
              )}
              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
              <div className="flex items-baseline gap-1 mt-4 mb-6">
                <span className="text-4xl font-extrabold text-cyan-300">
                  ${plan.price}
                </span>
                <span className="text-gray-400 text-sm">/mo</span>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-gray-300"
                  >
                    <Check className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={
                  plan.price === 0
                    ? '/signup'
                    : `/signup?plan=${plan.name.toLowerCase()}`
                }
                className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  plan.popular
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-black'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
