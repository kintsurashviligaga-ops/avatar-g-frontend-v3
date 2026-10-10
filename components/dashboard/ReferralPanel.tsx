'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReferralData {
  code: string | null;
  shareUrl: string | null;
  totalReferrals: number;
  creditsEarned: number;
  rewardPerReferral?: number;
}

type Lang = 'ka' | 'en' | 'ru';
const COPY: Record<Lang, { title: string; perFriend: string; failed: string; invited: string; earned: string; yourLink: string; copied: string; copy: string; code: string }> = {
  ka: { title: 'მეგობრის მოწვევა', perFriend: 'თითოეულ მეგობარზე 50⚡ კრედიტი', failed: 'ახლა ვერ ჩაიტვირთა. სცადე მოგვიანებით.', invited: 'მოწვეული', earned: 'კრედიტი მიღებული', yourLink: 'შენი მოწვევის ბმული', copied: '✓ დაკოპირდა', copy: 'კოპირება', code: 'კოდი' },
  en: { title: 'Invite a friend', perFriend: '50⚡ credits for each friend', failed: 'Could not load right now. Try again later.', invited: 'Invited', earned: 'Credits earned', yourLink: 'Your invite link', copied: '✓ Copied', copy: 'Copy', code: 'Code' },
  ru: { title: 'Пригласить друга', perFriend: '50⚡ кредитов за каждого друга', failed: 'Сейчас не удалось загрузить. Попробуйте позже.', invited: 'Приглашено', earned: 'Получено кредитов', yourLink: 'Ваша ссылка-приглашение', copied: '✓ Скопировано', copy: 'Копировать', code: 'Код' },
};

/**
 * Referral panel — shown in dashboard sidebar or profile.
 * Creates referral code on first view, shows stats + share link.
 * A failed load shows one plain sentence in the page's language, never the raw error.
 */
export default function ReferralPanel({ isAuthenticated, locale = 'ka' }: { isAuthenticated: boolean; locale?: Lang }) {
  const t = COPY[locale] ?? COPY.ka;
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      // First check status, then create if no code
      const res = await fetch('/api/referral/status', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const d = await res.json() as ReferralData;
      if (!d.code) {
        // Create one
        const cr = await fetch('/api/referral/create', { method: 'POST', credentials: 'include' });
        if (!cr.ok) throw new Error('Failed to create');
        setData(await cr.json() as ReferralData);
      } else {
        setData(d);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { load(); }, [load]);

  const copyLink = async () => {
    if (!data?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for iOS
      const ta = document.createElement('textarea');
      ta.value = data.shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        background: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(34,211,238,0.06))',
        border: '1px solid rgba(14,165,233,0.2)',
        borderRadius: 16,
        padding: '20px 20px',
        margin: '0 12px 12px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #0284c7, #22d3ee)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>
          🎁
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#e0e0ff' }}>{t.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>
            {t.perFriend}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '12px 0' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%', background: '#0ea5e9',
              animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
            }} />
          ))}
        </div>
      ) : error ? (
        <div role="status" style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', textAlign: 'center', padding: '8px 0' }}>
          {t.failed}
        </div>
      ) : data ? (
        <>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{
              flex: 1, textAlign: 'center', padding: '10px 6px',
              background: 'rgba(255,255,255,0.04)', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0ea5e9' }}>{data.totalReferrals}</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>{t.invited}</div>
            </div>
            <div style={{
              flex: 1, textAlign: 'center', padding: '10px 6px',
              background: 'rgba(255,255,255,0.04)', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#22d3ee' }}>{data.creditsEarned}⚡</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>{t.earned}</div>
            </div>
          </div>

          {/* Share URL */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{t.yourLink}</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.05)', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)', padding: '8px 10px',
            }}>
              <span style={{
                flex: 1, fontSize: 11.5, color: 'rgba(255,255,255,0.6)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {data.shareUrl}
              </span>
              <button
                onClick={copyLink}
                style={{
                  flexShrink: 0, padding: '4px 10px', borderRadius: 6,
                  background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(14,165,233,0.15)',
                  border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(14,165,233,0.3)'}`,
                  color: copied ? '#4ade80' : '#60a5fa',
                  fontSize: 11.5, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                <AnimatePresence mode="wait">
                  {copied
                    ? <motion.span key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{t.copied}</motion.span>
                    : <motion.span key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{t.copy}</motion.span>
                  }
                </AnimatePresence>
              </button>
            </div>
          </div>

          {/* Code badge */}
          <div style={{ textAlign: 'center' }}>
            <span style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
              padding: '5px 14px', borderRadius: 99,
              background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)',
              color: '#0ea5e9',
            }}>
              {t.code}: {data.code}
            </span>
          </div>
        </>
      ) : null}

      <style>{`
        @keyframes bounce {
          0%,100%{transform:translateY(0)}
          50%{transform:translateY(-4px)}
        }
      `}</style>
    </motion.div>
  );
}
