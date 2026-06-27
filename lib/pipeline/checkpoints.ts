/**
 * lib/pipeline/checkpoints.ts — per-clip render checkpoints (Pipeline Iteration,
 * Phase 7B). When a film's clips are stitched, each surviving clip URL is checkpointed
 * keyed by (job_id, scene_index) so a later re-render / re-assemble of the SAME film can
 * reuse the rendered clips instead of paying to regenerate them.
 *
 * STRICTLY FAIL-OPEN: every call is wrapped so a missing `generation_checkpoints` table
 * (the migration may not be applied yet) or any write error is a silent no-op — the
 * pipeline behaves exactly as it does today. Service-role writes (server-side) bypass RLS.
 *
 * To activate, apply supabase/migrations/20260627_pipeline_checkpoints.sql.
 */
import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface ClipCheckpoint {
  sceneIndex: number;
  clipUrl: string;
}

/** Persist the surviving clip URLs for a film. Fail-open → false on any miss. */
export async function saveClipCheckpoints(jobId: string, clips: ClipCheckpoint[]): Promise<boolean> {
  if (!jobId || clips.length === 0) return false;
  try {
    const sb = createServiceRoleClient();
    if (!sb) return false;
    const rows = clips
      .filter((c) => typeof c.clipUrl === 'string' && /^https?:\/\//.test(c.clipUrl))
      .map((c) => ({ job_id: jobId, scene_index: c.sceneIndex, clip_url: c.clipUrl }));
    if (rows.length === 0) return false;
    const { error } = await sb.from('generation_checkpoints').upsert(rows, { onConflict: 'job_id,scene_index' });
    return !error;
  } catch { return false; }
}

/** Load a film's checkpointed clips as a sceneIndex→url map. Fail-open → empty map. */
export async function loadClipCheckpoints(jobId: string): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!jobId) return out;
  try {
    const sb = createServiceRoleClient();
    if (!sb) return out;
    const { data, error } = await sb
      .from('generation_checkpoints')
      .select('scene_index, clip_url')
      .eq('job_id', jobId);
    if (error || !Array.isArray(data)) return out;
    for (const r of data as Array<{ scene_index: number; clip_url: string }>) {
      if (typeof r.clip_url === 'string' && r.clip_url) out.set(Number(r.scene_index), r.clip_url);
    }
    return out;
  } catch { return out; }
}
