/**
 * lib/notifications/store.ts — thin, FAIL-OPEN helpers over the notifications table
 * (PHASE 3 Task 3). Every helper degrades to a safe default when the migration
 * (20260626_notifications.sql) hasn't been applied yet, so the bell simply shows
 * nothing instead of erroring. Pass an authed (RLS) client for user routes, or the
 * service-role client for server-side events (payment webhook).
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type NotificationType = 'video' | 'music' | 'image' | 'credits_low' | 'payment';

export interface NotificationRow {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/** Newest-first notifications for a user (default 5). Fail-open → []. */
export async function listNotifications(client: Client, userId: string, limit = 5): Promise<NotificationRow[]> {
  try {
    const { data, error } = await client
      .from('notifications')
      .select('id, type, message, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));
    if (error || !Array.isArray(data)) return [];
    return data as NotificationRow[];
  } catch { return []; }
}

/** Count of unread notifications. Fail-open → 0. */
export async function unreadCount(client: Client, userId: string): Promise<number> {
  try {
    const { count, error } = await client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error || typeof count !== 'number') return 0;
    return count;
  } catch { return 0; }
}

/** File a notification. Fail-open → false (never throws into a generation flow). */
export async function createNotification(client: Client, userId: string, type: NotificationType, message: string): Promise<boolean> {
  try {
    const { error } = await client
      .from('notifications')
      .insert({ user_id: userId, type, message: message.slice(0, 500) });
    return !error;
  } catch { return false; }
}

/** Mark one (by id) or all of a user's notifications read. Fail-open → false. */
export async function markRead(client: Client, userId: string, id?: string): Promise<boolean> {
  try {
    let q = client.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    if (id) q = q.eq('id', id);
    const { error } = await q;
    return !error;
  } catch { return false; }
}
