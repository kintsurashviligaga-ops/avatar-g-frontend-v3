/**
 * GET /api/genjutsu/status?id=<jobId> — poll ONE VFX job. Sign-in required; a job is only ever shown to its payer.
 *
 *   { done: false, state }                                       still working (`processing` | `delivering` | `queued`)
 *   { done: true,  state: 'ready', videoUrl }                    delivered (and filed in the Library)
 *   { done: true,  state: 'failed', error, refunded }            failed — `refunded: true` ONLY when the credit-back landed
 *
 * Two kinds of id, one route:
 *   `<operation>::<aspect>::<createdMs>~gj1.…`   a Veo scene. The signed charge token inside the id says WHO paid and
 *                                                under which ref; an id without an authentic token bound to THIS caller is
 *                                                a 404 — never a poll of someone else's operation, never a refund to
 *                                                whoever holds an id. (lib/genjutsu/chargeToken)
 *   `hf:<uuid>`                                  a Higgsfield job in the studio saga; ownership is the saga store's own
 *                                                `getForUser`. The saga itself refunds (webhook · sweeper), so this only reads.
 *
 * ⚠️ A SCENE IS NEVER HELD OPEN FOREVER. Past GENJUTSU_HARD_CAP_MS without a delivered clip it is refunded and closed — the
 * refund is by ref (what the LEDGER shows, once as `${ref}:refund`), so this poll, a repeat poll and the render drainer
 * collapse to ONE credit-back. A finished clip is re-hosted at a fixed path, so a re-poll re-signs the same object.
 *
 * ⚠️ maxDuration 120 here; vercel.json's `app/api/**` glob (15 s) overrides it unless `app/api/genjutsu/**` is added
 * there, and the Gemini-transport watermark crop needs ffmpeg-static traced for this route (next.config.js
 * outputFileTracingIncludes) — both are integrator actions listed in the branch report. Without the trace the clip is
 * still delivered, uncropped; on Vertex there is no crop at all.
 */
import { NextRequest, NextResponse } from 'next/server';
import { genjutsuChargeForPolledId, genjutsuJobId, parseVeoJobId, uuidFromRef } from '@/lib/genjutsu/chargeToken';
import { hfJobIdFromPublic, hfJobView } from '@/lib/genjutsu/hfMotion';
import { GENJUTSU_HARD_CAP_MS, fail } from '@/lib/genjutsu/serverCommon';
import { pollScene } from '@/lib/genjutsu/veoScene';
import { reportError } from '@/lib/observability/report-error';
import { failJob, jobSnapshot, recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { refundDebitByRef } from '@/lib/orchestrator/ledger';
import { getStudioRuntime } from '@/lib/studio/runtime';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const ROUTE = '/api/genjutsu/status';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const id = (req.nextUrl.searchParams.get('id') ?? '').trim();
  if (!id || id.length > 1_500) return fail(400, 'invalid_request');

  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return fail(401, 'unauthorized');

  return id.startsWith('hf:') ? higgsfield(id, userId) : veoScene(id, userId);
}

// ─── Veo scene ──────────────────────────────────────────────────────────────────────────────────────────────────

async function veoScene(id: string, userId: string): Promise<NextResponse> {
  const { jobId, charge } = genjutsuChargeForPolledId(id);
  // Only the payer, only an authentic token bound to exactly this job.
  if (!charge || charge.u !== userId) return fail(404, 'not_found');
  const job = parseVeoJobId(jobId);
  if (!job) return fail(404, 'not_found');
  const uuid = uuidFromRef(charge.r);
  const rowId = uuid ? genjutsuJobId(uuid) : null;

  /** Refund by ref (the ledger's own net, once), close the row, answer once. */
  const giveUp = async (error: string, why: string): Promise<NextResponse> => {
    const back = await refundDebitByRef(charge.u, charge.r).catch(() => null);
    if (!back?.ok && back?.reason !== 'skipped') reportError(new Error('genjutsu refund did not land'), { route: ROUTE, ref: charge.r, why });
    if (rowId) await failJob(rowId, why);
    return NextResponse.json({ success: true, done: true, state: 'failed', error, refunded: !!back?.ok }, { headers: noStore });
  };

  const progress = await pollScene(job.operation, job.aspect, userId);

  if (progress.state === 'failed') {
    return giveUp(progress.reason === 'filtered' ? 'content_rejected' : 'generation_failed', `veo ${progress.reason}`);
  }

  if (progress.state === 'ready') {
    // File it in the Library once: a re-poll of a finished job must not re-fire the completion notification.
    const snap = rowId ? await jobSnapshot(rowId) : null;
    if (rowId && snap?.status !== 'completed') {
      await recordCompletedFilm({
        id: rowId, userId, url: progress.url, prompt: 'VFX scene', orientation: job.aspect === '9:16' ? 'vertical' : 'landscape',
        result: { url: progress.url, kind: 'video', vfx: true, op: 'scene' }, subtype: 'vfx',
      });
    }
    return NextResponse.json({ success: true, done: true, state: 'ready', videoUrl: progress.url }, { headers: noStore });
  }

  // processing | delivering — but never forever.
  if (Date.now() - job.createdMs > GENJUTSU_HARD_CAP_MS) return giveUp('provider_unavailable', 'no delivered clip within the cap');
  return NextResponse.json({ success: true, done: false, state: progress.state }, { headers: noStore });
}

// ─── Higgsfield (the studio saga) ───────────────────────────────────────────────────────────────────────────────

async function higgsfield(id: string, userId: string): Promise<NextResponse> {
  const jobUuid = hfJobIdFromPublic(id);
  if (!jobUuid) return fail(404, 'not_found');
  const rt = getStudioRuntime();
  if (!rt) return fail(503, 'not_configured');

  let job = await rt.store.getForUser(jobUuid, userId);
  if (!job) return fail(404, 'not_found');
  // A finished job's outputs are copied into OUR storage on read, so a result never waits for the next cron tick.
  if (job.status === 'finalizing') job = await rt.saga.finalize(job);

  const view = hfJobView(job);
  if (view.state === 'ready') {
    const urls = await rt.signOutputs(job.output_urls).catch(() => []);
    if (urls[0]) return NextResponse.json({ success: true, done: true, state: 'ready', videoUrl: urls[0] }, { headers: noStore });
    return NextResponse.json({ success: true, done: false, state: 'processing' }, { headers: noStore }); // signed on the next read
  }
  if (view.state === 'failed') {
    return NextResponse.json({ success: true, done: true, state: 'failed', error: view.errorCode, refunded: view.refunded }, { headers: noStore });
  }
  return NextResponse.json({ success: true, done: false, state: view.state }, { headers: noStore });
}
