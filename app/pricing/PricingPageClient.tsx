'use client';

import { motion } from 'framer-motion';
import { Check, Zap, Star, Crown, Building2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PRICING_PLANS, type PricingPlan } from '@/lib/pricing/canonicalPricing';

// ─── Icons per plan ───────────────────────────────────────────────────────────
const PLAN_ICONS = {
  starter: Zap,
  pro: Star,
  ultimate: Crown,
  enterprise: Building2,
};

// ─── Feature comparison table ─────────────────────────────────────────────────
const FEATURE_ROWS = [
  { feature: 'კრედიტი / თვეში', values: ['200', '500', '2,000', '10,000'] },
  { feature: 'გენერაცია / დღეში', values: ['50', 'შეუზღუდავი', 'შეუზღუდავი', 'შეუზღუდავი'] },
  { feature: 'AI სურათი', values: ['5', '50', 'შეუზღუდავი', 'შეუზღუდავი'] },
  { feature: 'AI მუსიკა', values: ['3', 'შეუზღუდავი', 'შეუზღუდავი', 'შეუზღუდავი'] },
  { feature: 'AI ხმა / TTS', values: ['2', '20', 'შეუზღუდავი', 'შეუზღუდავი'] },
  { feature: 'AI ვიდეო', values: ['—', '5', 'შეუზღუდავი', 'შეუზღუდავი'] },
  { feature: 'Batch ×4 სურათი', values: ['—', '—', '✓', '✓'] },
  { feature: 'Agent G Pipeline', values: ['—', '—', '✓', '✓'] },
  { feature: 'Character References', values: ['—', '—', '✓', '✓'] },
  { feature: 'Export Pack (ZIP)', values: ['—', '—', '✓', '✓'] },
  { feature: 'Public Share Links', values: ['—', '✓', '✓', '✓'] },
  { feature: 'API წვდომა', values: ['—', '—', '—', '✓'] },
  { feature: 'White-label', values: ['—', '—', '—', '✓'] },
  { feature: 'Support', values: ['Community', 'Email', 'Priority', 'SLA + Slack'] },
];

