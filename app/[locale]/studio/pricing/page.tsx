'use client';

/**
 * /studio/pricing
 *
 * AI Studio plan selector — three tiers scoped to the credit system.
 * Distinct from the main /pricing page (full SaaS plans with Stripe).
 *
 * Plans (V14 spec):
 *   Free   → 20  credits  — $0 / ₾0
 *   Pro    → 500 credits  — $9/mo / ₾24/mo
 *   Ultra  → 2000 credits — $29/mo / ₾79/mo
 *
 * Features:
 *   • USD / GEL currency toggle (1 USD ≈ 2.73 ₾)
 *   • Animated card hover states
 *   • Per-plan feature list with check marks
 *   • Cost-per-generation breakdown
 *   • Live credit balance from store
 *   • CTA wired to /signup or /studio
 *   • Future-ready: TBC / Bank of Georgia / TON payment badges
 */

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  Zap,
  Sparkles,
  Crown,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { CreditBadge } from '@/components/ui/CreditBadge';

// ─── Constants ────────────────────────────────────────────────────────────────

/** GEL per 1 USD — approximate mid-market rate */
const USD_TO_GEL = 2.73;

function toGEL(usd: number): string {
  return (usd * USD_TO_GEL).toFixed(0);
}

// ─── Plan definitions ─────────────────────────────────────────────────────────

type Currency = 'USD' | 'GEL';

interface Plan {
  id:          'free' | 'pro' | 'ultra';
  name:        string;
  tagline:     string;
  priceUsd:    number;
  credits:     number;
  popular:     boolean;
  icon:        React.ReactNode;
  gradient:    string;
  glowColor:   string;
  features:    string[];
  cta:         string;
  ctaHref:     string;
  badge?:      string;
}

const PLANS: Plan[] = [
  {
    id        : 'free',
    name      : 'Free',
    tagline   : 'Try every generator for free.',
    priceUsd  : 0,
    credits   : 20,
    popular   : false,
    icon      : <Zap size={20} />,
    gradient  : 'from-slate-400 to-slate-600',
    glowColor : 'rgba(148,163,184,0.12)',
    features  : [
      '20 credits — no expiry',
      'Avatar generator (2 runs)',
      'Image prompts (4 runs)',
      'Copy / SEO (6 runs)',
      'Generation history (last 20)',
      'Community support',
    ],
    cta     : 'Start for free',
    ctaHref : '/signup',
  },
  {
    id        : 'pro',
    name      : 'Pro',
    tagline   : 'For creators with regular output.',
    priceUsd  : 9,
    credits   : 500,
    popular   : true,
    badge     : 'Most Popular',
    icon      : <Sparkles size={20} />,
    gradient  : 'from-cyan-400 to-blue-600',
    glowColor : 'rgba(34,211,238,0.18)',
    features  : [
      '500 credits / month',
      'All 5 AI generators',
      '50 avatar · 100 image · 33 video runs',
      'Priority AI processing',
      'Full history (last 20 per session)',
      'Email support',
      'Early access to new agents',
    ],
    cta     : 'Upgrade to Pro',
    ctaHref : '/signup?plan=pro',
  },
  {
    id        : 'ultra',
    name      : 'Ultra',
    tagline   : 'For power users and small teams.',
    priceUsd  : 29,
    credits   : 2000,
    popular   : false,
    badge     : 'Best value',
    icon      : <Crown size={20} />,
    gradient  : 'from-violet-500 to-pink-600',
    glowColor : 'rgba(56,189,248,0.18)',
    features  : [
      '2,000 credits / month',
      'All 5 AI generators',
      '200 avatar · 400 image · 133 video runs',
      'Highest priority queue',
      'API access (coming soon)',
      'Priority support + Slack',
      'Custom system prompts (coming soon)',
      'Team seat add-ons available',
    ],
    cta     : 'Go Ultra',
    ctaHref : '/signup?plan=ultra',
  },
];

// ─── Cost breakdown helper ────────────────────────────────────────────────────

const COST_ROWS: { label: string; credits: number }[] = [
  { label: 'Avatar generation',  credits: 10 },
  { label: 'Image prompt',       credits:  5 },
  { label: 'Video script',       credits: 15 },
  { label: 'Music composition',  credits:  8 },
  { label: 'Copy / SEO',         credits:  3 },
];

