import type { User } from '@supabase/supabase-js';

/**
 * lib/supabase/localClaims.ts — read the signed-in user from the session's own JWT, without asking the Auth server.
 *
 * ⚠️ WHY: every `auth.getUser()` is a network round trip to Supabase Auth. Production functions run in iad1 and the
 * production Supabase project lives in ap-southeast-1, so that round trip crosses the Pacific (~200–250 ms) and it sits
 * in front of every signed-in API call and page navigation, before any real work starts (Phase 8.0 audit, P0-1).
 * `auth.getClaims()` verifies the access token's signature locally against the project's published JWKS (cached per
 * warm instance), so a valid token costs no round trip. When the project still signs with the legacy symmetric secret,
 * getClaims itself falls back to getUser(): no speed-up, and no change in behaviour either.
 *
 * ⚠️ WHAT IT GIVES UP: a token stays valid until it expires (an hour by default) even after the user signs out on
 * another device or is banned. getUser() would see that at once. For that reason it is OFF unless AUTH_LOCAL_CLAIMS is
 * on, and the admin check confirms an allowlisted email over the network (lib/auth/adminGuard).
 *
 * ⚠️ A CLAIMS USER IS NOT A FULL USER. The JWT carries id, email, phone, role, app_metadata (server-set) and
 * user_metadata, not `email_confirmed_at`, `created_at` or identities. `claimsOnly` marks such a user so code that needs
 * the missing fields can fetch them.
 */

export function localClaimsEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return /^(1|on|true|yes)$/i.test((env.AUTH_LOCAL_CLAIMS ?? '').trim());
}

/** A user read from verified JWT claims: the fields the token carries, and a marker for the ones it does not. */
export type ClaimsUser = User & { claimsOnly: true };

export function isClaimsOnly(user: unknown): user is ClaimsUser {
  return !!user && typeof user === 'object' && (user as { claimsOnly?: unknown }).claimsOnly === true;
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** The user the verified claims describe, or null when they name nobody (no `sub`). */
export function userFromClaims(claims: unknown): ClaimsUser | null {
  const c = obj(claims);
  const id = str(c.sub);
  if (!id) return null;
  const aud = Array.isArray(c.aud) ? String(c.aud[0] ?? '') : (str(c.aud) ?? '');
  const user = {
    id,
    aud,
    role: str(c.role),
    email: str(c.email),
    phone: str(c.phone),
    app_metadata: obj(c.app_metadata),
    user_metadata: obj(c.user_metadata),
    is_anonymous: c.is_anonymous === true,
    // Not in the token. Empty, never invented: a reader that needs it treats '' as unknown.
    created_at: '',
    claimsOnly: true as const,
  };
  return user as unknown as ClaimsUser;
}

type ClaimsAuth = { getClaims: (jwt?: string) => Promise<{ data: { claims?: unknown } | null; error: unknown }> };

/** Verify the session (or `jwt`) locally and return its user; null when there is no valid token. Never throws. */
export async function verifiedClaimsUser(auth: unknown, jwt?: string): Promise<ClaimsUser | null> {
  try {
    const { data, error } = await (auth as ClaimsAuth).getClaims(jwt);
    if (error || !data?.claims) return null;
    return userFromClaims(data.claims);
  } catch {
    return null;
  }
}
