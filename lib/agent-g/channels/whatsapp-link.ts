/**
 * lib/agent-g/channels/whatsapp-link.ts — which account a WhatsApp number belongs to, and the short history Agent G
 * reads back to keep a conversation going. Service-role only (migration 20261003c: the client roles may READ their own
 * link row, never write one).
 *
 * ⚠️ A NUMBER IS LINKED ONLY BY A MESSAGE FROM THAT NUMBER. The signed-in user takes a one-time code on the website
 * and sends it FROM WhatsApp; the webhook (Meta-signed) sees the sender and binds number → account. Nothing lets a
 * browser name a number: if it could, anyone could claim someone else's number and read their conversation with
 * Agent G under their own account.
 *
 * Every function degrades instead of throwing. A missing table (the migration not applied yet) answers 'unavailable',
 * and the webhook then replies with a fixed text — no model call, no write.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOneTimeCode } from './telegram-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface WhatsAppLink {
  id: string;
  userId: string;
  waId: string;
  meta: WhatsAppLinkMeta;
}

export interface WhatsAppLinkMeta {
  locale?: 'ka' | 'en' | 'ru';
  /** false after "stop": no alerts, replies still work. */
  alerts?: boolean;
  linked_at?: string;
  /** The last message FROM the user — WhatsApp's 24 h free-form window is counted from here. */
  last_inbound_at?: string;
  profile_name?: string;
}

export type LinkLookup = { state: 'linked'; link: WhatsAppLink } | { state: 'unlinked' } | { state: 'unavailable' };

/** PostgREST / Postgres answers for "that relation does not exist" (42P01) or "not in the schema cache" (PGRST205). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? '');
}

const CODE_TTL_MS = 15 * 60_000;

function toLink(row: Record<string, unknown>): WhatsAppLink {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    waId: String(row.external_id ?? ''),
    meta: (row.meta && typeof row.meta === 'object' ? row.meta : {}) as WhatsAppLinkMeta,
  };
}

export async function findLinkByNumber(sb: Client, waId: string): Promise<LinkLookup> {
  try {
    const { data, error } = await sb
      .from('agent_g_channels')
      .select('id, user_id, external_id, meta')
      .eq('type', 'whatsapp')
      .eq('external_id', waId)
      .eq('status', 'connected')
      .maybeSingle();
    if (error) return { state: 'unavailable' }; // a missing table (isMissingTable) or any other read failure
    return data ? { state: 'linked', link: toLink(data) } : { state: 'unlinked' };
  } catch {
    return { state: 'unavailable' };
  }
}

export async function findLinkByUser(sb: Client, userId: string): Promise<LinkLookup> {
  try {
    const { data, error } = await sb
      .from('agent_g_channels')
      .select('id, user_id, external_id, meta')
      .eq('type', 'whatsapp')
      .eq('user_id', userId)
      .eq('status', 'connected')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { state: 'unavailable' };
    return data ? { state: 'linked', link: toLink(data) } : { state: 'unlinked' };
  } catch {
    return { state: 'unavailable' };
  }
}

/** A fresh single-use code for the signed-in user (any older WhatsApp code of theirs is dropped). */
export async function createConnectCode(sb: Client, userId: string): Promise<{ code: string; expiresAt: string } | 'unavailable'> {
  try {
    await sb.from('agent_g_connect_codes').delete().eq('user_id', userId).eq('channel', 'whatsapp');
    const code = buildOneTimeCode(8);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const { error } = await sb.from('agent_g_connect_codes').insert({ user_id: userId, code, expires_at: expiresAt, channel: 'whatsapp' });
    if (error) return 'unavailable';
    return { code, expiresAt };
  } catch {
    return 'unavailable';
  }
}

/**
 * Bind `waId` to the code's owner. The code is deleted by id with RETURNING first — two deliveries of the same message
 * (or two people racing one code) cannot both link. The number leaves any other account (whoever holds the phone
 * now proved it), and the account's previous WhatsApp number is replaced: one number per account, one account per number.
 */
