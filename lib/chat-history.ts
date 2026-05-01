'use client';

import { createBrowserClient } from '@/lib/supabase/client';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClient(): any {
  return createBrowserClient();
}

export async function createSession(
  userId: string,
  agentId?: string,
  title?: string
): Promise<string | null> {
  try {
    const client = getClient();
    if (!client) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any)
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return (data as { session_id: string }).session_id ?? null;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any)
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).from('chat_messages').insert({
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any)
      .from('chat_sessions')
      .select('session_id, title, updated_at, agent_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) return [];
    return (data ?? []) as Conversation[];
  } catch {
    return [];
  }
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  try {
    const client = getClient();
    if (!client) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any)
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any)
      .from('chat_messages')
      .delete()
      .eq('session_id', sessionId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any)
      .from('chat_sessions')
      .delete()
      .eq('session_id', sessionId);
  } catch {
    // silently ignore
  }
}
