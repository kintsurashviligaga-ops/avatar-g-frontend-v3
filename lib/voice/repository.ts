import { randomUUID } from 'node:crypto';

import { structuredLog } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { VoiceCallRecord, VoiceCallStatus } from '@/types/voice';

type PartialVoiceCall = Partial<VoiceCallRecord>;

type GlobalVoiceStore = typeof globalThis & {
  __avatarVoiceCalls__?: VoiceCallRecord[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function useMemoryStore(): boolean {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRole) {
    return true;
  }

  return supabaseUrl.includes('placeholder') || serviceRole.includes('placeholder');
}

function memoryStore(): VoiceCallRecord[] {
  const scope = globalThis as GlobalVoiceStore;
  if (!scope.__avatarVoiceCalls__) {
    scope.__avatarVoiceCalls__ = [];
  }

  return scope.__avatarVoiceCalls__;
}

function normalizeRow(row: PartialVoiceCall): VoiceCallRecord {
  return {
    id: row.id || randomUUID(),
    user_id: row.user_id ?? null,
    vapi_call_id: row.vapi_call_id ?? null,
    direction: row.direction || 'web',
    status: row.status || 'initiated',
    duration_seconds: row.duration_seconds ?? null,
    transcript: row.transcript ?? null,
    summary: row.summary ?? null,
    credits_used: Number(row.credits_used ?? 0),
    phone_number: row.phone_number ?? null,
    created_at: row.created_at || nowIso(),
    ended_at: row.ended_at ?? null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
  };
}

export async function insertVoiceCall(row: PartialVoiceCall): Promise<VoiceCallRecord> {
  const normalized = normalizeRow(row);

  if (useMemoryStore()) {
    const store = memoryStore();
    store.unshift(normalized);
    return normalized;
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('voice_calls')
    .insert({
      id: normalized.id,
      user_id: normalized.user_id,
      vapi_call_id: normalized.vapi_call_id,
      direction: normalized.direction,
      status: normalized.status,
      duration_seconds: normalized.duration_seconds,
      transcript: normalized.transcript,
      summary: normalized.summary,
      credits_used: normalized.credits_used,
      phone_number: normalized.phone_number,
      created_at: normalized.created_at,
      ended_at: normalized.ended_at,
      metadata: normalized.metadata,
    })
    .select('*')
    .single();

  if (error || !data) {
    structuredLog('error', 'voice.repository.insert_failed', {
      error: error?.message || 'unknown',
    });
    throw new Error('voice_call_insert_failed');
  }

  return normalizeRow(data as PartialVoiceCall);
}

export async function getVoiceCallByVapiId(vapiCallId: string): Promise<VoiceCallRecord | null> {
  if (!vapiCallId) {
    return null;
  }

  if (useMemoryStore()) {
    return memoryStore().find((row) => row.vapi_call_id === vapiCallId) || null;
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('voice_calls')
    .select('*')
    .eq('vapi_call_id', vapiCallId)
    .maybeSingle();

  if (error) {
    structuredLog('error', 'voice.repository.get_by_vapi_id_failed', {
      error: error.message,
      vapiCallId,
    });
    return null;
  }

  return data ? normalizeRow(data as PartialVoiceCall) : null;
}

export async function updateVoiceCallById(callId: string, updates: PartialVoiceCall): Promise<VoiceCallRecord | null> {
  if (!callId) {
    return null;
  }

  if (useMemoryStore()) {
    const store = memoryStore();
    const index = store.findIndex((row) => row.id === callId);
    if (index === -1) {
      return null;
    }

    const merged = normalizeRow({ ...store[index], ...updates });
    store[index] = merged;
    return merged;
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('voice_calls')
    .update({
      status: updates.status,
      duration_seconds: updates.duration_seconds,
      transcript: updates.transcript,
      summary: updates.summary,
      credits_used: updates.credits_used,
      phone_number: updates.phone_number,
      ended_at: updates.ended_at,
      metadata: updates.metadata,
    })
    .eq('id', callId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    structuredLog('error', 'voice.repository.update_by_id_failed', {
      error: error?.message || 'unknown',
      callId,
    });
    return null;
  }

  return normalizeRow(data as PartialVoiceCall);
}

export async function upsertVoiceCallByVapiId(vapiCallId: string, patch: PartialVoiceCall): Promise<VoiceCallRecord> {
  const existing = await getVoiceCallByVapiId(vapiCallId);

  if (existing) {
    const updated = await updateVoiceCallById(existing.id, {
      ...existing,
      ...patch,
      vapi_call_id: vapiCallId,
      metadata: {
        ...(existing.metadata || {}),
        ...((patch.metadata || {}) as Record<string, unknown>),
      },
    });

    if (updated) {
      return updated;
    }
  }

  return insertVoiceCall({
    ...patch,
    vapi_call_id: vapiCallId,
  });
}

export async function listVoiceCallsByUserId(userId: string, limit = 10): Promise<VoiceCallRecord[]> {
  if (!userId) {
    return [];
  }

  if (useMemoryStore()) {
    return memoryStore()
      .filter((row) => row.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((row) => normalizeRow(row));
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('voice_calls')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    structuredLog('error', 'voice.repository.list_by_user_failed', {
      error: error?.message || 'unknown',
      userId,
    });
    return [];
  }

  return (data as PartialVoiceCall[]).map((row) => normalizeRow(row));
}

export async function appendVoiceCallMetadata(callId: string, patch: Record<string, unknown>): Promise<VoiceCallRecord | null> {
  const existing = useMemoryStore()
    ? memoryStore().find((row) => row.id === callId) || null
    : null;

  if (existing) {
    return updateVoiceCallById(callId, {
      metadata: {
        ...(existing.metadata || {}),
        ...patch,
      },
    });
  }

  if (!useMemoryStore()) {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('voice_calls')
      .select('*')
      .eq('id', callId)
      .maybeSingle();

    if (!data) {
      return null;
    }

    const normalized = normalizeRow(data as PartialVoiceCall);
    return updateVoiceCallById(callId, {
      metadata: {
        ...(normalized.metadata || {}),
        ...patch,
      },
    });
  }

  return null;
}

export async function updateVoiceCallStatusByVapiId(vapiCallId: string, status: VoiceCallStatus, patch: PartialVoiceCall = {}): Promise<VoiceCallRecord> {
  return upsertVoiceCallByVapiId(vapiCallId, {
    ...patch,
    status,
  });
}
