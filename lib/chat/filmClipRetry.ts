/**
 * lib/chat/filmClipRetry.ts
 * =========================
 * PHASE 58 — Pure, framework-free timing math for the film pipeline's per-clip
 * dispatch + retry schedule. Extracted out of `filmComposite.ts` (which is
 * `server-only` and therefore un-importable from a node Jest env) so the
 * back-off / stagger schedule that decides whether the LAST-dispatched clips
 * (4 & 5) survive a provider rate-limit window is independently unit-testable.
 *
 * Why this exists: the 5 clips fan out via `Promise.all`. When LTX is out of
 * funds each leg fails over to a fresh Replicate prediction, so without spacing
 * 5 `createPrediction` calls fire in the same instant and trip the account rate
 * limit (observed: ~2/5 clips failing — typically the last-dispatched ones).
 * Two independent dials defend against that:
 *
 *   1. clipDispatchStaggerMs — spreads the FIRST dispatch of each leg by ordinal
 *      so the initial burst is smeared over ~1.5s instead of firing at once.
 *   2. clipRetryBackoffMs — when a leg's dispatch fails, it waits an
 *      exponentially-growing, jittered, ordinal-offset window before retrying so
 *      the retries of several legs don't re-collide into the same rate limit.
 *
 * Nothing here touches the network, clock, or `window`; the only impurity
 * (jitter) is injected via an optional `rand` arg defaulting to Math.random.
 */

/**
 * Bounded, isolated per-leg retry budget. A dispatch failure on one clip retries
 * ONLY that clip (never its siblings). Capped low so a hard provider outage
 * degrades fast instead of multiplying spend, but high enough (3) that a clip
 * caught in a transient rate-limit window gets two spaced retries to self-heal.
 */
export const MAX_CLIP_DISPATCH_ATTEMPTS = 3;

/** Per-ordinal spacing applied to the FIRST dispatch of each clip (ms). */
export const CLIP_DISPATCH_STAGGER_MS = 400;

/** First retry waits ~this long; each further retry doubles it (ms). */
export const CLIP_RETRY_BASE_MS = 800;

/** Random 0..this added to every retry so concurrent legs de-sync (ms). */
export const CLIP_RETRY_JITTER_MS = 400;

/** Per-ordinal offset added to retries so later clips back off slightly more (ms). */
export const CLIP_RETRY_ORDINAL_SPREAD_MS = 150;

/**
 * Delay before FIRST-dispatching a clip, spread by its 1-based ordinal so the
 * initial fan-out doesn't burst. Clip 1 fires immediately; each later clip waits
 * `(ordinal - 1) * CLIP_DISPATCH_STAGGER_MS`.
 */
export function clipDispatchStaggerMs(ordinal: number): number {
  if (!Number.isFinite(ordinal) || ordinal <= 1) return 0;
  return (Math.floor(ordinal) - 1) * CLIP_DISPATCH_STAGGER_MS;
}

/**
 * Delay before a RETRY dispatch. `attempt` is the 1-based loop index, so the
 * first try (attempt 1) never waits — back-off only applies from attempt 2 on.
 * The window grows exponentially with the retry number, plus a random jitter and
 * a small per-ordinal offset so several legs retrying at once don't re-collide.
 *
 * @param attempt 1-based attempt index (1 = first try → 0ms).
 * @param ordinal 1-based clip ordinal, spreads concurrent retries.
 * @param rand    injectable [0,1) source; defaults to Math.random.
 */
export function clipRetryBackoffMs(
  attempt: number,
  ordinal: number,
  rand: () => number = Math.random,
): number {
  if (!Number.isFinite(attempt) || attempt <= 1) return 0;
  const retryIndex = Math.floor(attempt) - 1; // 1 for first retry, 2 for second…
  const base = CLIP_RETRY_BASE_MS * 2 ** (retryIndex - 1); // 800, 1600, …
  const jitter = Math.round(clamp01(rand()) * CLIP_RETRY_JITTER_MS); // 0..400
  const ord = Number.isFinite(ordinal) && ordinal > 1 ? Math.floor(ordinal) - 1 : 0;
  const spread = ord * CLIP_RETRY_ORDINAL_SPREAD_MS;
  return base + jitter + spread;
}

/** Defensive clamp so a misbehaving rand() can never make the delay negative or huge. */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
