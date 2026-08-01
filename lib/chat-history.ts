'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database.types';

/**
 * ⚠️ EVERY FUNCTION IN THIS FILE FAILS SOFT, AND THAT IS WHY A TOTAL OUTAGE WAS INVISIBLE FOR MONTHS.
 *
 * Chat persistence has NEVER written a row. `createSession` inserts `agent_id` / `channel` / `title` and
 * selects `session_id` — none of which exist on the live `chat_sessions` table — so PostgREST answers
 * 42703, `if (error) return null` swallows it, and the caller quietly skips `saveMessage`. Verified
 * against production: chat_sessions = 0 rows, chat_messages = 0 rows. Failing soft was the right call
 * (a DB hiccup must never break someone's chat); failing soft SILENTLY is what let a 100%, universal,
 * every-user failure look exactly like success.
 *
 * So the fail-soft behaviour is unchanged — nothing here throws — but it now says so, once per session
 * per operation, so the next breakage is noticed in minutes instead of never.
 */
const _reported = new Set<string>();
function reportPersistenceFailure(op: string, err: unknown): void {
  if (_reported.has(op)) return;
  _reported.add(op);
  const detail = (err && typeof err === 'object' && 'message' in err)
    ? String((err as { message?: unknown }).message)
    : String(err);
  const code = (err && typeof err === 'object' && 'code' in err) ? String((err as { code?: unknown }).code) : '';
  // eslint-disable-next-line no-console
  console.error(`[chat-history] ${op} FAILED — chat history is NOT being saved. ${code} ${detail}`.trim());
}


export interface Conversation {
  session_id: string;
  title: string | null;
  updated_at: string;
  agent_id: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

/**
 * Typed browser client for the chat-history tables. The single boundary cast
 * (createBrowserClient is intentionally schema-agnostic and may return null in
 * demo mode) gives every query below strict, compile-checked types — no `as any`.
 */
function getClient(): SupabaseClient<Database> | null {
  return createBrowserClient() as unknown as SupabaseClient<Database> | null;
}

export async function createSession(
  userId: string,
  agentId?: string,
  title?: string
): Promise<string | null> {
  try {
    const client = getClient();
    if (!client) return null;

    const { data, error } = await client
      .from('chat_sessions')
      .insert({
        user_id: userId,
        agent_id: agentId ?? 'agent-g',
        channel: 'web',
        title: title ?? 'ახალი ჩატი',
      })
      .select('session_id')
      .single();

    if (error) { reportPersistenceFailure('createSession/insert', error); return null; }
    return data?.session_id ?? null;
  } catch (e) {
    reportPersistenceFailure('createSession', e);
    return null;
  }
}

export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;

    await client
      .from('chat_sessions')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  } catch {
    // silently ignore
  }
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;

    await client.from('chat_messages').insert({
      session_id: sessionId,
      role,
      content,
    });
  } catch {
    // silently ignore
  }
}

export async function getConversations(
  userId: string
): Promise<Conversation[]> {
  try {
    const client = getClient();
    if (!client) return [];

    const { data, error } = await client
      .from('chat_sessions')
      .select('session_id, title, updated_at, agent_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) { reportPersistenceFailure('select', error); return []; }
    return data ?? [];
  } catch (e) {
    reportPersistenceFailure('select', e);
    return [];
  }
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  try {
    const client = getClient();
    if (!client) return [];

    const { data, error } = await client
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) { reportPersistenceFailure('select', error); return []; }
    return (data ?? []) as ChatMessage[];
  } catch (e) {
    reportPersistenceFailure('select', e);
    return [];
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;

    await client
      .from('chat_messages')
      .delete()
      .eq('session_id', sessionId);

    await client
      .from('chat_sessions')
      .delete()
      .eq('session_id', sessionId);
  } catch {
    // silently ignore
  }
}
