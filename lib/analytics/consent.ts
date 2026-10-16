/**
 * Analytics consent, shared by the cookie banner and the analytics SDKs.
 *
 * The banner promises "analytics cookies only with your consent", but PostHog used to initialise at module load on
 * every page, before any choice (Production 2026-10-16: an anonymous first visit to /en with no stored choice called
 * us.i.posthog.com/flags). The SDKs now read this module: nothing starts until the stored choice is "all", and a later
 * "necessary only" turns capturing off again.
 */

export const CONSENT_KEY = 'myavatar-cookie-consent';
export const CONSENT_EVENT = 'myavatar:analytics-consent';

export type ConsentChoice = 'all' | 'necessary';

/** True only when the visitor chose "Accept all". No choice yet, "necessary only", or no storage → false. */
export function analyticsAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'all';
  } catch {
    return false;
  }
}

/** Store the choice and tell the SDKs on this page about it. */
export function saveConsent(choice: ConsentChoice): void {
  if (typeof window === 'undefined') return;
  window.__myavatarAnalyticsAllowed = choice === 'all';
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    /* storage blocked: the choice holds for this page only */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { allowed: choice === 'all' } }));
}

declare global {
  interface Window {
    __myavatarAnalyticsAllowed?: boolean;
  }
}
