import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { previewOf } from '@/lib/support/sanitize';
import type { SupportChat, SupportChatWithUser, SupportMessage, SupportSender } from '@/types/support';

/**
 * Every support read/write in one module, so no route hand-rolls a query.
 *
 * ⚠️ SERVICE ROLE ON PURPOSE, AND THE PRINCIPAL IS NEVER A PARAMETER FROM THE CLIENT. The tables grant
 * users SELECT only — there is no INSERT policy — because a browser-side `supabase.from().insert()` would
 * bypass `checkRateLimit` entirely, and a public widget is the cheapest write endpoint on the platform.
 * So writes come through here, behind a route that resolved the user from the SESSION COOKIE.
 *
 * ⚠️ THE USER API NEVER ACCEPTS A chatId. `getOrCreateOpenChat` resolves "my chat" from a userId the route
 * got from `requireUser()`, and the partial unique index guarantees there is at most one. That is what
 * designs IDOR and chat-id enumeration out of the user surface rather than guarding against them.
 */

type Svc = ReturnType<typeof createServiceRoleClient>;

const CHAT_COLS =
  'id, user_id, status, subject, last_message_at, last_message_preview, last_sender, message_count, unread_for_admin, unread_for_user, created_at';
const MSG_COLS = 'id, chat_id, sender, body, created_at';

/** The caller's single open chat, created on first use. `userId` MUST come from the session, never a body. */
export async function getOrCreateOpenChat(svc: Svc, userId: string): Promise<SupportChat> {
  const existing = await svc
    .from('support_chats')
    .select(CHAT_COLS)
    .eq('user_id', userId)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.data) return existing.data as SupportChat;

  const created = await svc
    .from('support_chats')
    .insert({ user_id: userId })
    .select(CHAT_COLS)
    .single();
  if (created.error) {
    // A concurrent first message can lose the race against the partial unique index — re-read rather
    // than surfacing a 500 for what is really "the chat already exists".
    const retry = await svc
      .from('support_chats')
      .select(CHAT_COLS)
      .eq('user_id', userId)
      .neq('status', 'closed')
      .limit(1)
      .maybeSingle();
    if (retry.data) return retry.data as SupportChat;
    throw created.error;
  }
  return created.data as SupportChat;
}

export async function listMessages(svc: Svc, chatId: string, limit = 200): Promise<SupportMessage[]> {
  const { data } = await svc
    .from('support_messages')
    .select(MSG_COLS)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data ?? []) as SupportMessage[];
}

/**
 * Append a message. The AFTER INSERT trigger maintains last_message_at / preview / counters on the parent,
 * so this deliberately does NOT update support_chats — the same double-write mistake that once paid
 * credits twice against the credit_ledger trigger.
 */
export async function appendMessage(
  svc: Svc,
  chatId: string,
  sender: SupportSender,
  body: string,
  author?: { id?: string | null; email?: string | null },
): Promise<SupportMessage> {
  const { data, error } = await svc
    .from('support_messages')
    .insert({
      chat_id: chatId,
      sender,
      body,
      ...(author?.id ? { author_id: author.id } : {}),
      ...(author?.email ? { author_email: author.email } : {}),
    })
    .select(MSG_COLS)
    .single();
  if (error) throw error;
  // A reply reopens a chat the admin had parked — otherwise answering a 'pending' thread leaves it
  // invisible in the default inbox view.
  if (sender === 'admin') {
    await svc.from('support_chats').update({ status: 'open' }).eq('id', chatId).eq('status', 'pending');
  }
  return data as SupportMessage;
}

/** Clear the caller's unread badge. Scoped by user_id so it can only ever clear your own. */
export async function markReadForUser(svc: Svc, chatId: string, userId: string): Promise<void> {
  await svc.from('support_chats').update({ unread_for_user: 0 }).eq('id', chatId).eq('user_id', userId);
}

export async function markReadForAdmin(svc: Svc, chatId: string): Promise<void> {
  await svc.from('support_chats').update({ unread_for_admin: 0 }).eq('id', chatId);
}

/**
 * The admin inbox list. Emails come from a SECOND query against profiles keyed on the ids we already
 * fetched — `support_chats` has no email column and a PostgREST join across schemas is not available here.
 */
export async function listChatsForAdmin(
  svc: Svc,
  opts: { status?: 'open' | 'pending' | 'closed' | 'all'; limit?: number } = {},
): Promise<SupportChatWithUser[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  let q = svc.from('support_chats').select(CHAT_COLS).order('last_message_at', { ascending: false }).limit(limit);
  if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status);
  const { data } = await q;
  const rows = (data ?? []) as SupportChat[];
  if (!rows.length) return [];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await svc.from('profiles').select('id, email').in('id', ids);
  const emailById = new Map((profiles ?? []).map((p: { id: string; email: string | null }) => [p.id, p.email]));
  return rows.map((r) => ({ ...r, email: emailById.get(r.user_id) ?? null }));
}

export async function getChatForAdmin(svc: Svc, chatId: string): Promise<SupportChatWithUser | null> {
  const { data } = await svc.from('support_chats').select(CHAT_COLS).eq('id', chatId).maybeSingle();
  if (!data) return null;
  const row = data as SupportChat;
  const { data: profile } = await svc.from('profiles').select('email').eq('id', row.user_id).maybeSingle();
  return { ...row, email: (profile as { email: string | null } | null)?.email ?? null };
}

export async function setChatStatus(
  svc: Svc,
  chatId: string,
  status: 'open' | 'pending' | 'closed',
  actorEmail: string,
): Promise<void> {
  await svc
    .from('support_chats')
    .update({
      status,
      // Attributed, because an unattributed admin action on someone's support thread is unauditable.
      ...(status === 'closed' ? { closed_at: new Date().toISOString(), closed_by_email: actorEmail } : {}),
    })
    .eq('id', chatId);
}

/** Total unread across every chat — drives the admin tab badge. */
export async function totalUnreadForAdmin(svc: Svc): Promise<number> {
  const { data } = await svc.from('support_chats').select('unread_for_admin').neq('status', 'closed');
  return (data ?? []).reduce((n: number, r: { unread_for_admin: number }) => n + (r.unread_for_admin || 0), 0);
}

export { previewOf };
