/**
 * POST /api/video/lipsync — OPT-IN Wav2Lip pass for a finished film master.
 *
 * The client calls this AFTER the 30s master is ready, only when the user toggled
 * lip-sync on and a soundtrack/vocal is present. It runs Wav2Lip on Replicate
 * (shared REPLICATE_API_TOKEN) keying the on-screen mouth(s) to the audio.
 *
 * Isolated from the proven assemble path so it can NEVER break a film: on any
 * failure (no token, model error, timeout, empty result) it returns
 * { url: null } and the client keeps the original master. Request body:
 *   { videoUrl: string (https), audioUrl?: string (https) }
 * `audioUrl` defaults to `videoUrl` — the master already carries the mixed
 * soundtrack, so the model keys the lips to the film's own embedded audio (and we
 * avoid pushing a multi-MB soundtrack data-URI at the provider). Response:
 *   { url: string | null }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { lipsyncCreate, filmLipsyncCreate, lipsyncFetch, hasLipsyncProvider, lipsyncStatus, heygenSelfTest, heygenHealthCheck } from '@/lib/ai/lipsync';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { georgianVoiceId } from '@/lib/audio/georgian-voice';
import { convertSongWithRvc } from '@/lib/audio/rvc';
import { getUserVoiceModel, DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadAndSign, reSignIfInternal, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { deductCredits, hasSufficientBalance } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';
import { recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { reportError } from '@/lib/observability/report-error';

// Same bucket uploadBigFile() / the /api/upload/sign route write user files into.
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';

// Resolve an incoming media reference to a provider-fetchable https URL:
//  • external https → passed through · internal Supabase https → re-signed ·
//  • a BARE storage path from uploadBigFile() (e.g. "omni-uploads/…") → signed.
// Anything else (data:, other schemes) → null. This is the fix that makes the
// "attach a video/photo" lipsync flow actually work — uploadBigFile returns a PATH,
// which the old https-only guard silently rejected.
async function resolveMedia(v: unknown): Promise<string | null> {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 4000) return null;
  if (/^https:\/\//i.test(s)) return reSignIfInternal(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // reject data:/file:/other schemes
  return createSignedAssetUrl(UPLOAD_BUCKET, s, 3600); // bare internal storage path
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // Wav2Lip on a 30s 1080p master needs headroom

/**
 * GET — without ?id: names-only readiness probe. With ?id=<predictionId>: poll that
 * lip-sync job ONCE → { done, url } when finished (re-hosted to Supabase), or
 * { done:false } while still rendering. This short-request polling is what makes the
 * ~150s SadTalker render survive mobile networks (a single long fetch gets dropped).
 */
