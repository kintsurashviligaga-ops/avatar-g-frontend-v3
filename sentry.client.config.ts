/**
 * Sentry client-side configuration
 * Set NEXT_PUBLIC_SENTRY_DSN in Vercel environment variables
 * Get DSN from: https://sentry.io → Project Settings → Client Keys (DSN)
 */
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_BUILD_ID,

    // Performance — sample 10% of transactions in production
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session replay — 1% of sessions, 10% on errors
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 0.1,

    integrations: [
      Sentry.replayIntegration({
        // Mask all text + block all media to avoid capturing PII
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Don't send errors in development (too noisy)
    enabled: process.env.NODE_ENV === 'production',

    // Filter out low-signal errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'ChunkLoadError',
      'Loading chunk',
      'Network request failed',
      'Failed to fetch',
    ],

    beforeSend(event) {
      // Don't send events from internal Vercel health checks
      if (event.request?.url?.includes('/api/health')) return null;
      return event;
    },
  });
}
