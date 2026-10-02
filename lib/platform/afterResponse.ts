/**
 * lib/platform/afterResponse.ts — run work AFTER the HTTP response is sent, on Vercel.
 *
 * WHY. A webhook must answer fast (Meta and Telegram retry a slow or failed delivery), but the reply to the user — an
 * LLM answer, a Cloud API send — takes seconds. Until now both channel webhooks only QUEUED the delivery for the worker
 * tick, and the tick never ran (Vercel Cron calls GET; the route had only POST) and, without Upstash, the queue lived in
 * the memory of a lambda that was already gone. Users wrote and got silence.
 *
 * Vercel exposes `waitUntil` on the request context it installs at `globalThis[Symbol.for('@vercel/request-context')]`
 * — the exact accessor `@vercel/functions` uses, read here without adding the package. The function stays alive until
 * the promise settles (bounded by the route's maxDuration), and the caller has already returned its 200.
 *
 * Off Vercel (local dev, tests) there is no context: `runAfterResponse` answers false and the caller falls back to its
 * old path (the queue), so behaviour there is unchanged.
 */

type RequestContext = { waitUntil?: (promise: Promise<unknown>) => void };

function requestContext(): RequestContext | null {
  try {
    const holder = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] as
      | { get?: () => RequestContext | undefined }
      | undefined;
    return holder?.get?.() ?? null;
  } catch {
    return null;
  }
}

/** True when `task` was handed to the platform to finish after the response; false when there is no such platform. */
export function runAfterResponse(task: () => Promise<unknown>, label = 'after-response'): boolean {
  const ctx = requestContext();
  if (!ctx?.waitUntil) return false;
  ctx.waitUntil(
    Promise.resolve()
      .then(task)
      .catch((error) => {
        console.error(`[${label}] background task failed`, error instanceof Error ? error.message : 'unknown');
      }),
  );
  return true;
}
