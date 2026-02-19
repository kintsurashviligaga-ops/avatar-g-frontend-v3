/**
 * Admin Authorization Guard
 * 
 * Server-side utility to check if user is admin
 * Uses environment variable ADMIN_EMAILS for allowlist
 */

import { createRouteHandlerClient } from '@/lib/supabase/server';

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

    // Get admin emails from environment variable
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || [];
    
    if (adminEmails.length === 0) {
      console.warn('[Admin Guard] ADMIN_EMAILS not configured');
      return false;
    }

    return adminEmails.includes(user.email.toLowerCase());
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
  const adminEmails = process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}
