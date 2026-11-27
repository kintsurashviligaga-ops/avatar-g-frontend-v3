/**
 * Next.js Instrumentation File
 * Initializes Sentry for server-side (Node.js + Edge) monitoring.
 * Per Next.js 15 requirements, Sentry.init() must be called here.
 */

export async function register() {
  // Phase 8.14: a launch flag set to a value its reader ignores is OFF without a sound. Say so once per cold start in
  // the server log (names and accepted values only, never a secret). Never throws, changes nothing.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { checkLaunchFlags } = await import('./lib/env/launchFlags');
      for (const w of checkLaunchFlags()) console.warn('[launch-flags]', w.message);
    } catch {
      /* the check is advisory */
    }
  }

  const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!DSN) return; // Skip if no DSN configured

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn: DSN,
      environment: process.env.NODE_ENV,
      release: process.env.NEXT_PUBLIC_BUILD_ID,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
      enabled: process.env.NODE_ENV === 'production',
      ignoreErrors: ['UNAUTHENTICATED', 'UNAUTHORIZED'],
      beforeSend(event) {
        if (event.request?.headers) {
          delete (event.request.headers as Record<string, unknown>)['authorization'];
          delete (event.request.headers as Record<string, unknown>)['cookie'];
        }
        return event;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn: DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
      enabled: process.env.NODE_ENV === 'production',
    });
  }
}

/**
 * Next.js 15 server error hook — REQUIRED for Sentry to auto-capture uncaught errors thrown in Route
 * Handlers, Server Components and middleware (without it, server errors never reach Sentry). Lazily
 * loads the SDK and no-ops when no DSN is configured, so it's inert + build-safe when unconfigured.
 * Wrapped so a capture failure can never propagate into the request.
 */
export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
): Promise<void> {
  const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!DSN) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureRequestError(...args);
  } catch {
    /* observability must never crash a request */
  }
}