export async function consumeConnectCode(
  sb: Client,
  code: string,
  waId: string,
  meta: Pick<WhatsAppLinkMeta, 'locale' | 'profile_name'>,
): Promise<{ userId: string } | 'not_found' | 'unavailable'> {
  try {
    const nowIso = new Date().toISOString();
    const found = await sb
      .from('agent_g_connect_codes')
      .select('id, user_id')
      .eq('code', code)
      .eq('channel', 'whatsapp')
      .gt('expires_at', nowIso)
      .maybeSingle();
    if (found.error) return 'unavailable';
    if (!found.data) return 'not_found';

    const taken = await sb.from('agent_g_connect_codes').delete().eq('id', found.data.id).select('id');
    if (taken.error) return 'unavailable';
    if (!taken.data || taken.data.length === 0) return 'not_found';

    const userId = String(found.data.user_id);
    await sb.from('agent_g_channels').delete().eq('type', 'whatsapp').eq('external_id', waId);
    await sb.from('agent_g_channels').delete().eq('type', 'whatsapp').eq('user_id', userId);
    const inserted = await sb.from('agent_g_channels').insert({
      user_id: userId,
      type: 'whatsapp',
      status: 'connected',
      external_id: waId,
      username: meta.profile_name ? meta.profile_name.slice(0, 80) : null,
      meta: { ...meta, alerts: true, linked_at: nowIso, last_inbound_at: nowIso },
    });
    if (inserted.error) return 'unavailable';
    return { userId };
  } catch {
    return 'unavailable';
  }
}

export async function unlink(sb: Client, linkId: string): Promise<boolean> {
  try {
    const { error } = await sb.from('agent_g_channels').delete().eq('id', linkId).eq('type', 'whatsapp');
    return !error;
  } catch {
    return false;
  }
}

/** Merge `patch` into the link's meta (read-modify-write; the only writers are this number's own messages). */
export async function patchLinkMeta(sb: Client, link: WhatsAppLink, patch: Partial<WhatsAppLinkMeta>): Promise<boolean> {
  try {
    const { error } = await sb.from('agent_g_channels').update({ meta: { ...link.meta, ...patch } }).eq('id', link.id);
    return !error;
  } catch {
    return false;
  }
}

const HISTORY_TYPE = 'whatsapp_message';
const HISTORY_TEXT_MAX = 2000;

/** One turn of the conversation, kept so the next answer has context. Bounded text; never the media. */
export async function appendTurn(
  sb: Client,
  link: WhatsAppLink,
  role: 'user' | 'assistant',
  text: string,
  wamid?: string | null,
): Promise<void> {
  try {
    await sb.from('agent_g_channel_events').insert({
      user_id: link.userId,
      type: HISTORY_TYPE,
      payload: { role, text: text.slice(0, HISTORY_TEXT_MAX), wa_id: link.waId, wamid: wamid ?? null },
    });
  } catch {
    /* history is a nicety — a lost turn only shortens the context */
  }
}

/** The last `limit` turns with this number in the past `hours`, oldest first. */
export async function recentTurns(
  sb: Client,
  link: WhatsAppLink,
  limit = 12,
  hours = 24,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  try {
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    const { data, error } = await sb
      .from('agent_g_channel_events')
      .select('payload, created_at')
      .eq('user_id', link.userId)
      .eq('type', HISTORY_TYPE)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data
      .map((r) => (r.payload ?? {}) as { role?: string; text?: string; wa_id?: string })
      .filter((p) => p.wa_id === link.waId && (p.role === 'user' || p.role === 'assistant') && typeof p.text === 'string' && p.text)
      .map((p) => ({ role: p.role as 'user' | 'assistant', content: String(p.text) }))
      .reverse();
  } catch {
    return [];
  }
}
