import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { adminAllowlist, hasAdminRoleClaim, isAdminIdentity, verifiedEmail } from '@/lib/auth/adminGuard';
import { secretMatches } from '@/lib/security/secretMatch';

/**
 * Admin authorization — decided ONLY by server-truth sources (the one rule lives in lib/auth/adminGuard:
 * isAdminIdentity): a server-set `app_metadata` role, or a VERIFIED email on the effective allowlist.
 *
 * `user_metadata` is DELIBERATELY NOT trusted: any signed-in user can set it via
 * `supabase.auth.updateUser({ data: { is_admin: true } })`, so trusting it (as this file previously
 * did) was a self-grantable privilege-escalation reaching billing/metrics/PII endpoints (audit B2).
 */
export async function isAdminUserAsync(user: User | null): Promise<boolean> {
  return isAdminIdentity(user);
}

/**
 * ⚠️ SYNCHRONOUS SUBSET of the admin rule, for the few callers that cannot await: the role claim and the static
 * (code ∪ env) allowlist, without the panel-granted rows. Anything that can await uses isAdminUserAsync /
 * assertAdminAccess, so an admin granted from the panel is an admin everywhere that matters.
 */
export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  if (hasAdminRoleClaim(user)) return true;
  const email = verifiedEmail(user);
  return Boolean(email && adminAllowlist().includes(email));
}

/** Scripted admin access: `x-admin-key` header against ADMIN_API_KEY, compared in constant time. */
export function hasValidAdminKey(request: NextRequest): boolean {
  return secretMatches(request.headers.get('x-admin-key'), process.env.ADMIN_API_KEY);
}

export async function assertAdminAccess(request: NextRequest, user: User | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (hasValidAdminKey(request) || (await isAdminIdentity(user))) {
    return { ok: true };
  }
  return { ok: false, reason: 'Admin access required' };
}
