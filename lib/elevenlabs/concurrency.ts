import 'server-only';

/**
 * In-process concurrency gate for ElevenLabs API calls.
 *
 * The account is capped at 2 concurrent requests — exceeding it returns
 * `429 concurrent_limit_exceeded`. The Georgian-song build fires a TTS vocal AND a
 * Music bed together (already 2 concurrent), so any third overlapping EL call on the
 * same instance 429'd and retried until the route hit its maxDuration timeout (the
 * georgian-song / assemble audio flakiness). Routing every EL HTTP call through this
 * gate serialises them to ELEVENLABS_MAX_CONCURRENCY (default 2) so a single instance
 * never exceeds the plan and the legs queue instead of failing.
 *
 * Scope caveat: this is PER serverless instance. Genuine cross-instance contention
 * (many simultaneous users) still needs a higher ElevenLabs plan or a distributed
 * limiter — but the dominant 429 source is one request's own overlapping EL calls,
 * which this fully removes.
 */
const MAX_CONCURRENCY = Math.max(1, Number(process.env.ELEVENLABS_MAX_CONCURRENCY) || 2);

let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) next(); // hand the still-held slot straight to the next waiter
  else active -= 1; // no one waiting → free the slot
}

/** Run `fn` while holding an ElevenLabs concurrency slot; releases on settle. */
export async function withElevenLabsSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