// ─── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, index }: { plan: PricingPlan; index: number }) {
  const Icon = PLAN_ICONS[plan.id as keyof typeof PLAN_ICONS] ?? Zap;
  const isFree = plan.price === 0;
  const isPopular = plan.popular;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      style={{
        position: 'relative',
        background: isPopular ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isPopular ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: 20,
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Popular badge */}
      {plan.badge && (
        <div style={{
          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
          padding: '4px 16px',
          background: isPopular
            ? 'linear-gradient(90deg, #d97706, #f59e0b)'
            : 'linear-gradient(90deg, #7c3aed, #a855f7)',
          borderRadius: 20,
          fontSize: 10, fontWeight: 800, color: '#fff',
          letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          {plan.badgeKa ?? plan.badge}
        </div>
      )}

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: `linear-gradient(135deg, ${isPopular ? 'rgba(245,158,11,0.25)' : 'rgba(139,92,246,0.2)'}, transparent)`,
            border: `1px solid ${isPopular ? 'rgba(245,158,11,0.3)' : 'rgba(139,92,246,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon style={{ width: 18, height: 18, color: isPopular ? '#f59e0b' : '#a855f7' }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{plan.nameKa}</div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, margin: 0 }}>
          {plan.descriptionKa}
        </p>
      </div>

      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: isFree ? 26 : 38, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
          {isFree ? 'უფასო' : plan.priceDisplay}
        </span>
        {!isFree && (
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>/თვეში</span>
        )}
      </div>

      {/* Credits highlight */}
      <div style={{
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Zap style={{ width: 13, height: 13, color: '#a855f7', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
          {plan.monthlyCredits.toLocaleString()} კრედიტი / თვეში
        </span>
      </div>

      {/* Features */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        {plan.featuresKa.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
            <Check style={{ width: 14, height: 14, color: isPopular ? '#f59e0b' : '#a855f7', flexShrink: 0, marginTop: 1 }} />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link
        href={isFree ? '/signup' : `/signup?plan=${plan.id}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '13px 20px',
          background: isPopular
            ? 'linear-gradient(135deg, #d97706, #f59e0b)'
            : isFree
            ? 'rgba(255,255,255,0.07)'
            : 'linear-gradient(135deg, #6d28d9, #a855f7)',
          border: isFree ? '1px solid rgba(255,255,255,0.12)' : 'none',
          borderRadius: 12,
          color: '#fff',
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 700,
          transition: 'opacity 0.15s',
        }}
      >
        {plan.ctaKa}
        {!isFree && <ArrowRight style={{ width: 15, height: 15 }} />}
      </Link>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PricingPageClient() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0e',
      color: '#f0f0f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Ambient */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139,92,246,0.18) 0%, transparent 60%)',
      }} />

      {/* Nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
        background: 'rgba(10,10,14,0.8)',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 900, color: '#fff',
          }}>G</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Avatar G</span>
        </Link>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/login" style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            შესვლა
          </Link>
          <Link href="/signup" style={{ padding: '7px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #6d28d9, #a855f7)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
            დარეგისტრირება
          </Link>
        </div>
      </header>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '60px 20px 80px' }}>

        {/* Hero text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', marginBottom: 56 }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 16px',
            background: 'rgba(168,85,247,0.12)',
            border: '1px solid rgba(168,85,247,0.3)',
            borderRadius: 20,
            fontSize: 11, fontWeight: 700, color: '#c084fc',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 20,
          }}>
            <Zap style={{ width: 11, height: 11 }} />
            ფასები
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, color: '#fff', margin: '0 0 16px', lineHeight: 1.15 }}>
            გეგმა{' '}
            <span style={{ background: 'linear-gradient(135deg, #a855f7, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              შენი შესაძლებლობების
            </span>
            {' '}მიხედვით
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
            დაიწყე უფასოდ. გადადი Pro-ზე, როდესაც გჭირდება. გეგმა ნებისმიერ დროს შეგიძლია შეცვალო.
          </p>
        </motion.div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 64 }}>
          {PRICING_PLANS.map((plan, i) => (
            <PlanCard key={plan.id} plan={plan} index={i} />
          ))}
        </div>

        {/* Feature comparison table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          style={{ marginBottom: 60 }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 28 }}>
            სრული შედარება
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    ფუნქცია
                  </th>
                  {PRICING_PLANS.map(p => (
                    <th key={p.id} style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: p.popular ? '#f59e0b' : 'rgba(255,255,255,0.7)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {p.nameKa}
                      {p.price > 0 && <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{p.priceDisplay}/თვეში</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'rgba(255,255,255,0.65)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {row.feature}
                    </td>
                    {row.values.map((val, j) => (
                      <td key={j} style={{ padding: '11px 16px', textAlign: 'center', fontSize: 12, fontWeight: val === '✓' ? 700 : 500, color: val === '—' ? 'rgba(255,255,255,0.2)' : val === '✓' ? '#a855f7' : 'rgba(255,255,255,0.75)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* FAQ / Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          style={{
            background: 'rgba(168,85,247,0.07)',
            border: '1px solid rgba(168,85,247,0.2)',
            borderRadius: 16,
            padding: '24px 28px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.7 }}>
            💳 <strong style={{ color: '#fff' }}>ყველა გეგმა ლარში (₾)</strong> — ქართული ბარათებით გადახდა.
            გეგმა ნებისმიერ დროს შეგიძლია გააუქმო ან შეცვალო.
            კრედიტები ყოველ 30 დღეში განახლდება.{' '}
            <br />
            კითხვები? <a href="mailto:support@myavatar.ge" style={{ color: '#a855f7', textDecoration: 'none', fontWeight: 600 }}>support@myavatar.ge</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
