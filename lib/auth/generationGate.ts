/**
 * lib/auth/generationGate.ts — who may start a PAID generation (video, image, music, avatar, storyboard frames, remix).
 *
 * The studio stops a guest in the browser (send() raises `myavatar:auth-required`), but the API routes behind it are
 * plain HTTP: anyone can POST to them directly. Every one of them spends the platform's own keys — Veo is $0.10–0.40
 * per SECOND — and the per-user credit debit only exists for a signed-in user, so an anonymous request is unbilled
 * spend. This is the one rule every such route applies, server-side:
 *
 *   anonymous (no verified session) → refused, unless FILM_ALLOW_ANONYMOUS=1 re-opens it for a demo deployment.
 *
 * The flag keeps its historical name (it first guarded the film pipeline only) so one switch covers every lane.
 * Chat itself (text answers) is not a generation and is not gated here.
 */
import { isTruthyFlag } from '@/lib/env/flag';

/** The userId routes use when there is no session. The routes derive it from the verified session, never the body. */
export function isAnonymousUser(userId: string | null | undefined): boolean {
  return !userId || !userId.trim() || userId === 'anonymous';
}

/** FILM_ALLOW_ANONYMOUS=1 — anonymous paid generation re-opened (demo / preview only). Off by default. */
export function anonymousGenerationAllowed(): boolean {
  return isTruthyFlag(process.env.FILM_ALLOW_ANONYMOUS);
}

/** True when this caller must be refused before any paid provider call. */
export function mustSignInToGenerate(userId: string | null | undefined): boolean {
  return isAnonymousUser(userId) && !anonymousGenerationAllowed();
}

export function signInToGenerateMessage(locale?: string | null): string {
  if (locale === 'en') return 'Sign in to create — generation needs an account.';
  if (locale === 'ru') return 'Войдите, чтобы создавать — для генерации нужен аккаунт.';
  return 'შესაქმნელად შედი ანგარიშზე — გენერაციას ანგარიში სჭირდება.';
}

/** The JSON body a route answers a refused anonymous generation with (HTTP 401). */
export function signInToGenerateBody(locale?: string | null): { success: false; error: 'auth_required'; authRequired: true; message: string } {
  return { success: false, error: 'auth_required', authRequired: true, message: signInToGenerateMessage(locale) };
}
