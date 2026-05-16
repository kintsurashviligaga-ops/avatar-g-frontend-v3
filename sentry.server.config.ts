/**
 * Sentry server-side configuration (Node.js runtime)
 * Set SENTRY_DSN in Vercel environment variables (server-side only)
 */
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_BUILD_ID,

    // Lower server-side sampling — errors are more actionable than traces
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

    enabled: process.env.NODE_ENV === 'production',

    // Don't track health checks
    ignoreErrors: ['UNAUTHENTICATED', 'UNAUTHORIZED'],

    beforeSend(event) {
      // Strip auth headers from breadcrumbs
      if (event.request?.headers) {
        delete (event.request.headers as Record<string, unknown>)['authorization'];
        delete (event.request.headers as Record<string, unknown>)['cookie'];
      }
      return event;
    },
  });
}
