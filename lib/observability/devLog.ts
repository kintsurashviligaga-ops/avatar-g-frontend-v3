/**
 * lib/observability/devLog.ts — a browser-side diagnostic line that only exists outside production (Phase 8.15 polish).
 *
 * Client components used to `console.warn` small notices (an ignored scene event, a Web Speech language fallback). On
 * myavatar.ge they only filled the visitor's devtools; real failures go to Sentry through reportError. In development and
 * in tests the line still prints, so nothing is lost while building.
 */
export function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console
  console.warn(...args);
}

export function devInfo(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console
  console.info(...args);
}
