'use client';

/**
 * useShortBalance — true when the signed-in balance is KNOWN to be below `credits`, for a GenerateButton's `insufficient`
 * (the tap opens the top-up instead of a render). Display only: the route's reservation stays the gate. Unknown (a guest,
 * a failed fetch, the first paint) is never "short", so a press is never blocked on a guess.
 */
import { useEffect } from 'react';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { gelToCredits } from '@/lib/credits/pricing';
import { settings825On } from '@/lib/profile/displayName';
import { openTopUpShort } from '@/lib/billing/shortBalance';

const isGuest = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.authed === '0';

export function useShortBalance(credits: number): boolean {
  const balance = useCreditsBalance((s) => s.balance);
  useEffect(() => {
    if (!isGuest()) void useCreditsBalance.getState().get();
  }, []);
  return balance !== null && credits > 0 && gelToCredits(balance) < credits;
}

/** Opens the top-up sheet (ChatChrome listens). */
export function openTopUp(detail?: { needed?: number; balance?: number }): void {
  // Phase 8.25 (NEXT_PUBLIC_SETTINGS_825=1): callers open this because the balance is short — say so in the sheet.
  if (settings825On()) { openTopUpShort(detail ?? {}); return; }
  try { window.dispatchEvent(new CustomEvent('myavatar:open-credits')); } catch { /* SSR */ }
}
