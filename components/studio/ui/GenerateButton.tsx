'use client';

/**
 * GenerateButton — the one full-width "Create / Generate ✦ 25" pill every tool uses (Higgsfield's grammar: the price is
 * ON the button, so the cost is known before the tap, not discovered from the balance afterwards).
 *
 *   · `credits` is the quote (lib/credits/quote.ts) — the SAME number the server charges. 0/null → no price shown.
 *   · `free` swaps the number for a "Free" chip (a first-video trial slot).
 *   · `insufficient` keeps the price visible but turns the tap into "top up" — it never silently does nothing.
 *   · Loading keeps the footprint (no layout shift) and says what is happening.
 *   · 44 px+ target, safe-area aware when `stickyBottom`, token colours only (text on the accent is `text-app-bg`).
 */
import { Loader2, Sparkle } from 'lucide-react';
import { creditsLabel } from '@/lib/credits/quote';

type Lang = 'ka' | 'en' | 'ru';
const lang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

const COPY: Record<Lang, { free: string; topUp: string }> = {
  ka: { free: 'უფასო', topUp: 'შევსება' },
  en: { free: 'Free', topUp: 'Top up' },
  ru: { free: 'Бесплатно', topUp: 'Пополнить' },
};

export interface GenerateButtonProps {
  label: string;
  /** What the press costs, in credits (the quote). */
  credits?: number | null;
  free?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  /** The balance cannot cover `credits`: the tap opens the top-up instead of generating. */
  insufficient?: boolean;
  locale?: string;
  onClick: () => void;
  /** Pin to the bottom of its scroll container with the safe-area inset (phone sheets). */
  stickyBottom?: boolean;
  className?: string;
  testId?: string;
  /** A glyph before the label ("♪✦ Create" on the Music screen). Decorative: the accessible name is unchanged. */
  icon?: React.ReactNode;
}

export function GenerateButton({
  label, credits, free = false, loading = false, loadingLabel, disabled = false, insufficient = false,
  locale = 'en', onClick, stickyBottom = false, className = '', testId, icon,
}: GenerateButtonProps) {
  const c = COPY[lang(locale)];
  const priced = typeof credits === 'number' && credits > 0 && !free;
  const text = insufficient && priced ? c.topUp : label;
  const accessible = free
    ? `${text} — ${c.free}`
    : priced ? `${text} — ${creditsLabel(credits as number, locale)}` : text;
  const off = disabled || loading;
  return (
    <div
      className={stickyBottom ? 'sticky bottom-0 z-10 -mx-1 bg-gradient-to-t from-app-bg via-app-bg/95 to-transparent px-1 pt-3' : ''}
      style={stickyBottom ? { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' } : undefined}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={off}
        aria-busy={loading || undefined}
        aria-label={accessible}
        data-testid={testId}
        data-price={priced ? credits : free ? 'free' : undefined}
        className={`flex min-h-[52px] w-full touch-manipulation items-center justify-center gap-2.5 rounded-2xl bg-app-accent px-5 text-[16px] font-bold leading-none text-app-bg shadow-[0_10px_30px_-12px_rgb(var(--app-accent)/0.7)] transition-[opacity,transform] hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            <span>{loadingLabel ?? label}</span>
          </>
        ) : (
          <>
            {icon != null && <span aria-hidden="true" className="inline-flex shrink-0 items-center">{icon}</span>}
            <span>{text}</span>
            {free && <span className="rounded-full bg-app-bg/20 px-2.5 py-1 text-[12.5px] font-bold">{c.free}</span>}
            {priced && (
              <span className="inline-flex items-center gap-1 tabular-nums" aria-hidden="true">
                <Sparkle size={15} fill="currentColor" strokeWidth={0} />
                {(credits as number).toLocaleString('en')}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}

export default GenerateButton;
