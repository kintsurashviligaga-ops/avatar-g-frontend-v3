'use client';

/**
 * useShortBalance — true when the signed-in balance is KNOWN to be below `credits`, for a GenerateButton's `insufficient`
 * (the tap opens the top-up instead of a render). Display only: the route's reservation stays the gate. Unknown (a guest,
 * a failed fetch, the first paint) is never "short", so a press is never blocked on a guess.
 */
import { useEffect } from 'react';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { gelToCredits } from '@/lib/credits/pricing';

const isGuest = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.authed === '0';

export function useShortBalance(credits: number): boolean {
  const balance = useCreditsBalance((s) => s.balance);
  useEffect(() => {
    if (!isGuest()) void useCreditsBalance.getState().get();
  }, []);
  return balance !== null && credits > 0 && gelToCredits(balance) < credits;
}

/** Opens the top-up sheet (ChatChrome listens). */
export function openTopUp(): void {
  try { window.dispatchEvent(new CustomEvent('myavatar:open-credits')); } catch { /* SSR */ }
}
