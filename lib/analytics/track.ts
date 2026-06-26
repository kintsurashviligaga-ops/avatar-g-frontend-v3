/**
 * lib/analytics/track.ts (PHASE 4 Task 1) — client-side event tracking.
 *
 * Fires to BOTH Vercel Web Analytics (window.va, already loaded via <Analytics/>)
 * and our first-party log (POST /api/analytics/track → analytics_events). Strictly
 * fail-silent: tracking must never throw into a user flow. No-op on the server.
 */

type Props = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, props?: Props): void {
  if (typeof window === 'undefined') return;
  // Vercel Web Analytics custom event (window.va is injected by <Analytics/>).
  try {
    const va = (window as unknown as { va?: (e: string, p?: unknown) => void }).va;
    va?.('event', { name: event, ...(props ?? {}) });
  } catch { /* fail-silent */ }
  // First-party log — keepalive so it still flushes if the page navigates away
  // (e.g. a payment redirect right after payment_initiated).
  try {
    void fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ event, props: props ?? {} }),
    }).catch(() => {});
  } catch { /* fail-silent */ }
}
