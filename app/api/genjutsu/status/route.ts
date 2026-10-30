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
 * ⚠️ A VOICED AVATAR (`::v` in the signed id, app/api/avatar/veo) is shown only WITH its ElevenLabs line: Veo's own
 * voice is replaced by the line stored before the charge, fitted onto where Veo spoke (lib/avatar/voicedClip), and until
 * that lands the job reads `delivering` — never a silent avatar, and the hard cap below still refunds one that never
 * gets its voice. The video service's direct clip (`::c8`, `::c4v` …, app/api/video/clip) is delivered the same way when
 * its line is Georgian (lib/video/voicedClip, Veo's own sound kept around the line) and is filed under its prompt.
 *
 * ⚠️ A 10 s CLIP (`::o10`) IS NOT VEO: its id's operation is a Gemini Omni Flash interaction (lib/video/omniClip), polled
 * on Vertex and hosted at the clip's own fixed path. Georgian is spoken by Omni itself, so there is no voice leg. Its row
 * keeps the token usage Vertex reported and the list cost, for admins; the user only ever sees credits. An uploaded video
 * Omni edited or extended (`::oe6`, `::ox8`, app/api/video/omni-edit) is polled and filed the same way.
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
import { pollScene, type SceneProgress } from '@/lib/genjutsu/veoScene';
import { deliverVoicedAvatar } from '@/lib/avatar/voicedClip';
import { deliverVoicedClip } from '@/lib/video/voicedClip';
import { clipOmniPath, type DirectClipResolution } from '@/lib/video/directClip';
import { OMNI_INPUT_VIDEO_USD_PER_SEC, OMNI_USD_PER_SEC, pollOmniClip, type OmniProgress } from '@/lib/video/omniClip';
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

  // An Omni clip (10 s, or a Georgian line at any length) is an interaction hosted at the clip's own path; without the
  // job's uuid there is nowhere to host it.
  const progress: OmniProgress | SceneProgress = job.engine === 'omni'
    ? uuid ? await pollOmniClip(job.operation, clipOmniPath(uuid)) : { state: 'failed', reason: 'generation_failed' }
    : await pollScene(job.operation, userId);

  if (progress.state === 'failed') {
    return giveUp(progress.reason === 'filtered' ? 'content_rejected' : 'generation_failed', `${job.engine} ${progress.reason}`);
  }

  if (progress.state === 'ready') {
    // A voiced avatar or clip is its picture WITH its line; a miss is "still delivering" until the cap below.
    const url = !job.voiced
      ? progress.url
      : !uuid
        ? null
        : job.clipSec
          ? await deliverVoicedClip(progress.url, uuid, job.clipSec)
          : await deliverVoicedAvatar(progress.url, uuid);
    if (url) {
      // File it in the Library once: a re-poll of a finished job must not re-fire the completion notification.
      const snap = rowId ? await jobSnapshot(rowId) : null;
      if (rowId && snap?.status !== 'completed' && job.clipSec) {
        // The video service's own clip (or an uploaded video Omni edited / extended), under the user's prompt (the row's
        // params, filed before the charge).
        const prompt = typeof snap?.params?.prompt === 'string' && snap.params.prompt ? snap.params.prompt : 'Video';
        const edited = job.omniOp === 'edit' || job.omniOp === 'extend';
        const inputSec = edited && typeof snap?.params?.inputSec === 'number' ? snap.params.inputSec : 0;
        const outputSec = edited && typeof snap?.params?.outputSec === 'number' ? snap.params.outputSec : job.clipSec;
        // The seconds Omni rendered: an edit, the video's own length; an extend, the new seconds (the input is not re-billed).
        const renderedSec = job.omniOp === 'edit' ? outputSec : job.clipSec;
        const omni = job.engine === 'omni' ? omniRecord(snap?.params?.resolution, renderedSec, progress, inputSec) : null;
        await recordCompletedFilm({
          id: rowId, userId, url, prompt, orientation: job.aspect === '9:16' ? 'vertical' : 'landscape',
          result: {
            url, kind: 'video', op: edited ? `omni-${job.omniOp}` : 'clip', seconds: outputSec,
            ...(edited ? { billedSeconds: job.clipSec, inputSeconds: inputSec } : {}),
            ...(job.voiced ? { voice: 'google-cloud-tts' } : {}),
            ...(omni ? omni.result : {}),
          },
          subtype: 'video',
          ...(omni ? { costUsd: omni.costUsd } : {}),
        });
      } else if (rowId && snap?.status !== 'completed') {
        await recordCompletedFilm(job.voiced
          ? {
            id: rowId, userId, url, prompt: 'Avatar', orientation: job.aspect === '9:16' ? 'vertical' : 'landscape',
            // The line is Google Cloud TTS (Gemini-TTS for Georgian, #135) — the voice /api/avatar/veo names.
            result: { url, kind: 'video', op: 'avatar', voice: 'google-cloud-tts' }, subtype: 'avatar',
          }
          : {
            id: rowId, userId, url, prompt: 'VFX scene', orientation: job.aspect === '9:16' ? 'vertical' : 'landscape',
            result: { url, kind: 'video', vfx: true, op: 'scene' }, subtype: 'vfx',
          });
      }
      return NextResponse.json({ success: true, done: true, state: 'ready', videoUrl: url }, { headers: noStore });
    }
  }

  // processing | delivering — but never forever.
  if (Date.now() - job.createdMs > GENJUTSU_HARD_CAP_MS) return giveUp('provider_unavailable', 'no delivered clip within the cap');
  return NextResponse.json({ success: true, done: false, state: progress.state === 'ready' ? 'delivering' : progress.state }, { headers: noStore });
}

/**
 * What a delivered Omni clip files for admins: the engine, its resolution, Vertex's token counts and the list cost — the
 * seconds it rendered, and an edited / extended video's own input tokens.
 */
function omniRecord(resolution: unknown, seconds: number, progress: OmniProgress | SceneProgress, inputSec = 0) {
  const res: DirectClipResolution = resolution === '1080p' ? '1080p' : '720p';
  const usage = 'usage' in progress && progress.usage ? progress.usage : null;
  const usd = seconds * OMNI_USD_PER_SEC[res] + Math.max(0, inputSec) * OMNI_INPUT_VIDEO_USD_PER_SEC;
  return {
    result: { engine: 'gemini-omni-flash', resolution: res, ...(usage ? { usage } : {}) },
    costUsd: Math.round(usd * 10_000) / 10_000,
  };
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
