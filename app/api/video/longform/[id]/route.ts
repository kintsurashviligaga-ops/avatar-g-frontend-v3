/**
 * GET /api/video/longform/[id] — a long-form film's progress, for its OWNER only.
 *
 *   404  LONGFORM_VIDEO_ENABLED off (before auth), a malformed id, or a job that is not the caller's — the three are
 *        indistinguishable on purpose: an id is never confirmed to exist for someone who does not own it
 *   401  no verified session
 *   200  lib/video/longform/api.longformStatusView — progress, hold, error code, the film (when done) and the
 *        delivered clips (until then), each URL freshly signed
 *
 * ⚠️ URLS ARE SIGNED FROM THE STORED PATHS ON EVERY READ (24 h), never handed back from the row: the row's URL was
 * signed for 7 days when the clip was hosted, and a film is worth more than a week. Read through the service role and
 * scoped to the caller by hand (`user_id`), like every other longform write path — the tables' owner-SELECT policy
 * is the second fence, not the first.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { reportError } from '@/lib/observability/report-error';
import { createSignedAssetUrl, createSignedAssetUrls } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { isLongformJobId, longformStatusView } from '@/lib/video/longform/api';
import { isLongformEnabled } from '@/lib/video/longform/plan';
import type { Row } from '@/lib/video/longform/rows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET = 'renders';
const SIGN_SEC = 86_400;
const JOB_COLUMNS =
  'id, user_id, status, cancel_requested, hold_until, hold_reason, stitch_attempts, deadline_at, error_code, output_url, output_path, output_bytes, scene_count, act_count, tier, format, resolution, generate_audio, bible, seed, credits_per_scene, refunds_pending, created_at, completed_at';
// No `spec`: the view needs none of it, and 30 shots of jsonb per poll is waste.
const SCENE_COLUMNS = 'ordinal, act, status, output_path';

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isLongformEnabled()) return notFound();

  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;

  const id = params?.id;
  if (!isLongformJobId(id)) return notFound();

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch (e) {
    reportError(e, { route: '/api/video/longform/[id]', stage: 'service_role' });
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const jobRes = await svc.from('longform_jobs').select(JOB_COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle();
  if (jobRes.error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  if (!jobRes.data) return notFound();
  const job = jobRes.data as Row;

  const scenesRes = await svc.from('longform_scenes').select(SCENE_COLUMNS).eq('job_id', id).order('ordinal', { ascending: true });
  if (scenesRes.error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  const scenes = (scenesRes.data ?? []) as Row[];

  let film: string | null = null;
  const clips = new Map<number, string>();
  if (job.status === 'done') {
    // After the stitch the scene clips are deleted; only the film is signed.
    if (typeof job.output_path === 'string' && job.output_path) film = await createSignedAssetUrl(BUCKET, job.output_path, SIGN_SEC);
  } else {
    // Until then — and for good on a canceled or failed film — the delivered clips are the user's.
    const delivered = scenes.filter((s) => s.status === 'delivered' && typeof s.output_path === 'string' && s.output_path);
    if (delivered.length) {
      const urls = await createSignedAssetUrls(BUCKET, delivered.map((s) => s.output_path as string), SIGN_SEC);
      delivered.forEach((s, i) => {
        const url = urls[i];
        if (url) clips.set(Number(s.ordinal), url);
      });
    }
  }

  return NextResponse.json(longformStatusView(job, scenes, { film, clips }), { headers: { 'Cache-Control': 'private, no-store' } });
}
