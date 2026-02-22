import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

export type MemoryPlatform = 'telegram' | 'web' | string;

export type UserMemoryState = {
  memory: Record<string, unknown>;
  style: Record<string, unknown>;
};

export type UserMemoryPatch = {
  memory?: Record<string, unknown>;
  style?: Record<string, unknown>;
};

const DEFAULT_MEMORY: UserMemoryState = {
  memory: {},
  style: {},
};

function isMemoryEnabled(): boolean {
  return String(process.env.AGENT_G_MEMORY_ENABLED || '').trim().toLowerCase() === 'true';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = merged[key];
    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      merged[key] = deepMerge(baseValue, patchValue);
      continue;
    }

    merged[key] = patchValue;
  }

  return merged;
}

function safeObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

export async function getUserMemory(platform: MemoryPlatform, userId: string): Promise<UserMemoryState> {
  if (!isMemoryEnabled() || !platform || !userId) {
    return DEFAULT_MEMORY;
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await supabase
      .from('agent_g_memory')
      .select('memory, style')
      .eq('user_platform', platform)
      .eq('user_id', userId)
      .maybeSingle();

    if (result.error || !result.data) {
      return DEFAULT_MEMORY;
    }

    return {
      memory: safeObject(result.data.memory),
      style: safeObject(result.data.style),
    };
  } catch {
    return DEFAULT_MEMORY;
  }
}

export async function upsertUserMemory(
  platform: MemoryPlatform,
  userId: string,
  patch: UserMemoryPatch
): Promise<UserMemoryState> {
  if (!isMemoryEnabled() || !platform || !userId) {
    return DEFAULT_MEMORY;
  }

  const nextPatchMemory = safeObject(patch.memory);
  const nextPatchStyle = safeObject(patch.style);

  try {
    const current = await getUserMemory(platform, userId);
    const mergedMemory = deepMerge(current.memory, nextPatchMemory);
    const mergedStyle = deepMerge(current.style, nextPatchStyle);

    const supabase = createServiceRoleClient();
    const result = await supabase.from('agent_g_memory').upsert(
      {
        user_platform: platform,
        user_id: userId,
        memory: mergedMemory,
        style: mergedStyle,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_platform,user_id',
      }
    );

    if (result.error) {
      return current;
    }

    return {
      memory: mergedMemory,
      style: mergedStyle,
    };
  } catch {
    return DEFAULT_MEMORY;
  }
}

function redactSensitiveText(value: string): string {
  const redactedPhone = value.replace(/\b\+?\d[\d\s()\-]{7,}\d\b/g, '[redacted-phone]');
  const redactedAddress = redactedPhone.replace(
    /\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|lane|ln\.?|apt\.?|flat|მისამართი|ქუჩა)\b[^,\n]{0,80}/gi,
    '[redacted-address]'
  );
  return redactedAddress.slice(0, 500);
}

function sanitizeEventPayload(payload: unknown): unknown {
  if (typeof payload === 'string') {
    return redactSensitiveText(payload);
  }

  if (Array.isArray(payload)) {
    return payload.slice(0, 30).map((item) => sanitizeEventPayload(item));
  }

  if (isPlainObject(payload)) {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      output[key] = sanitizeEventPayload(value);
    }
    return output;
  }

  return payload;
}

export async function recordEvent(
  platform: MemoryPlatform,
  userId: string,
  type: string,
  payload: unknown
): Promise<boolean> {
  if (!isMemoryEnabled() || !platform || !userId || !type) {
    return false;
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await supabase.from('agent_g_events').insert({
      user_platform: platform,
      user_id: userId,
      type,
      payload: sanitizeEventPayload(payload),
    });

    return !result.error;
  } catch {
    return false;
  }
}

export function __memoryFlagForTests(): boolean {
  return isMemoryEnabled();
}
