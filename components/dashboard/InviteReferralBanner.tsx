'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface Props {
  credits: number;
  referralCode?: string | null;
}

/**
 * Shows a referral invite banner when user has low credits (< 300).
 * Prompts them to invite friends to earn 50 credits each.
 */
export default function InviteReferralBanner({ credits, referralCode }: Props) {
  const [dismissed, setDismissed] = useState(false);

  // Only show when credits are low
  if (dismissed || credits >= 300) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="invite-banner"
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          margin: '0 0 12px',
          padding: '12px 16px',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(34,211,238,0.08))',
          border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* Icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, #7c3aed, #22d3ee)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>
          🎁
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#e0e0ff', lineHeight: 1.3 }}>
            კრედიტები მთავრდება! მოიწვიე მეგობარი → +50⚡
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            {referralCode
              ? `შენი კოდი: ${referralCode} · თითო მეგობარზე 50 კრედიტი`
              : 'მიიღე 50 კრედიტი თითო მოწვეულ მეგობარზე'}
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/pricing"
          style={{
            flexShrink: 0,
            padding: '6px 12px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(34,211,238,0.15))',
            border: '1px solid rgba(139,92,246,0.35)',
            color: '#c084fc',
            fontSize: 11.5,
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          მოიწვიე →
        </Link>

        {/* Dismiss — 36×36 touch target */}
        <button
          onClick={() => setDismissed(true)}
          style={{
            flexShrink: 0, width: 36, height: 36,
            borderRadius: 8,
            border: '1px solid rgba(139,92,246,0.2)',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
