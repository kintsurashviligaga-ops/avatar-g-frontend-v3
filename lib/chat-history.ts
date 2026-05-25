'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database.types';

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

    if (error) return null;
    return data?.session_id ?? null;
  } catch {
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

    if (error) return [];
    return data ?? [];
  } catch {
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

    if (error) return [];
    return (data ?? []) as ChatMessage[];
  } catch {
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
