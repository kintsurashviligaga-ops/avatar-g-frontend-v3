'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { RateLimitStatus } from '@/hooks/useRateLimit';

interface RateLimitBannerProps {
  status: RateLimitStatus;
  /** hide the banner (e.g., user dismissed it) */
  onDismiss?: () => void;
}

/**
 * Elegant rate-limit notification bar for Starter plan users.
 * Shows: warning when ≥80% used, error when at limit.
 * Paid/unlimited plans → renders nothing.
 */
export default function RateLimitBanner({ status, onDismiss }: RateLimitBannerProps) {
  const { unlimited, isAtLimit, isNearLimit, count, limit, remaining } = status;

  // Don't show for unlimited plans or when well under limit
  const visible = !unlimited && (isAtLimit || isNearLimit);

  if (!visible) return null;

  const percentage = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;

  const isError = isAtLimit;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="rate-limit-banner"
          initial={{ opacity: 0, y: -12, scaleY: 0.9 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{
            margin: '8px 12px',
            borderRadius: 12,
            overflow: 'hidden',
            background: isError
              ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.08))'
              : 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(234,88,12,0.08))',
            border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Progress bar at top */}
          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{
                height: '100%',
                background: isError
                  ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                  : 'linear-gradient(90deg, #f59e0b, #ea580c)',
                borderRadius: 99,
              }}
            />
          </div>

          {/* Content */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
            }}
          >
            {/* Icon */}
            <div
              style={{
                fontSize: 18,
                flexShrink: 0,
                filter: isError ? 'drop-shadow(0 0 6px rgba(239,68,68,0.6))' : 'drop-shadow(0 0 6px rgba(245,158,11,0.6))',
              }}
            >
              {isError ? '🚫' : '⚡'}
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {isError ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5', marginBottom: 2 }}>
                    დღის ლიმიტი ამოიწურა
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(252,165,165,0.75)', lineHeight: 1.4 }}>
                    დღეს {count}/{limit} გენერაცია გამოიყენე Starter გეგმაზე.
                    განახლდება გამთენიისას ·{' '}
                    <a
                      href="/pricing"
                      style={{ color: '#f87171', textDecoration: 'underline', fontWeight: 600 }}
                    >
                      Pro-ზე გადასვლა →
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fcd34d', marginBottom: 2 }}>
                    დღის ლიმიტი თითქმის ამოიწურა
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(252,211,77,0.75)', lineHeight: 1.4 }}>
                    {remaining !== null ? remaining : '–'} გენერაცია დარჩა დღეს ({count}/{limit}).{' '}
                    <a
                      href="/pricing"
                      style={{ color: '#fbbf24', textDecoration: 'underline', fontWeight: 600 }}
                    >
                      შეუზღუდავი Pro-ს ნახვა →
                    </a>
                  </div>
                </>
              )}
            </div>

            {/* Count badge */}
            <div
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 99,
                background: isError ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                color: isError ? '#fca5a5' : '#fcd34d',
                border: `1px solid ${isError ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
              }}
            >
              {percentage}%
            </div>

            {/* Dismiss */}
            {onDismiss && (
              <button
                onClick={onDismiss}
                style={{
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: isError ? 'rgba(252,165,165,0.5)' : 'rgba(252,211,77,0.5)',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: '2px 4px',
                  borderRadius: 4,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = isError ? '#fca5a5' : '#fcd34d')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = isError ? 'rgba(252,165,165,0.5)' : 'rgba(252,211,77,0.5)')}
                aria-label="დახურვა"
              >
                ×
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
