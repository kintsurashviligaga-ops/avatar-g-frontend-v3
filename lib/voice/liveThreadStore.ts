/**
 * lib/voice/liveThreadStore.ts — the server half of lib/voice/liveThread: the newest turns of the CALLER'S OWN chat session.
 *
 * Service-role client, so ownership is checked here explicitly: the session row must carry the signed-in user's id and not
 * be trashed, or there are no turns. Imported lazily by app/api/voice/live so the mint and its tests stay free of it.
 */
import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { LiveThreadDeps, LiveThreadTurn } from './liveThread';

export function liveThreadDeps(): LiveThreadDeps {
  return {
    async getTurns(userId, sessionId, limit) {
      const sb = createServiceRoleClient();
      const { data: session, error: sessionError } = await sb
        .from('chat_sessions')
        .select('session_id')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .maybeSingle();
      if (sessionError || !session) return null;
      const { data, error } = await sb
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error || !data) return null;
      return data
        .filter((m): m is LiveThreadTurn => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({ role: m.role, content: m.content }));
    },
  };
}
