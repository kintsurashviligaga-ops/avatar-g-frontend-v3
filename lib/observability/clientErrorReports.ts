/**
 * lib/observability/clientErrorReports.ts — errors no component caught (an `await` without a catch, a throw inside a
 * timer) reach the Vercel logs instead of vanishing in one visitor's console.
 *
 * Behind NEXT_PUBLIC_CLIENT_ERROR_REPORTS=1 (off by default). When on, each page sends at most MAX_REPORTS reports, one
 * per distinct message, as a text/plain beacon to /api/log-error (which prints `[client-report]` and is rate-limited per
 * IP). The path is sent without its query or fragment, and messages are cut short: a report carries no form data, no
 * tokens, no URLs with parameters.
 *
 * Nothing here shows UI: a rejection no code handled has no place on screen. The user-facing half is
 * components/studio/ui/serviceError userFacingMessage, used where a catch DOES show a line.
 */
const LOG_ERROR_URL = '/api/log-error';
export const CLIENT_REPORTS_MAX = 5;
const MESSAGE_MAX = 300;

/** Noise every browser produces that says nothing about our code. */
const IGNORED = /ResizeObserver loop|Script error\.?$|AbortError|The user aborted a request|cancelled|NotAllowedError: play\(\)/i;

export interface ReportTarget {
  addEventListener(type: 'error' | 'unhandledrejection', fn: (ev: unknown) => void): void;
  removeEventListener(type: 'error' | 'unhandledrejection', fn: (ev: unknown) => void): void;
  location: { pathname: string };
  navigator?: { sendBeacon?: (url: string, body: string) => boolean; userAgent?: string };
}

// The literal `process.env.NEXT_PUBLIC_…` is what Next inlines into the browser bundle; reading it off a copied object
// would always be undefined there.
export function clientReportsEnabled(value: string | undefined = process.env.NEXT_PUBLIC_CLIENT_ERROR_REPORTS): boolean {
  return value === '1';
}

function messageOf(reason: unknown): { name: string; message: string; stack?: string } {
  // DOMException (an aborted fetch) is not an Error subclass everywhere: read the shape, not the class.
  if (reason && typeof reason === 'object' && typeof (reason as Error).message === 'string') {
    const e = reason as Error;
    return { name: String(e.name || 'Error'), message: e.message, stack: typeof e.stack === 'string' ? e.stack : undefined };
  }
  if (typeof reason === 'string') return { name: 'string', message: reason };
  try { return { name: typeof reason, message: JSON.stringify(reason) ?? String(reason) }; } catch { return { name: typeof reason, message: String(reason) }; }
}

/** Starts listening; returns the function that stops. Never throws. */
export function installClientErrorReports(target: ReportTarget, now: () => number = Date.now): () => void {
  let sent = 0;
  const seen = new Set<string>();
  const send = (kind: 'unhandledrejection' | 'error', reason: unknown) => {
    try {
      if (sent >= CLIENT_REPORTS_MAX) return;
      const m = messageOf(reason);
      const message = `${kind}: ${m.name}: ${m.message}`.replace(/\s+/g, ' ').slice(0, MESSAGE_MAX);
      if (!m.message || IGNORED.test(m.message) || IGNORED.test(m.name) || seen.has(message)) return;
      seen.add(message);
      sent += 1;
      const body = JSON.stringify({
        message,
        url: target.location.pathname.slice(0, 300),
        stack: m.stack ? m.stack.split('\n').slice(0, 6).join('\n').slice(0, 1500) : undefined,
        userAgent: target.navigator?.userAgent?.slice(0, 200),
        timestamp: new Date(now()).toISOString(),
      });
      target.navigator?.sendBeacon?.(LOG_ERROR_URL, body);
    } catch { /* reporting never breaks the page */ }
  };
  const onRejection = (ev: unknown) => send('unhandledrejection', (ev as { reason?: unknown } | null)?.reason);
  const onError = (ev: unknown) => send('error', (ev as { error?: unknown; message?: unknown } | null)?.error ?? (ev as { message?: unknown } | null)?.message);
  target.addEventListener('unhandledrejection', onRejection);
  target.addEventListener('error', onError);
  return () => {
    target.removeEventListener('unhandledrejection', onRejection);
    target.removeEventListener('error', onError);
  };
}
