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

/** Resolve the full lowercase admin allowlist (defaults ∪ ADMIN_EMAILS env). */
export function adminAllowlist(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) ?? [];
  return [...new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv])];
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

    return adminAllowlist().includes(user.email.toLowerCase());
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
