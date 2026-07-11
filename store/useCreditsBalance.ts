import { create } from 'zustand';

/**
 * useCreditsBalance — a TTL-cached, request-deduped store for the DISPLAY balance (the ₾ chip).
 * =============================================================================================
 *
 * Each app route (dashboard, library, agent-terminal, settings) is a SEPARATE Next page, so every
 * navigation remounts the shell and used to fire a fresh GET /api/credits/balance. This store caches
 * the value for a short TTL so a route change reuses it instead of re-hitting the endpoint, and
 * dedups concurrent callers onto ONE in-flight fetch.
 *
 * CORRECTNESS: this is DISPLAY-ONLY — it never gates a spend. The billing source of truth stays the
 * server-side deduct_credits/refund_credits SAGA. Callers MUST force-refresh (get(true)) on the two
 * value-changing events — a spend ('myavatar:credits-updated') and a Stripe top-up poll — and
 * invalidate() on auth change so one user never sees another's cached balance.
 */

const TTL_MS = 45_000;

interface CreditsBalanceState {
  balance: number | null;
  fetchedAt: number;
  inflight: Promise<number | null> | null;
  /** Return the balance, TTL-cached. force=true always refetches (spend / top-up). Deduped. */
  get: (force?: boolean) => Promise<number | null>;
  /** Seed the cache directly (e.g. from a response that already carried the new balance). */
  set: (balance: number) => void;
  /** Drop the cache (call on auth change so a re-login can't reuse the prior user's balance). */
  invalidate: () => void;
}

export const useCreditsBalance = create<CreditsBalanceState>((setState, getState) => ({
  balance: null,
  fetchedAt: 0,
  inflight: null,

  set: (balance) => setState({ balance, fetchedAt: Date.now() }),

  invalidate: () => setState({ balance: null, fetchedAt: 0 }),

  get: async (force = false) => {
    const s = getState();
    // Serve from cache when fresh and not forced.
    if (!force && s.balance !== null && Date.now() - s.fetchedAt < TTL_MS) return s.balance;
    // Coalesce concurrent callers onto the single in-flight request.
    if (s.inflight) return s.inflight;

    const p: Promise<number | null> = (async () => {
      try {
        // Default cache mode (not no-store) so the endpoint's Cache-Control: max-age=10 also helps.
        const res = await fetch('/api/credits/balance', { credentials: 'include' });
        if (!res.ok) return getState().balance;
        const j = (await res.json()) as { balance?: number | null };
        if (typeof j?.balance === 'number') {
          setState({ balance: j.balance, fetchedAt: Date.now() });
          return j.balance;
        }
        return getState().balance;
      } catch {
        return getState().balance; // fail-safe: keep the last known value
      } finally {
        setState({ inflight: null });
      }
    })();

    setState({ inflight: p });
    return p;
  },
}));
