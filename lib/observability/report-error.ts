/**
 * Fail-safe error reporting helper.
 *
 * `reportError(error, context)` is the single entry point for capturing
 * exceptions across the codebase. It:
 *   1. Always logs to console with a structured prefix (works in all runtimes)
 *   2. Forwards to Sentry when configured (no-op when SENTRY_DSN missing)
 *   3. Never throws — the caller can rely on it being side-effect-only
 *
 * Use it in catch blocks and at error boundaries:
 *
 *   try { ... } catch (e) {
 *     reportError(e, { route: '/api/foo', userId, payload });
 *     return NextResponse.json({ error: 'Retry suggested' }, { status: 500 });
 *   }
 */

import * as Sentry from '@sentry/nextjs';

type ErrorContext = Record<string, unknown>;

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Unknown non-serializable error');
  }
}

export function reportError(value: unknown, context?: ErrorContext): void {
  const err = toError(value);

  // 1. Always log structured — Vercel logs surface this regardless of Sentry
  // eslint-disable-next-line no-console
  console.error('[reportError]', {
    name: err.name,
    message: err.message,
    stack: err.stack?.split('\n').slice(0, 6).join('\n'),
    context,
    at: new Date().toISOString(),
  });

  // 2. Forward to Sentry when configured. Wrapped in try/catch so a Sentry
  //    outage never propagates into application logic.
  try {
    Sentry.withScope(scope => {
      if (context) {
        for (const [k, v] of Object.entries(context)) {
          if (k === 'userId' && typeof v === 'string') {
            scope.setUser({ id: v });
          } else {
            scope.setExtra(k, v);
          }
        }
      }
      Sentry.captureException(err);
    });
  } catch {
    // swallow — never let observability fail the caller
  }
}

/**
 * Lightweight breadcrumb — use to add context before an error happens so the
 * Sentry trail has the surrounding state when the eventual exception lands.
 */
export function reportBreadcrumb(message: string, data?: ErrorContext): void {
  try {
    Sentry.addBreadcrumb({ message, data, level: 'info', timestamp: Date.now() / 1000 });
  } catch {
    // swallow
  }
}
