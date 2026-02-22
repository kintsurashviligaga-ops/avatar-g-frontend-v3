import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

export type AgentGMemoryChannel = 'web' | 'telegram';
export type AgentGMemoryLocale = 'ka' | 'en' | 'ru';

export type AgentGMemoryRow = {
  id: string;
  user_id: string;
  channel: AgentGMemoryChannel;
  locale: AgentGMemoryLocale;
  style_profile: Record<string, unknown>;
  last_emotion: string | null;
  updated_at: string;
  created_at: string;
};

export type AgentGMemoryUpsertInput = {
  userId: string;
  channel: AgentGMemoryChannel;
  locale: AgentGMemoryLocale;
  styleProfile?: Record<string, unknown>;
  lastEmotion?: string | null;
};

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isAgentGMemoryEnabled(): boolean {
  return parseBooleanFlag(process.env.AGENT_G_MEMORY_ENABLED);
}

async function withMemoryGuard<T>(operation: string, fallback: T, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    console.error('[AgentG.Memory] operation failed', {
      operation,
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return fallback;
  }
}

export async function readAgentGMemory(params: {
  userId?: string;
  channel: AgentGMemoryChannel;
}): Promise<AgentGMemoryRow | null> {
  if (!isAgentGMemoryEnabled() || !params.userId) {
    return null;
  }

  return withMemoryGuard('read', null, async () => {
    const supabase = createServiceRoleClient();
    const result = await supabase
      .from('agent_g_memory')
      .select('*')
      .eq('user_id', params.userId)
      .eq('channel', params.channel)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return (result.data as AgentGMemoryRow | null) ?? null;
  });
}

export async function writeAgentGMemory(input: AgentGMemoryUpsertInput): Promise<boolean> {
  if (!isAgentGMemoryEnabled()) {
    return false;
  }

  if (!input.userId.trim()) {
    return false;
  }

  return withMemoryGuard('write', false, async () => {
    const supabase = createServiceRoleClient();
    const result = await supabase.from('agent_g_memory').upsert(
      {
        user_id: input.userId,
        channel: input.channel,
        locale: input.locale,
        style_profile: input.styleProfile ?? {},
        last_emotion: input.lastEmotion ?? null,
      },
      {
        onConflict: 'user_id,channel',
      }
    );

    if (result.error) {
      throw result.error;
    }

    return true;
  });
}

export async function deleteAgentGMemory(params: {
  userId?: string;
  channel: AgentGMemoryChannel;
}): Promise<boolean> {
  if (!isAgentGMemoryEnabled() || !params.userId) {
    return false;
  }

  return withMemoryGuard('delete', false, async () => {
    const supabase = createServiceRoleClient();
    const result = await supabase
      .from('agent_g_memory')
      .delete()
      .eq('user_id', params.userId)
      .eq('channel', params.channel);

    if (result.error) {
      throw result.error;
    }

    return true;
  });
}
