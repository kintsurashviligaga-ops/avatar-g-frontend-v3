/**
 * Next.js Instrumentation File
 * Initializes Sentry for server-side (Node.js + Edge) monitoring.
 * Per Next.js 15 requirements, Sentry.init() must be called here.
 */

export async function register() {
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
