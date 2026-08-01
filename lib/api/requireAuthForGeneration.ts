import 'server-only';
import { NextResponse } from 'next/server';

/**
 * The single gate every PAID generation route must pass: no session, no generation.
 *
 * ⚠️ ANONYMOUS CALLERS WERE NOT MERELY ALLOWED — THEY WERE BILLED NOTHING BY DESIGN. /api/video/assemble
 * carried `const scSkipBilling = uid === null ? true : ...` on the single-clip path and the identical
 * `uid === null ? true` on the multi-clip saga, with a comment calling it an "anon trial". So a caller
 * with no account reached the real render, consumed real Veo / Replicate / ElevenLabs spend, and was
 * charged nothing — there was no account to charge. Rate limits slow that down; they do not stop it,
 * because a rate limit bounds requests per key and an anonymous caller simply has no key to exhaust.
 *
 * That is the shape of an external-cost drain: every guest request is pure loss, and nothing in the
 * system can attribute, cap or recover it.
 *
 * ⚠️ THIS RETURNS 401 RATHER THAN A REDIRECT, DELIBERATELY. These are fetch() endpoints called from the
 * composer, not navigations — a 302 to a sign-in page would be followed by fetch and parsed as JSON,
 * producing an unreadable error instead of a prompt. The client decides what to show; the server's job
 * is to be unambiguous about why. `code: 'auth_required'` is what the UI keys off to open sign-in.
 */

export interface AuthGateResult {
  /** Present when the caller is anonymous — return it immediately. */
  response: NextResponse | null;
  userId: string | null;
}

/** Machine code the client matches on to open the sign-in prompt rather than showing a raw error. */
export const AUTH_REQUIRED_CODE = 'auth_required';

export function requireAuthForGeneration(userId: string | null | undefined): AuthGateResult {
  const uid = typeof userId === 'string' && userId ? userId : null;
  if (uid) return { response: null, userId: uid };
  return {
    userId: null,
    response: NextResponse.json(
      {
        error: AUTH_REQUIRED_CODE,
        code: AUTH_REQUIRED_CODE,
        // Human-readable, and NOT a machine code — a route's message reaches the screen, and
        // 'auth_required' in a Georgian UI is the defect this codebase has been clearing out.
        message: 'Sign in to generate. Guest access does not include AI generation.',
      },
      { status: 401 },
    ),
  };
}
