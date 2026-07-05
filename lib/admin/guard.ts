import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { adminAllowlist } from '@/lib/auth/adminGuard';

type AdminRoleClaim = {
  role?: string;
  roles?: string[];
  is_admin?: boolean;
};

/**
 * Admin authorization — decided ONLY by server-truth sources:
 *   1. the email allowlist (founder ∪ ADMIN_EMAILS) — the SAME gate the /admin page + admin APIs use;
 *   2. app_metadata role — app_metadata is SERVICE-ROLE-ONLY, never client-writable.
 *
 * `user_metadata` is DELIBERATELY NOT trusted: any signed-in user can set it via
 * `supabase.auth.updateUser({ data: { is_admin: true } })`, so trusting it (as this file previously
 * did) was a self-grantable privilege-escalation reaching billing/metrics/PII endpoints (audit B2).
 */
export function isAdminUser(user: User | null): boolean {
  if (!user) return false;

  const email = user.email?.trim().toLowerCase();
  if (email && adminAllowlist().includes(email)) return true;

  const appMeta = (user.app_metadata ?? {}) as AdminRoleClaim;
  if (appMeta.is_admin === true) return true;
  if (appMeta.role === 'admin' || appMeta.role === 'owner') return true;
  return Array.isArray(appMeta.roles) && (appMeta.roles.includes('admin') || appMeta.roles.includes('owner'));
}

export function hasValidAdminKey(request: NextRequest): boolean {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return false;
  const provided = request.headers.get('x-admin-key');
  return Boolean(provided && provided === expected);
}

export function assertAdminAccess(request: NextRequest, user: User | null): { ok: true } | { ok: false; reason: string } {
  if (isAdminUser(user) || hasValidAdminKey(request)) {
    return { ok: true };
  }
  return { ok: false, reason: 'Admin access required' };
}
