/**
 * lib/routing/signIn.ts — THE address of sign-in.
 *
 * ⚠️ THERE IS NO SIGN-IN PAGE. The standalone /{lang}/login, /{lang}/signup and /{lang}/auth pages (the old full-screen
 * AuthScreen) were deleted on 2026-10-01 at the owner's request; signing in happens in the studio's own sheet
 * (components/chat/AuthModal, owned by ChatChrome). Anything that used to send someone to /login now sends them to
 * `/{lang}/dashboard?auth=login` — the studio for guests and members alike, so a signed-in visitor is not bounced
 * through the front door — and ChatChrome opens the sheet. next.config.js redirects the old addresses here, with
 * their query, so old links, bookmarks and mails keep working.
 *
 * The query the old pages understood is kept:
 *   redirect / next  where to go after signing in (sanitised by safeInternalPath — never an open redirect)
 *   error            an OAuth / code-exchange failure bounced back by /auth/callback
 *   plan             the tier someone picked on the pricing page (→ sessionStorage, picked up after sign-in)
 *   ref              a referral code (→ the sheet's existing redeem-after-sign-up flow)
 */
import { safeInternalPath } from '@/lib/auth/safeRedirect';

export type SignInMode = 'login' | 'signup';

const LOCALES = new Set(['ka', 'en', 'ru']);

export function signInPath(
  locale: string,
  opts: { mode?: SignInMode; redirect?: string; plan?: string; ref?: string } = {},
): string {
  const lang = LOCALES.has(locale) ? locale : 'ka';
  const q = new URLSearchParams({ auth: opts.mode ?? 'login' });
  if (opts.redirect) q.set('redirect', opts.redirect);
  if (opts.plan) q.set('plan', opts.plan);
  if (opts.ref) q.set('ref', opts.ref);
  return `/${lang}/dashboard?${q.toString()}`;
}

export interface SignInDeepLink {
  mode: SignInMode;
  /** A safe internal path, or null when absent / unsafe. */
  redirect: string | null;
  error: string | null;
  plan: string | null;
  ref: string | null;
}

/** The params this module owns — stripped from the address bar once read, so a reload does not reopen the sheet. */
export const SIGN_IN_PARAMS = ['auth', 'redirect', 'next', 'error', 'error_description', 'plan', 'ref'] as const;

const clip = (v: string | null, max: number): string | null => {
  const t = (v ?? '').trim();
  return t ? t.slice(0, max) : null;
};

/** Read `?auth=login|signup…` (or null when the address is not a sign-in link). */
export function readSignInDeepLink(search: string | URLSearchParams): SignInDeepLink | null {
  const q = typeof search === 'string' ? new URLSearchParams(search) : search;
  const auth = q.get('auth');
  if (auth !== 'login' && auth !== 'signup') return null;
  const target = q.get('redirect') ?? q.get('next');
  const redirect = safeInternalPath(target, '') || null;
  return {
    mode: auth,
    redirect,
    error: clip(q.get('error_description') ?? q.get('error'), 300),
    plan: clip(q.get('plan'), 40),
    ref: clip(q.get('ref'), 40),
  };
}
