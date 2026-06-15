import 'server-only';

/**
 * Per-user trained-voice (RVC) bookkeeping, stored in the existing generation_jobs
 * table (no migration): one row per training, id = the Replicate prediction id,
 * service_type = 'voice', params.kind = 'voice-train', params.name = the RVC model
 * name, and signed_url = the trained model URL once complete.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

const TABLE = 'generation_jobs';

/**
 * Shared "demo" identity for UNAUTHENTICATED voice training/singing — lets anyone
 * test the feature without signing in (the founder asked to drop the sign-in gate).
 * It's a real auth.users row so the generation_jobs FK holds. Anonymous testers
 * share this one trained model. Re-gate by removing the fallbacks if abuse appears.
 */
export const DEMO_VOICE_USER_ID = '91b0d818-0cf5-4c9c-85c6-2218d27a39c0';

function sb() {
  try { return createServiceRoleClient(); } catch { return null; }
}

export async function saveTrainingJob(userId: string, predictionId: string, name: string): Promise<boolean> {
  const c = sb();
  if (!c) return false;
  const { error } = await c.from(TABLE).upsert(
    { id: predictionId, user_id: userId, service_type: 'voice', status: 'processing', current_stage: 'training', pct: 5, params: { kind: 'voice-train', name } },
    { onConflict: 'id' },
  );
  return !error;
}

export interface TrainingRow { id: string; status: string; modelUrl?: string; name?: string }

export async function getLatestTraining(userId: string): Promise<TrainingRow | null> {
  const c = sb();
  if (!c) return null;
  const { data } = await c.from(TABLE)
    .select('id,status,signed_url,params')
    .eq('user_id', userId).eq('service_type', 'voice').contains('params', { kind: 'voice-train' })
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return { id: data.id as string, status: data.status as string, modelUrl: (data.signed_url as string) || undefined, name: (data.params as { name?: string })?.name };
}

export async function markTrainingDone(predictionId: string, modelUrl: string): Promise<void> {
  const c = sb();
  if (!c) return;
  await c.from(TABLE).update({ status: 'completed', current_stage: 'completed', pct: 100, signed_url: modelUrl, result: { modelUrl } }).eq('id', predictionId);
}

export async function markTrainingFailed(predictionId: string, error: string): Promise<void> {
  const c = sb();
  if (!c) return;
  await c.from(TABLE).update({ status: 'failed', error: error.slice(0, 300) }).eq('id', predictionId);
}

/** The user's most recent COMPLETED trained voice, for the sing path. */
export async function getUserVoiceModel(userId: string): Promise<{ modelUrl: string; name: string } | null> {
  const c = sb();
  if (!c) return null;
  const { data } = await c.from(TABLE)
    .select('signed_url,params')
    .eq('user_id', userId).eq('service_type', 'voice').eq('status', 'completed').contains('params', { kind: 'voice-train' })
    .not('signed_url', 'is', null).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!data?.signed_url) return null;
  return { modelUrl: data.signed_url as string, name: (data.params as { name?: string })?.name || 'voice' };
}
