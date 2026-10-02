'use client';

/**
 * What the create screen reads from the server besides the price (which is pure): which lengths are open, whether the
 * first-video trial slot is still there, and the balance. Each is read once, cached, and FAILS SAFE — a lock is never
 * wrongly opened, a free chip never wrongly shown, a top-up prompt never wrongly forced.
 */
import { useEffect, useState } from 'react';
import {
  CLOSED_CAPABILITIES,
  effectiveCapabilities,
  parseVideoCapabilities,
  type VideoCapabilities,
} from '@/lib/video/createPanel';
import { useCreditsBalance } from '@/store/useCreditsBalance';

// ── GET /api/video/capabilities ───────────────────────────────────────────────────────────────────────────

let cachedCaps: VideoCapabilities | null = null;
let inflightCaps: Promise<VideoCapabilities> | null = null;

/** Test hook: forget what was read. */
export function __resetVideoCapabilitiesCache(): void {
  cachedCaps = null;
  inflightCaps = null;
}

function loadCapabilities(): Promise<VideoCapabilities> {
  if (cachedCaps) return Promise.resolve(cachedCaps);
  if (typeof fetch !== 'function') return Promise.resolve(CLOSED_CAPABILITIES);
  if (!inflightCaps) {
    inflightCaps = fetch('/api/video/capabilities', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        // Only a real answer is remembered — a network miss must not pin "closed" for the whole session.
        if (j && typeof j === 'object') { cachedCaps = parseVideoCapabilities(j); return cachedCaps; }
        return CLOSED_CAPABILITIES;
      })
      .catch(() => CLOSED_CAPABILITIES)
      .finally(() => { inflightCaps = null; });
  }
  return inflightCaps;
}

/**
 * `server` is what the server said; `effective` is what the picker honours — the server's answer, but never more than the
 * studio can order (createPanel.LONGFORM_ORDER_WIRED). Until the answer arrives both are closed.
 */
export function useVideoCapabilities(enabled: boolean = true): { server: VideoCapabilities; effective: VideoCapabilities } {
  const [server, setServer] = useState<VideoCapabilities>(cachedCaps ?? CLOSED_CAPABILITIES);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadCapabilities().then((c) => { if (alive) setServer(c); });
    return () => { alive = false; };
  }, [enabled]);
  return { server, effective: effectiveCapabilities(server) };
}

// ── GET /api/profile/onboarding → state.freeFilmsRemaining (the one source CreditsModal reads) ──────────────

/** The first-video slots the signed-in user still has; null while unknown, for a guest, or when the read fails. */
export function useFreeFilmsRemaining(signedIn: boolean): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!signedIn || typeof fetch !== 'function') { setN(null); return; }
    let alive = true;
    const read = () => {
      fetch('/api/profile/onboarding', { cache: 'no-store', credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { state?: { freeFilmsRemaining?: number } | null } | null) => {
          if (alive && typeof j?.state?.freeFilmsRemaining === 'number') setN(j.state.freeFilmsRemaining);
        })
        .catch(() => { /* unknown stays unknown — the price is shown, never a free chip on a guess */ });
    };
    read();
    // A film just spent (or gave back) the slot: OmniStudio announces every spend on this event.
    window.addEventListener('myavatar:credits-updated', read);
    return () => { alive = false; window.removeEventListener('myavatar:credits-updated', read); };
  }, [signedIn]);
  return n;
}

// ── The balance, in credits ───────────────────────────────────────────────────────────────────────────────

/**
 * The signed-in user's balance in whole credits (profiles.credits_balance — lib/billing/gel `formatCreditBalance`; the
 * shell's `balanceGel` is a legacy name for the same number). The shared, TTL-cached store is the source, so this adds no
 * request of its own beyond the first. DISPLAY-ONLY: the server's ledger decides every spend.
 */
export function useCreditsAvailable(signedIn: boolean): number | null {
  const balance = useCreditsBalance((s) => s.balance);
  useEffect(() => { if (signedIn) void useCreditsBalance.getState().get(); }, [signedIn]);
  return signedIn && typeof balance === 'number' && Number.isFinite(balance) ? balance : null;
}