function CostBreakdown({ currency: _currency }: { currency: Currency }) {
  return (
    <div className="rounded-2xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.80))] backdrop-blur-xl p-6 space-y-4">
      <p className="text-sm font-semibold text-white/60 flex items-center gap-2">
        <Zap className="h-4 w-4 text-cyan-400/70" />
        Credit cost per generation
      </p>
      <div className="divide-y divide-white/[0.06]">
        {COST_ROWS.map((row) => (
          <div key={row.label} className="flex items-center justify-between py-2.5">
            <span className="text-sm text-white/60">{row.label}</span>
            <span className="text-sm font-semibold text-white/80">
              {row.credits} credits
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Payment badges ───────────────────────────────────────────────────────────

function PaymentBadges() {
  const badges = ['Visa', 'Mastercard', 'TBC Pay', 'Bank of Georgia', 'TON'];
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {badges.map((b) => (
        <span
          key={b}
          className="rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/35"
        >
          {b}
        </span>
      ))}
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  currency,
  index,
}: {
  plan: Plan;
  currency: Currency;
  index: number;
}) {
  const price =
    plan.priceUsd === 0
      ? currency === 'GEL' ? '₾0' : '$0'
      : currency === 'GEL'
        ? `₾${toGEL(plan.priceUsd)}`
        : `$${plan.priceUsd}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1 }}
      className="relative group"
    >
      {/* Popular glow ring */}
      {plan.popular && (
        <div
          className="absolute -inset-[1px] rounded-2xl opacity-60"
          style={{
            background: `linear-gradient(135deg, rgba(34,211,238,0.4), rgba(59,130,246,0.4))`,
            filter: 'blur(1px)',
          }}
        />
      )}

      <div
        className={cn(
          'relative flex flex-col rounded-2xl border backdrop-blur-xl overflow-hidden transition-all duration-300',
          'bg-[linear-gradient(155deg,rgba(12,22,46,0.92),rgba(7,14,32,0.85))]',
          plan.popular
            ? 'border-cyan-400/25 shadow-[0_0_40px_rgba(34,211,238,0.12),0_16px_48px_rgba(0,0,0,0.50)]'
            : 'border-white/[0.10] shadow-[0_8px_32px_rgba(0,0,0,0.40)] hover:border-white/[0.18]'
        )}
        style={plan.popular ? { boxShadow: `0 0 60px ${plan.glowColor}` } : {}}
      >
        {/* Top accent */}
        <div className={`h-px w-full bg-gradient-to-r ${plan.gradient} opacity-60`} />

        <div className="flex flex-col flex-1 p-7 space-y-6">
          {/* Header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white',
                  plan.gradient
                )}
              >
                {plan.icon}
              </div>
              {plan.badge && (
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.07em]',
                    plan.popular
                      ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                      : 'border-violet-400/30 bg-violet-400/10 text-violet-200'
                  )}
                >
                  {plan.badge}
                </span>
              )}
            </div>

            <div>
              <h2 className="text-xl font-bold text-white">{plan.name}</h2>
              <p className="mt-0.5 text-sm text-white/45">{plan.tagline}</p>
            </div>

            {/* Price */}
            <div className="flex items-end gap-1.5">
              <span className="text-4xl font-black tracking-tight text-white">
                {price}
              </span>
              {plan.priceUsd > 0 && (
                <span className="mb-1.5 text-sm text-white/40">/month</span>
              )}
            </div>

            {/* Credits */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/[0.08] px-3 py-1">
              <Zap className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs font-semibold text-cyan-200">
                {plan.credits.toLocaleString()} credits
                {plan.priceUsd > 0 ? ' / month' : ' total'}
              </span>
            </div>
          </div>

          {/* Features */}
          <ul className="flex-1 space-y-2.5">
            {plan.features.map((feat) => (
              <li key={feat} className="flex items-start gap-2.5 text-sm">
                <Check
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    plan.popular ? 'text-cyan-400' : 'text-white/40'
                  )}
                />
                <span className="text-white/65 leading-snug">{feat}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Link
            href={plan.ctaHref}
            className={cn(
              'inline-flex w-full items-center justify-center rounded-xl text-base font-semibold tracking-[0.01em] transition-all duration-300 h-11 px-6 gap-2',
              plan.popular
                ? 'bg-gradient-to-r from-cyan-400 via-blue-500 to-sky-500 text-white shadow-[0_0_20px_rgba(34,211,238,0.25)] hover:brightness-110 active:scale-[0.985]'
                : 'border border-white/[0.18] bg-transparent text-white/75 hover:bg-white/[0.06] hover:border-white/[0.30] hover:text-white active:scale-[0.985]'
            )}
          >
            {plan.cta}
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPricingPage() {
  const [currency, setCurrency] = useState<Currency>('USD');

  return (
    <div className="min-h-screen bg-transparent text-white">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[linear-gradient(180deg,rgba(3,7,16,0.96),rgba(3,7,16,0.88))] backdrop-blur-2xl border-b border-white/[0.07]">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/studio"
                className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors px-2.5 py-1.5 rounded-xl hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] text-sm"
              >
                <ArrowLeft size={15} />
                <span className="hidden sm:inline">Studio</span>
              </Link>
              <div className="w-px h-5 bg-white/[0.12]" />
              <h1 className="text-sm font-bold text-white">Studio Pricing</h1>
            </div>
            <CreditBadge compact />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-14 space-y-14">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-1.5">
            <Rocket className="h-3.5 w-3.5 text-cyan-300" />
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-cyan-200">
              AI Studio Credits
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight">
            Simple, transparent{' '}
            <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              pricing
            </span>
          </h1>
          <p className="max-w-xl mx-auto text-white/50 text-sm sm:text-base leading-relaxed">
            Pay once per month. Use credits across all AI generators at any time.
            No hidden fees. No per-call billing surprises.
          </p>

          {/* Currency toggle */}
          <div className="inline-flex rounded-xl border border-white/[0.10] bg-white/[0.04] p-1 gap-1">
            {(['USD', 'GEL'] as Currency[]).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  'rounded-lg px-5 py-1.5 text-sm font-semibold transition-all duration-200',
                  currency === c
                    ? 'bg-cyan-400/15 text-cyan-200 border border-cyan-400/25 shadow-[0_0_10px_rgba(34,211,238,0.10)]'
                    : 'text-white/40 hover:text-white/70'
                )}
              >
                {c === 'USD' ? '$ USD' : '₾ GEL'}
              </button>
            ))}
          </div>

          {currency === 'GEL' && (
            <p className="text-[11px] text-white/25">
              Rate: 1 USD ≈ {USD_TO_GEL} ₾ — indicative only
            </p>
          )}
        </motion.div>

        {/* Plan cards */}
        <div className="grid gap-5 sm:grid-cols-3">
          {PLANS.map((plan, i) => (
            <PlanCard key={plan.id} plan={plan} currency={currency} index={i} />
          ))}
        </div>

        {/* Cost breakdown */}
        <div className="grid gap-6 md:grid-cols-2 items-start">
          <CostBreakdown currency={currency} />

          {/* FAQ-style notes */}
          <div className="rounded-2xl border border-white/[0.10] bg-[linear-gradient(155deg,rgba(12,22,46,0.88),rgba(7,14,32,0.80))] backdrop-blur-xl p-6 space-y-4">
            <p className="text-sm font-semibold text-white/60">Good to know</p>
            <ul className="space-y-3 text-sm text-white/50 leading-relaxed">
              <li className="flex gap-2.5">
                <span className="shrink-0 text-cyan-400">•</span>
                Credits are consumed at generation time. Unused credits roll over — they never expire.
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 text-cyan-400">•</span>
                Monthly plans renew automatically. Cancel any time — no lock-in.
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 text-cyan-400">•</span>
                GEL payments via TBC Pay and Bank of Georgia coming soon. TON crypto planned.
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 text-cyan-400">•</span>
                All generations powered by Claude 3.5 Sonnet — the same model regardless of plan.
              </li>
            </ul>
          </div>
        </div>

        {/* Payment methods */}
        <div className="space-y-3 text-center">
          <p className="text-xs text-white/25 uppercase tracking-wider">Accepted payments</p>
          <PaymentBadges />
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.3 }}
          className="text-center space-y-4 py-4"
        >
          <p className="text-white/40 text-sm">
            Already have credits?{' '}
            <Link href="/studio" className="text-cyan-400/80 hover:text-cyan-300 transition-colors">
              Go to Studio →
            </Link>
          </p>
        </motion.div>

      </main>
    </div>
  );
}
