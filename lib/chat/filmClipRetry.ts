/**
 * lib/chat/filmClipRetry.ts
 * =========================
 * PHASE 58 — Pure, framework-free timing + concurrency math for the film
 * pipeline's per-clip dispatch + retry schedule. Extracted out of
 * `filmComposite.ts` (which is `server-only` and therefore un-importable from a
 * node Jest env) so the policy that decides whether the LAST-dispatched clips
 * (4 & 5) survive a provider rate-limit window is independently unit-testable.
 *
 * Why this exists: the 5 clips used to fan out via a single `Promise.all`. When
 * LTX is out of funds each leg fails over to a fresh Replicate prediction, so 5
 * `createPrediction` calls fired in the same instant and tripped the account
 * rate limit (observed live: storyboard + 3 clips queued fine, the last 2
 * failed). Three independent dials defend against that:
 *
 *   1. CLIP_DISPATCH_CONCURRENCY + mapWithConcurrency — never more than N clip
 *      dispatches are in flight at once, so the burst is capped at the source
 *      instead of all 5 hitting the provider together.
 *   2. clipDispatchJitterMs — a tiny random pre-dispatch delay so the (few)
 *      concurrent dispatches in a wave don't fire on the exact same millisecond.
 *   3. clipRetryBackoffMs — when a leg's dispatch fails, it waits an
 *      exponentially-growing, jittered, ordinal-offset window before retrying so
 *      retries of several legs don't re-collide into the same rate limit.
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
export const MAX_CLIP_DISPATCH_ATTEMPTS = 4;

/**
 * Max number of clip dispatches in flight at once. PHASE 60 — the live provider
 * (Replicate, < $5 credit) throttles createPrediction to "6/min, BURST OF 1":
 * two simultaneous calls → one 201, one 429. So we SERIALIZE dispatch (1 at a
 * time); combined with the throttle-aware retry backoff below, every clip gets
 * its own slot instead of 4-of-5 failing. The renders still run in parallel on
 * the provider once accepted — this caps only the create fan-out. Funding the
 * provider past $5 lifts the throttle and a higher value here would parallelize.
 */
export const CLIP_DISPATCH_CONCURRENCY = 1;

/** Random 0..this delay before each dispatch so a wave's calls de-sync (ms). */
export const CLIP_DISPATCH_JITTER_MS = 350;

/**
 * First retry waits ~this long; each further retry doubles it (ms). PHASE 60 —
 * set to ~11s because the provider's burst-1 throttle "resets in ~10s"; a sub-
 * second retry just re-trips it. 11s lets the next clip claim the freed slot.
 */
export const CLIP_RETRY_BASE_MS = 11_000;

/** Random 0..this added to every retry so concurrent legs de-sync (ms). */
export const CLIP_RETRY_JITTER_MS = 400;

/** Per-ordinal offset added to retries so later clips back off slightly more (ms). */
export const CLIP_RETRY_ORDINAL_SPREAD_MS = 150;

/**
 * A small random pre-dispatch delay. Applied at the top of every clip dispatch
 * so the (up to CLIP_DISPATCH_CONCURRENCY) legs starting in the same wave don't
 * issue their provider call on the exact same millisecond.
 */
export function clipDispatchJitterMs(rand: () => number = Math.random): number {
  return Math.round(clamp01(rand()) * CLIP_DISPATCH_JITTER_MS);
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

/**
 * Run `fn` over `items` with at most `limit` calls in flight at once, preserving
 * input order in the returned array. A worker pool pulls the next index off a
 * shared cursor as it frees up, so a slow leg never blocks the others beyond the
 * concurrency cap. `fn` is expected to resolve (never reject) — callers that can
 * throw should catch internally; a rejection here aborts the pool.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;
  const effective = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      // i < items.length, so the element is present — the cast satisfies
      // noUncheckedIndexedAccess without a redundant runtime guard.
      results[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: effective }, () => worker()));
  return results;
}

/** Defensive clamp so a misbehaving rand() can never make the delay negative or huge. */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
