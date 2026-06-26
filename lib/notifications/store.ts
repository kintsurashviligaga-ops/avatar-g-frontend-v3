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

// ── Fallback feed ────────────────────────────────────────────────────────────
// The dedicated `notifications` table needs a DDL migration that can't currently
// be applied on prod (all admin DDL channels are down). Until it lands, we
// synthesize the feed from `generation_jobs` — already written on every completion
// and exposed under the same owner-only RLS — so the bell is populated TODAY. When
// the real table exists and has rows, the table path wins and this is never hit.
// Message/type maps mirror lib/orchestrator/jobs.ts (keep in sync).
const GEN_MESSAGE: Record<string, string> = {
  film: '🎬 თქვენი ვიდეო მზადაა!', avatar: '🎬 თქვენი ავატარი მზადაა!',
  image: '🖼 თქვენი სურათი მზადაა!', music: '🎵 თქვენი მუსიკა მზადაა!',
  voice: '🎤 თქვენი ხმა მზადაა!', interior: '🏠 თქვენი დიზაინი მზადაა!',
};
function genType(serviceType: string): NotificationType {
  return serviceType === 'music' ? 'music' : serviceType === 'image' ? 'image' : 'video';
}

/** Synthesize a notification feed from a user's recently-completed generations. Fail-open → []. */
export async function listGenerationNotifications(client: Client, userId: string, limit = 5): Promise<NotificationRow[]> {
  try {
    const { data, error } = await client
      .from('generation_jobs')
      .select('id, service_type, status, created_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));
    if (error || !Array.isArray(data)) return [];
    return data.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      type: genType(String(r.service_type)),
      message: GEN_MESSAGE[String(r.service_type)] ?? '✅ თქვენი შედეგი მზადაა!',
      read: false, // the client tracks "seen" via a local last-seen timestamp
      created_at: String(r.updated_at ?? r.created_at),
    }));
  } catch { return []; }
}
