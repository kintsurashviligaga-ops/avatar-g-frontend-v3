/**
 * lib/notifications/prefsStore.ts — where the notification preferences live: the user's auth `app_metadata.notify_prefs`.
 *
 * Why there and not a table: Production has no table for it (2026-10-10, read-only check), a new table is a Production
 * migration (the owner's word), and the schema-drift ratchet forbids calling a table Production lacks. The auth record
 * already exists for every account, is written only with the service role (a browser cannot change `app_metadata`), and
 * the value is a few hundred bytes. If the preferences ever outgrow this, they move to a table with an owner-approved
 * migration and this file is the only reader to change.
 *
 * ⚠️ A write sends ONLY `{ notify_prefs }`. GoTrue merges `app_metadata` key by key on an admin update (a key set to
 * null is removed, others are kept), so the admin `role` claim beside it is never touched. Never send the whole object
 * back: a stale copy would undo a role change made in between.
 */
import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_PREFS, normalizePrefs, type NotifyPrefs } from './preferences';

export const PREFS_KEY = 'notify_prefs';

export interface PrefsRead {
  prefs: NotifyPrefs;
  /** false = nothing saved yet, these are the defaults. */
  saved: boolean;
}

/** From a user object the caller already has (a route's getAuthenticatedUser). No network. */
export function prefsFromUser(user: Pick<User, 'app_metadata'> | null | undefined): PrefsRead {
  const raw = (user?.app_metadata as Record<string, unknown> | undefined)?.[PREFS_KEY];
  return raw && typeof raw === 'object' ? { prefs: normalizePrefs(raw), saved: true } : { prefs: normalizePrefs(DEFAULT_PREFS), saved: false };
}

type Admin = Pick<ReturnType<typeof createServiceRoleClient>['auth']['admin'], 'getUserById' | 'updateUserById'>;
const admin = (): Admin => createServiceRoleClient().auth.admin;

/** For senders that have only the id (the dispatcher). A failed read answers the defaults — never throws. */
export async function readPrefs(userId: string, a: Admin = admin()): Promise<PrefsRead> {
  try {
    const { data, error } = await a.getUserById(userId);
    if (error || !data?.user) return { prefs: normalizePrefs(DEFAULT_PREFS), saved: false };
    return prefsFromUser(data.user);
  } catch {
    return { prefs: normalizePrefs(DEFAULT_PREFS), saved: false };
  }
}

/** Saves the normalized preferences; answers what was stored, or null when the write failed. */
export async function writePrefs(userId: string, raw: unknown, a: Admin = admin()): Promise<NotifyPrefs | null> {
  const prefs = normalizePrefs(raw);
  try {
    const { error } = await a.updateUserById(userId, { app_metadata: { [PREFS_KEY]: prefs } });
    return error ? null : prefs;
  } catch {
    return null;
  }
}
