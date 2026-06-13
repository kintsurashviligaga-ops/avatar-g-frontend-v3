import { NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * POST /api/account/delete — PERMANENT account deletion.
 *
 * Required by Apple App Store Guideline 5.1.1(v): any app that supports account
 * creation must let the user initiate account + data deletion from within the app
 * (not merely deactivate, and not "email us"). This endpoint is that mechanism.
 *
 * Flow:
 *   1. Authenticate the caller — cookie session (web) OR Bearer JWT (the Capacitor
 *      iOS app holds the JWT directly), via authedClientFromRequest.
 *   2. Best-effort purge the user's owned rows. Each delete is isolated so a missing
 *      table/column can NEVER block the authoritative identity deletion. (Most of
 *      these are also handled by ON DELETE CASCADE on auth.users where configured.)
 *   3. Delete the auth identity itself via the service-role admin API — this is what
 *      "delete my account" actually means and what Apple checks for.
 *   4. Clear the local cookie session.
 *
 * Idempotent + fail-safe: returns 401 only when there is no authenticated caller.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// User-owned rows to purge. `col` is the FK column to the auth user. Curated to the
// core, high-signal tables; the auth-user delete below is the authoritative action.
const USER_TABLES: { table: string; col: string }[] = [
  { table: 'avatars', col: 'user_id' },
  { table: 'credits', col: 'user_id' },
  { table: 'credits_ledger', col: 'user_id' },
  { table: 'jobs', col: 'user_id' },
  { table: 'chat_sessions', col: 'user_id' },
  { table: 'chat_messages', col: 'user_id' },
  { table: 'business_profiles', col: 'user_id' },
  { table: 'agent_g_memory', col: 'user_id' },
  { table: 'profiles', col: 'id' },
];

export async function POST(req: Request) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 });
  }
  const uid = user.id;

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json({ success: false, error: 'server_misconfigured' }, { status: 500 });
  }

  // 2. Best-effort data purge — each isolated so a missing table/column can't block
  //    the authoritative identity deletion. (FK cascades may also handle these.)
  for (const { table, col } of USER_TABLES) {
    try {
      await admin.from(table).delete().eq(col, uid);
    } catch {
      /* ignore — never block account deletion on a data-purge miss */
    }
  }

  // 3. Authoritative: remove the auth identity. This is the App Store requirement.
  try {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'delete_failed';
    // eslint-disable-next-line no-console
    console.error('[account/delete]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  // 4. Clear the local cookie session (the identity is already gone).
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }

  return NextResponse.json({ success: true });
}