export async function GET(req: NextRequest) {
  // Guarded HeyGen self-test — PROVE the "Avatar" engine end-to-end (server-side, with the
  // real runtime key) BEFORE flipping LIPSYNC_HEYGEN on for real traffic.
  //   GET /api/video/lipsync?selftest=heygen&key=<MIGRATION_RUN_KEY>
  if (req.nextUrl.searchParams.get('selftest') === 'heygen') {
    const key = req.headers.get('x-selftest-key'); // header, not query — keep the secret out of URLs/logs
    if (!key || key !== process.env.MIGRATION_RUN_KEY) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const faceUrl = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&q=80';
    const audioUrl = await textToHostedSpeech('Hello, this is an Avatar voice test. One, two, three.');
    if (!audioUrl) return NextResponse.json({ error: 'tts-failed' }, { status: 502 });
    return NextResponse.json(await heygenSelfTest(faceUrl, audioUrl));
  }
  // PHASE 22 — lightning-fast HeyGen readiness gate. The client calls this BEFORE the ~8-minute
  // singer-performance poll so a dead/expired/throttled key is caught in ~ms (cached 10-min) and the
  // lip-sync stage skips with a surfaced reason instead of trapping the user behind a doomed render.
  // Cheap + cached + fail-open (see heygenHealthCheck) — no paid render, unlike ?selftest.
  if (req.nextUrl.searchParams.get('health') === 'heygen') {
    return NextResponse.json(await heygenHealthCheck());
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json(lipsyncStatus());

  const { status, url, error } = await lipsyncFetch(id);
  if (status === 'succeeded' && url) {
    // Re-host the talking video to a stable Supabase URL (the provider URL expires ~1h).
    let hosted = url;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 45_000); // route has 300s headroom; fewer fail-opens to the expiring URL
      const r = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(to));
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.byteLength && buf.byteLength <= 80 * 1024 * 1024) {
          const path = `lipsync/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
          const signed = await uploadAndSign('uploads', path, buf.toString('base64'), 'video/mp4', 604_800);
          if (signed) hosted = signed;
        }
      }
      // ⚠️ A FAIL-OPEN HERE IS NOT FREE, AND IT WAS SILENT. Keeping the provider URL means the row that
      // gets filed carries an EXTERNAL url, which the Library's re-signer cannot resolve
      // (parseSupabaseObjectUrl returns null for a non-Supabase host) — so it is skipped on read and the
      // card is dead the moment the provider link expires. Delivering the short-lived URL is still the
      // right call over failing a render the user paid for, but it must be observable: a rising count
      // here is exactly the signal that Library entries are quietly rotting.
    } catch (e) {
      reportError(e, { route: 'video.lipsync', step: 'rehost' });
      /* fail-open — keep the provider URL */
    }
    // BILLING FIX — avatar/lip-sync billing was DEFERRED to "its own pipeline" and never wired, so
    // avatar generation was FREE. Charge once on poll-SUCCESS, idempotent per jobId (repeated polls
    // reuse the same ref → deduct_credits dedupes → one charge). Authed only; best-effort.
    try {
      const { user } = await authedClientFromRequest(req);
      if (user?.id) {
        await deductCredits(user.id, creditCostFor('avatar'), `avatar:lipsync:${id}:${user.id}`)
          .catch(() => { /* best-effort — the asset is already delivered */ });
        // AND FILE IT IN THE LIBRARY. Nothing in the lip-sync path ever wrote a generation_jobs row, so
        // a user was CHARGED for the render, watched it, and lost it permanently on refresh — the
        // Lip-Sync Studio has no save control at all, and only the browser Download link (which they had
        // to notice and click inside the session) preserved anything. Charging for work the product then
        // throws away is the worst version of this bug, which is why it sits next to the deduct.
        // The id is deterministic per provider job, so repeated polls upsert ONE row.
        await recordCompletedFilm({
          id: `lipsync:${id}`,
          userId: user.id,
          url: hosted,
          orientation: 'vertical',
          subtype: 'lipsync',
        }).catch(() => { /* best-effort — never fail a delivered asset over its bookkeeping */ });
      }
    } catch { /* fail-open */ }
    return NextResponse.json({ done: true, url: hosted });
  }
  if (status === 'failed' || status === 'canceled') return NextResponse.json({ done: true, url: null, error });
  // ⚠️ A TERMINAL STATUS WITH NO URL USED TO FALL THROUGH TO `{done:false}` FOREVER. `lipsyncFetch`
  // populates `url` only when the provider both SUCCEEDED and yielded a resolvable output — Replicate
  // via extractUrl(pred.output), HeyGen via `d.video_url ?? null`. So a job that genuinely completed but
  // whose output could not be resolved (an empty HeyGen video_url, an output shape extractUrl does not
  // match) missed the `succeeded && url` branch above AND the failed/canceled branch, and answered
  // "still working" on every poll from then on.
  //
  // Nothing ever ended it: LipsyncStudio polls 120×5s and OmniStudio 70×6s across 3 attempts (~21
  // minutes) before giving up with "try different files" — blaming the user's input for a render that
  // completed and was paid for. This is the identical dead end that /api/v2/model3d/status documents and
  // fixed ("TERMINAL WITHOUT A MESH IS A FAILURE, NOT 'STILL WORKING'"); it was never applied here.
  if (status === 'succeeded') {
    return NextResponse.json({
      done: true, url: null,
      error: error || 'the provider finished without a usable video file',
    });
  }
  return NextResponse.json({ done: false });
}

/**
 * POST — START a lip-sync job (async). Speaks the typed text (ElevenLabs, optionally
 * the user's trained RVC voice), dispatches SadTalker, and returns { jobId } fast. The
 * client polls GET ?id=jobId. Synchronous rendering was dropping on mobile (~150s).
 */
export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE); if (rl) return rl;
  // SAY WHY. This returned a bare { jobId: null }, and the client prints `startJson.error || t.failed`
  // — so an operator problem (no HEYGEN_API_KEY, no REPLICATE_API_TOKEN) surfaced to the user as
  // "Lip-sync failed. Try different files.", sending them to hunt for a fault in their own uploads and
  // retry forever with new videos. A missing key is not the user's file.
  if (!hasLipsyncProvider()) {
    return NextResponse.json({ jobId: null, error: 'provider_not_configured', code: 'provider_not_configured' }, { status: 503 });
  }

  // PRE-RENDER balance gate — don't start a paid avatar render (TTS + provider) for a user who
  // can't afford it. The charge lands on the GET poll-success; without this a 0-balance user could
  // start unlimited free avatar jobs. Authed only; fail-open (deduct on poll stays the backstop).
  try {
    const { user: gateUser } = await authedClientFromRequest(req);
    if (gateUser?.id && !(await hasSufficientBalance(gateUser.id, creditCostFor('avatar')))) {
      return NextResponse.json({ jobId: null, error: 'insufficient_credits', code: 'insufficient_credits', topUpNeeded: true }, { status: 402 });
    }
  } catch { /* fail-open */ }

  let body: { videoUrl?: unknown; audioUrl?: unknown; characterRef?: unknown; sceneIndex?: unknown; text?: unknown; useMyVoice?: unknown; forceSadTalker?: unknown; gender?: unknown; kind?: unknown; orientation?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ jobId: null });
  }

  // Resolve the face image. PREFER an explicit `characterRef` (a CLEAN front-facing
  // character portrait) over `videoUrl` — HeyGen's talking_photo needs a clear, evenly
  // lit face, and feeding it a stylized cinematic SCENE FRAME is exactly why the
  // music-video lip-sync was returning null (the HeyGen path itself self-tests as
  // working). `sceneIndex` rides along for callers that lip-sync a single scene clip.
  const videoUrl = (await resolveMedia(body.characterRef)) ?? (await resolveMedia(body.videoUrl));
  // Same reasoning as the provider gate above: a bare null told the user their files were wrong when the
  // real problem is that the reference could not be resolved to a fetchable URL at all.
  if (!videoUrl) return NextResponse.json({ jobId: null, error: 'media_unresolved', code: 'media_unresolved' }, { status: 400 });
  let audioUrl: string = (await resolveMedia(body.audioUrl)) ?? videoUrl;

  // "Speak this text": type a script → ElevenLabs → optionally the user's TRAINED voice.
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1200) : '';
  if (text) {
    // Honour an explicit Female/Male choice via the cloned-voice map; otherwise let
    // textToHostedSpeech auto-pick by persona.
    const g = body.gender === 'male' ? 'male' : body.gender === 'female' ? 'female' : null;
    const ttsUrl = await textToHostedSpeech(text, g ? georgianVoiceId(g) : undefined);
    // If TTS failed, FAIL CLEANLY instead of falling through with audioUrl===videoUrl
    // (the face image) — that would lip-sync the photo to itself and waste a provider
    // job before surfacing a generic failure minutes later.
    if (!ttsUrl) return NextResponse.json({ jobId: null, error: 'tts-failed' });
    audioUrl = ttsUrl;
    if (body.useMyVoice === true) {
      try {
        const { user } = await authedClientFromRequest(req);
        const model = await getUserVoiceModel(user?.id ?? DEMO_VOICE_USER_ID);
        if (model) {
          const converted = await convertSongWithRvc(ttsUrl, model.modelUrl);
          if (converted) audioUrl = converted;
        }
      } catch {
        /* keep the TTS voice */
      }
    }
  }

  // kind:'film' → multi-shot video master needs the VIDEO-INPUT engine (sync/lipsync-2),
  // not the talking-photo engines. Falls back to null → caller keeps the un-synced master.
  if (body.kind === 'film') {
    const jobId = await filmLipsyncCreate(videoUrl, audioUrl);
    return NextResponse.json({ jobId });
  }
  // forceSadTalker → skip HeyGen (the client sets this on a retry after a HeyGen job failed).
  // orientation → HeyGen output dimension (the avatar panel's Format selector).
  const orientation = body.orientation === 'landscape' ? 'landscape' : body.orientation === 'square' ? 'square' : body.orientation === 'vertical' ? 'vertical' : undefined;
  const jobId = await lipsyncCreate(videoUrl, audioUrl, { skipHeygen: body.forceSadTalker === true, ...(orientation ? { orientation } : {}) });
  return NextResponse.json({ jobId });
}
