/**
 * Admin Authorization Guard
 * 
 * Server-side utility to check if user is admin
 * Uses environment variable ADMIN_EMAILS for allowlist
 */

import { createRouteHandlerClient } from '@/lib/supabase/server';

/**
 * Built-in founder admin(s). Merged with the ADMIN_EMAILS env allowlist so admin
 * works deterministically without depending on console env (env can still ADD
 * more admins). Knowing an email grants nothing — access requires authenticating
 * AS that account through Supabase auth.
 */
const DEFAULT_ADMIN_EMAILS = ['kintsurashviligaga@gmail.com'];

/** Resolve the STATIC lowercase allowlist (defaults ∪ ADMIN_EMAILS env). Never empty. */
export function adminAllowlist(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) ?? [];
  return [...new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv])];
}

/**
 * The DB-backed extension of the allowlist — emails granted from the admin panel.
 *
 * ⚠️ FAILS CLOSED, NOT OPEN. Every other cached read in this codebase fails OPEN (a provider blip must
 * not fail a paid render). This one is the opposite: it is an AUTHORISATION boundary, so an unreachable
 * or slow database must grant FEWER admins, never more. On any error the extras are dropped and only the
 * code+env list survives — which is also why the founder can never be locked out by a database problem.
 *
 * ⚠️ AND IT CAN ONLY ADD. The static list is unioned in unconditionally, so deleting every row (or the
 * whole table) cannot remove the built-in founder. There is no code path where this table's contents can
 * take admin access away from someone who has it from code or env.
 *
 * Cached briefly: isAdmin() runs on every admin request, and a revoked admin should stop being one in
 * seconds rather than on the next deploy.
 */
const EXTRA_TTL_MS = 30_000;
let extraCache: { at: number; emails: string[] } | null = null;

async function adminEmailsFromDb(): Promise<string[]> {
  const now = Date.now();
  if (extraCache && now - extraCache.at < EXTRA_TTL_MS) return extraCache.emails;
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const svc = createServiceRoleClient();
    const res = await Promise.race([
      svc.from('admin_emails').select('email'),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('admin_allowlist_timeout')), 2_000)),
    ]) as { data: { email: string }[] | null; error: unknown };
    if (res.error) throw res.error;
    const emails = (res.data ?? []).map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean);
    extraCache = { at: now, emails };
    return emails;
  } catch {
    // Fail CLOSED: no extras. The static list still applies, so admin never breaks entirely.
    extraCache = { at: now, emails: [] };
    return [];
  }
}

/** The EFFECTIVE allowlist: code + env + panel-granted. Use this for authorisation decisions. */
export async function effectiveAdminAllowlist(): Promise<string[]> {
  return [...new Set([...adminAllowlist(), ...(await adminEmailsFromDb())])];
}

/** Drop the cache so a just-granted or just-revoked admin takes effect immediately. */
export function invalidateAdminAllowlist(): void {
  extraCache = null;
}

export async function isAdmin(): Promise<boolean> {
  try {
    const supabase = createRouteHandlerClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user || !user.email) {
      return false;
    }

    return (await effectiveAdminAllowlist()).includes(user.email.toLowerCase());
  } catch (err) {
    console.error('[Admin Guard] Error checking admin status:', err);
    return false;
  }
}

export async function requireAdmin(): Promise<{ user: unknown; isAdmin: true }> {
  const adminStatus = await isAdmin();
  
  if (!adminStatus) {
    throw new Error('Unauthorized: Admin access required');
  }

  const supabase = createRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return { user, isAdmin: true };
}

/**
 * Client-side admin check
 * Note: This is NOT secure, only for UI purposes
 * Always verify on server-side
 */
export function isAdminEmail(email: string): boolean {
  const fromEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) ?? [];
  const allow = new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]);
  return allow.has(email.trim().toLowerCase());
}
