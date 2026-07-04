/**
 * POST /api/video/remix — edit an EXISTING (user-uploaded) video.
 *
 * One route, one `op` discriminator, so the Video Remix panel can run any of:
 *   trim       — cut a window out of the clip (ffmpeg)
 *   captions   — burn a title / caption lower-third onto it (ffmpeg overlay)
 *   voiceover  — synthesize AI narration and mix it under the audio (ffmpeg)
 *   music      — lay an uploaded track over the video (replace or duck-mix)
 *   redub      — lip-sync the speaker to new TTS text or an uploaded track (Wav2Lip)
 *   restyle    — re-imagine the look: keyframe → image restyle → i2v re-animate
 *   character  — replace / insert a character: keyframe → character swap → i2v
 *
 * Every op is STRICTLY fail-open: a miss returns { url: null, error } and the
 * client keeps the original. The actual wallet charge is unchanged (the client
 * shows the credit toast); this route just produces the edited media URL.
 *
 * Request: { op, videoUrl, ... per-op params }   Response: { url, error? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { trimClip } from '@/lib/video/trimClip';
import { muxAudioOntoVideo, extractFrame, kenBurnsClip, klingI2v, colorGrade, changeSpeed, changeSpeedRamp, stabilizeClip, roopFaceSwapVideo, fitImageToAspect, type GradeStyle } from '@/lib/video/remixOps';
import { overlayMasterUrl } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { georgianVoiceId } from '@/lib/audio/georgian-voice';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { filmLipsyncCreate, lipsyncFetch } from '@/lib/ai/lipsync';
import { reSignIfInternal, createSignedAssetUrl, uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { composeElevenLabsMusic, hasElevenLabsMusicKey } from '@/lib/elevenlabs/music';
import { generateMusic } from '@/lib/ai/replicate';
import { validateAdImageMeta, base64ByteLength } from '@/lib/ads/adInputValidation';
import { checkAdBudget } from '@/lib/ads/adBudgetGuard';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/chat/filmComposite';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { CREDIT_COSTS } from '@/lib/credits/pricing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 600s: roop video face-swap (the character op's primary path) can run several minutes on
// longer clips; the other ops finish in seconds. Bounded under Vercel's ceiling.
export const maxDuration = 600;

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';
type Aspect = '9:16' | '16:9' | '1:1';
type Gender = 'male' | 'female';

/** Resolve a client media ref (https / bare storage path) to a fetchable https URL. */
async function resolveMedia(v: unknown): Promise<string | null> {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 4000) return null;
  if (/^https:\/\//i.test(s)) return reSignIfInternal(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // reject data:/other schemes
  return createSignedAssetUrl(UPLOAD_BUCKET, s, 3600);
}

const ok = (url: string | null, extra: Record<string, unknown> = {}) => NextResponse.json({ url, ...extra });
const fail = (error: string) => NextResponse.json({ url: null, error });

// Lip-sync (Wav2Lip) create + bounded poll — the redub op's engine.
async function runLipsync(videoUrl: string, audioUrl: string): Promise<string | null> {
  // Redub lip-syncs an existing VIDEO master to new audio. SadTalker/HeyGen
  // (lipsyncCreate) are TALKING-PHOTO engines — they take a still IMAGE, so feeding
  // them a video silently fails ("Lip-sync is unavailable right now"). The correct
  // engine for a video→audio relip is sync/lipsync-2 (filmLipsyncCreate), which takes
  // { video, audio }. lipsyncFetch already polls its "sync:<id>" jobs.
  const id = await filmLipsyncCreate(videoUrl, audioUrl).catch(() => null);
  if (!id) return null;
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4_000));
    const s = await lipsyncFetch(id).catch(() => null);
    if (!s) continue;
    if (s.status === 'succeeded' && s.url) return s.url;
    if (s.status === 'failed' || s.status === 'canceled') return null;
  }
  return null;
}

// FIX 3 — preset-appropriate background score for a SINGLE-clip product ad, hosted to a
// fetchable URL. (Multi-clip ads already get a music bed from /api/video/assemble.)
// ElevenLabs Music (instrumental) → MusicGen fallback → null (caller keeps it silent).
const AD_MUSIC_PROMPTS: Record<string, string> = {
  splash: 'upbeat fresh energetic commercial pop, bright clean percussion, product advert bed',
  epic: 'dramatic cinematic orchestral trailer music, powerful epic build, brass and drums',
  luxury: 'elegant sophisticated ambient electronic, premium smooth refined, luxury brand bed',
  nature: 'warm acoustic organic uplifting, calm fresh natural, soft guitar and strings',
};
async function presetAdMusicUrl(presetKey: string, lengthSec = 8): Promise<string | null> {
  const prompt = AD_MUSIC_PROMPTS[presetKey] ?? AD_MUSIC_PROMPTS.luxury!;
  if (hasElevenLabsMusicKey()) {
    try {
      const { audio, contentType } = await composeElevenLabsMusic({ prompt, lengthMs: lengthSec * 1000, instrumental: true });
      const path = `productad-music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
      const url = await uploadAndSign(UPLOAD_BUCKET, path, audio.toString('base64'), contentType, 604800);
      if (url) return url;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[video/remix] productad EL music failed → MusicGen:', e instanceof Error ? e.message : e);
    }
  }
  try {
    const score = await generateMusic(prompt, lengthSec);
    return score.audioUrl ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Accept both the panel's op names AND the chat-intent (Claude) op names.
  const OP_ALIASES: Record<string, string> = {
    add_music: 'music', face_swap: 'character', character_swap: 'character', add_text_overlay: 'captions', add_subtitles: 'captions',
  };
  // Accept both shapes: { op, grade, text, … } (the client) AND { operation, params:{…} }.
  const rawOp = String(body.op || body.operation || '').trim();
  const op = OP_ALIASES[rawOp] ?? rawOp;
  const p = (body.params && typeof body.params === 'object') ? body.params as Record<string, unknown> : {};
  // Flatten common params so per-op reads can fall back to params.* transparently.
  if (body.grade === undefined && (p.style ?? p.grade) !== undefined) body.grade = p.style ?? p.grade;
  if (body.text === undefined && p.text !== undefined) body.text = p.text;
  if (body.speed === undefined && p.speed !== undefined) body.speed = p.speed;
  if (body.startSec === undefined && p.startSec !== undefined) body.startSec = p.startSec;
  if (body.durationSec === undefined && p.durationSec !== undefined) body.durationSec = p.durationSec;
  if (body.aspect === undefined && p.aspect !== undefined) body.aspect = p.aspect;
  // character_swap identity photo + speed_ramp factor (flattened from params.*).
  if (body.characterRef === undefined && p.characterRef !== undefined) body.characterRef = p.characterRef;
  if (body.factor === undefined && p.factor !== undefined) body.factor = p.factor;

  // AUTH + CREDIT GATE (audit HIGH): remix reached paid providers with NO auth or credit
  // check — an anonymous free bypass. Paid ops now REQUIRE a signed-in user; the standard
  // paid edits debit CREDIT_COSTS.remix_video up front (matching the client's on-submit credit
  // toast). Free local ffmpeg ops (trim/captions/color_grade/speed/stabilize) are untouched.
  // productad ALSO debits now (audit: it reached paid Kling with zero server-side charge) — see
  // the once-per-ad gate below; it keeps its opt-in ad-budget guard (checkAdBudget) on top.
  const PAID_REMIX_OPS = new Set(['voiceover', 'music', 'redub', 'restyle', 'character', 'background_remove', 'productad']);
  const CREDIT_CHARGED_OPS = new Set(['voiceover', 'music', 'redub', 'restyle', 'character', 'background_remove', 'productad']);
  const { user: remixUser } = await authedClientFromRequest(req);
  const remixUid = remixUser?.id ?? null;
  // Transaction context for compensation logging (the client's tray jobId when present).
  const jobId = typeof body.jobId === 'string' ? body.jobId.slice(0, 120) : null;
  if (PAID_REMIX_OPS.has(op) && !remixUid) {
    return NextResponse.json({ url: null, error: 'Sign in to use this edit.', authRequired: true }, { status: 401 });
  }
  // ONCE-PER-AD BILLING: a product ad fires ONE /api/video/remix call PER CLIP (a 60s ad = up to 12
  // genClip calls, sceneIndex 0..n-1; a single 6s ad has no sceneIndex). Charge the ad EXACTLY ONCE
  // — on its primary clip (single-clip / clip 0) — so a multi-clip ad is billed PER-AD (one
  // remix_video, matching the client's single credit toast), NOT 12× per clip. Secondary clips
  // (sceneIndex >= 1) skip the debit; each is its own request with charged=false → nothing to refund.
  const productAdSecondaryClip = op === 'productad'
    && Number.isFinite(Number(body.sceneIndex)) && Math.floor(Number(body.sceneIndex)) >= 1;
  // CRITICAL BILLING FIX — scope the idempotency ref PER-TRANSACTION. The deduct_credits RPC
  // dedupes GLOBALLY on (user_id, metadata->>'ref') with no time window; a per-OP ref
  // (`remix:${op}`) meant a user's SECOND ad/swap matched the FIRST ledger row and was silently
  // NOT charged (revenue loss). Bind the ref to the client's jobId — all clips of one product ad
  // share it, so a retry of the primary clip still dedupes, while a brand-new job → new ref →
  // correctly charges. Fall back to a fresh uuid when no jobId is supplied (still fixes the
  // under-charge; that path just isn't retry-idempotent, which is safe — none of these auto-retry).
  const txnRef = `remix:${op}:${jobId ?? crypto.randomUUID()}`;
  // Did we actually take an up-front credit off the wallet? (Only then must a downstream miss
  // REFUND it.) Admins + productad secondary clips are never charged here.
  let charged = false;
  if (CREDIT_CHARGED_OPS.has(op) && !productAdSecondaryClip && remixUid && !(await isAdminUser(remixUid))) {
    const debit = await deductCredits(remixUid, CREDIT_COSTS.remix_video, txnRef);
    if (!debit.ok && (debit.reason === 'insufficient' || debit.reason === 'error')) {
      const message = debit.reason === 'insufficient'
        ? 'Not enough credits for this edit. Top up to continue.'
        : 'Credit ledger unavailable — please retry.';
      return NextResponse.json({ url: null, error: message, topUpNeeded: debit.reason === 'insufficient' }, { status: 402 });
    }
    charged = debit.ok; // a 'skipped' ledger (no RPC) also leaves charged=false → nothing to refund
  }

  // ── BILLING SAGA COMPENSATION ────────────────────────────────────────────────
  // The credit is debited UP FRONT (above), but the heavy roop/kling render below can
  // still fail, time out, or throw. Without a refund the user pays for nothing (the
  // audit's lost-credit edge). `refundCharge` restores the exact debit on ANY downstream
  // miss — idempotent (refunds at most once), and a refund that itself fails (e.g. Postgres
  // write-lock / RPC cliff) is logged LOUDLY with the op + uid + jobId so ops can reconcile
  // a stranded charge from the logs. Fail-open: a refund miss never changes the response.
  let refunded = false;
  const refundCharge = async (why: string): Promise<void> => {
    if (!charged || refunded || !remixUid) return;
    refunded = true;
    try {
      const r = await refundCredits(remixUid, CREDIT_COSTS.remix_video, `${txnRef}:refund:${why}`);
      if (!r.ok) {
        // eslint-disable-next-line no-console
        console.error(`[video/remix] REFUND FAILED op=${op} uid=${remixUid} jobId=${jobId ?? '-'} why=${why} reason=${r.reason} — ${CREDIT_COSTS.remix_video} credit(s) may be STRANDED, manual reconcile needed`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[video/remix] REFUND THREW op=${op} uid=${remixUid} jobId=${jobId ?? '-'} why=${why}:`, e instanceof Error ? e.message : e);
    }
  };
  /** Refund the up-front charge (if any) then return the standard failure body. */
  const failRefund = async (error: string, why = 'render-miss'): Promise<NextResponse> => {
    await refundCharge(why);
    return fail(error);
  };

  // PHASE 2 L1 — Product-Ad: a PHOTO (not a source video) → commercial i2v clip.
  // Branches BEFORE the videoUrl guard: there is no source video; the product photo
  // is the Kling start_image (locked foreground) and a preset drives the environment.
  if (op === 'productad') {
    try {
      const aspectP: Aspect = body.aspect === '16:9' || body.aspect === '1:1' ? body.aspect : '9:16';
      const img = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
      // STEP 2.1 — server-authoritative ad-image guard for a data:image payload
      // (jpeg/png/webp, ≤10MB). This is the real ad path (images arrive as data URLs,
      // bypassing /api/upload), so the strict marketing profile is enforced HERE too.
      if (/^data:/i.test(img)) {
        const mt = img.match(/^data:([^;,]+)[;,]/);
        const b64 = img.includes(',') ? img.split(',')[1] ?? '' : '';
        const v = validateAdImageMeta({ contentType: mt?.[1] ?? '', sizeBytes: base64ByteLength(b64) });
        if (!v.ok) { await refundCharge('bad-image'); return NextResponse.json({ url: null, error: v.error }, { status: /too large/i.test(v.error) ? 413 : 415 }); }
      }
      // klingI2v/Replicate accepts a data:image URL directly; an https path is re-signed.
      const startImgRaw = /^data:image\//i.test(img) ? img : await resolveMedia(img);
      // STEP 2.6 — pre-fit a product image to the target aspect so Kling i2v (output ratio =
      // start-image ratio) renders NATIVE 9:16, not a square that later needs letterboxing.
      const startImg = startImgRaw && /^data:image\//i.test(startImgRaw)
        ? await fitImageToAspect(startImgRaw, aspectP)
        : startImgRaw;
      if (!startImg) return failRefund('Add a product photo.', 'no-photo');
      // Per-preset visual STYLE (the look) + per-scene ACTIONS (the multi-clip arc).
      // Single-clip (no sceneIndex) → just the style. Multi-clip (sceneIndex set) →
      // a distinct scene action prepended, cycled, so a 30/60s ad reads as a sequence
      // rather than the same shot N times. Same product photo anchors every clip.
      const PRESETS: Record<string, string> = {
        splash: 'glossy studio reflections, photorealistic water commercial',
        epic: 'volumetric smoke, dramatic moody lighting, premium cinematic commercial',
        luxury: 'floating gold particles, elegant neon ambient glow, soft reflections, high-end commercial',
        nature: 'warm sun rays, stone and wood textures, fresh outdoor organic commercial',
      };
      const PRESET_SCENES: Record<string, string[]> = {
        splash: ['dynamic water splashing around the product, droplets frozen mid-air in slow motion', 'close-up of droplets sliding down the product surface', 'wide splash burst with the product centered', 'slow-motion ripples and spray around the product', 'final clean reveal as the water settles'],
        epic: ['slow dolly push-in through volumetric smoke toward the product', 'low-angle hero shot with dramatic rim light', 'controlled orbit around the product, moody lighting', 'smoke swirls part to reveal the product', 'final epic crane pull-back reveal'],
        luxury: ['product rotating slowly as gold particles appear', 'elegant close-up detail shot with soft lighting', 'wide shot of the product in a luxury environment', 'product centered with particles swirling around it', 'final brand-aesthetic reveal'],
        nature: ['sun rays over the product as leaves drift past', 'close-up on natural stone and wood textures beside the product', 'wide organic environment with a soft breeze', 'dappled light moving across the product', 'final fresh golden-hour reveal'],
      };
      const presetKey = String(body.preset || 'luxury');
      const style = PRESETS[presetKey] ?? PRESETS.luxury!;
      const scenes = PRESET_SCENES[presetKey] ?? PRESET_SCENES.luxury!;
      const sceneIdx = Number.isFinite(Number(body.sceneIndex)) ? Math.max(0, Math.floor(Number(body.sceneIndex))) : -1;
      // STEP 2.5 — OPT-IN server-side budget cap, checked HERE (the spend point) before the
      // paid Kling call. Activated only when a cap is supplied (request `budgetCapUsd` or env
      // AD_SESSION_BUDGET_CAP_USD), so production ads are unaffected; it guards the 2.6 paid
      // test. Over-budget (or a single scene above the cap) → 402 top-up, never spends.
      const capUsd = Number(body.budgetCapUsd) || Number(process.env.AD_SESSION_BUDGET_CAP_USD) || 0;
      if (capUsd > 0) {
        const adScenes = Number.isFinite(Number(body.sceneCount))
          ? Math.max(1, Math.floor(Number(body.sceneCount)))
          : sceneIdx >= 0 ? sceneIdx + 1 : 1;
        const budget = checkAdBudget({ scenes: adScenes, withTts: false, withMusic: sceneIdx < 0 && body.noMusic !== true }, { capUsd });
        if (!budget.ok) { await refundCharge('over-budget'); return NextResponse.json({ url: null, error: budget.message, topUpNeeded: true }, { status: 402 }); }
      }
      const motion = sceneIdx >= 0 ? `${scenes[sceneIdx % scenes.length]}, ${style}` : `the product as the hero, ${style}`;
      // Premium i2v if a Replicate token is set, else a guaranteed Ken-Burns fallback.
      const url = (await klingI2v(startImg, `${motion}, the product stays sharp and centered, photorealistic, 4k`, aspectP)) || (await kenBurnsClip(startImg, 5, aspectP));
      if (!url) return failRefund('Product ad generation failed.', 'render-null');
      // FIX 3 — SINGLE-clip ads (sceneIdx < 0) come back silent; lay a preset score
      // under them so the 6s ad isn't mute. Multi-clip (sceneIdx >= 0) skips this — the
      // assemble pipeline scores the stitched master, so per-clip music would clash.
      // `noMusic` ALSO skips it: the caller (Product-Ad with a voiceover/overlay) sends
      // this clip straight to /api/video/assemble, which scores + dubs + overlays in one
      // pass — baking music here would only be replaced and waste a MusicGen call.
      // Fail-open: any music miss returns the (silent) clip — still a working ad.
      if (sceneIdx < 0 && body.noMusic !== true) {
        const music = await presetAdMusicUrl(presetKey, 8);
        if (music) {
          const scored = await muxAudioOntoVideo(url, music, 'replace', 12);
          if (scored) return ok(scored, { engine: 'Kling AI', music: true });
        }
        return ok(url, { engine: 'Kling AI', music: false });
      }
      return ok(url, { engine: 'Kling AI' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[video/remix] productad', err instanceof Error ? err.message : err);
      return failRefund('Product ad generation failed.', 'render-error');
    }
  }

  const videoUrl = await resolveMedia(body.videoUrl);
  if (!videoUrl) return fail('A video is required.');

  const aspect: Aspect = body.aspect === '16:9' || body.aspect === '1:1' ? body.aspect : '9:16';
  const gender: Gender = body.gender === 'male' ? 'male' : 'female';
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1500) : '';

  try {
    switch (op) {
      case 'trim': {
        const startSec = Number.isFinite(Number(body.startSec)) ? Math.max(0, Number(body.startSec)) : 0;
        const durationSec = Number.isFinite(Number(body.durationSec)) && Number(body.durationSec) > 0 ? Number(body.durationSec) : 5;
        const url = await trimClip(videoUrl, startSec, durationSec);
        return url ? ok(url) : fail('Trim failed.');
      }

      case 'captions': {
        if (!text) return fail('Add caption text.');
        const cta = typeof body.cta === 'string' ? body.cta.trim().slice(0, 80) : undefined;
        const url = await overlayMasterUrl(videoUrl, { overlayText: text, ...(cta ? { cta } : {}) });
        return url ? ok(url) : fail('Caption burn failed.');
      }

      case 'voiceover': {
        if (!text) return failRefund('Add the narration text.', 'no-text');
        const vo = await textToHostedSpeech(text, georgianVoiceId(gender));
        if (!vo) return failRefund('Voice synthesis is unavailable.');
        const url = await muxAudioOntoVideo(videoUrl, vo, 'mix', 12);
        return url ? ok(url) : failRefund('Mixing the voice-over failed.');
      }

      case 'music': {
        const audioUrl = await resolveMedia(body.audioUrl);
        if (!audioUrl) return failRefund('Add a music track.', 'no-track');
        const replace = body.mix !== true; // default: replace the original audio
        const url = await muxAudioOntoVideo(videoUrl, audioUrl, replace ? 'replace' : 'mix', 12);
        return url ? ok(url) : failRefund('Adding the music failed.');
      }

      case 'redub': {
        // Audio source: synthesized from text in the chosen voice, or an upload.
        const uploaded = await resolveMedia(body.audioUrl);
        const audioUrl = uploaded || (text ? await textToHostedSpeech(text, georgianVoiceId(gender)) : null);
        if (!audioUrl) return failRefund('Add redub text or an audio track.', 'no-audio');
        const url = await runLipsync(videoUrl, audioUrl);
        return url ? ok(url) : failRefund('Lip-sync is unavailable right now.');
      }

      case 'color_grade': {
        const g = String(body.grade ?? '');
        const grade = (['vintage', 'neon', 'noir', 'dramatic'].includes(g) ? g : 'cinematic') as GradeStyle;
        const url = await colorGrade(videoUrl, grade);
        return url ? ok(url) : fail('Color grade failed.');
      }

      case 'speed_change': {
        const speed = Number.isFinite(Number(body.speed)) && Number(body.speed) > 0 ? Number(body.speed) : 2;
        const url = await changeSpeed(videoUrl, speed);
        return url ? ok(url) : fail('სიჩქარის შეცვლა ვერ მოხერხდა.');
      }

      case 'speed_ramp': {
        // Cinematic slow-in / slow-out ramp (video-only). `factor` = how much the ends slow.
        const factor = Number.isFinite(Number(body.factor)) && Number(body.factor) > 1 ? Number(body.factor) : 1.5;
        const url = await changeSpeedRamp(videoUrl, factor);
        return url ? ok(url) : fail('სიჩქარის რემპი ვერ მოხერხდა.');
      }

      case 'stabilize': {
        // vidstab two-pass; fail-open keeps the original if stabilization can't run.
        const url = await stabilizeClip(videoUrl);
        return url ? ok(url) : fail('ვიდეოს სტაბილიზაცია ვერ მოხერხდა.');
      }

      case 'restyle':
      case 'character':
      case 'background_remove': {
        // Anchor frame → image model (restyle / character swap / bg removal) → re-animate.
        const frame = await extractFrame(videoUrl, 0.5);
        if (!frame) return failRefund('ვიდეოდან კადრის წაკითხვა ვერ მოხერხდა.', 'frame-read');
        // TASK 1 — character swap with an UPLOADED PHOTO.
        const swapPhoto = op === 'character' ? await resolveMedia(body.characterRef) : null;
        // PRIMARY (closer-to-source): roop video face-swap — the SAME video with the face
        // replaced throughout, motion preserved. Tried first when a swap photo is present;
        // on any miss we fall through to the keyframe-regenerate path below (a fresh ~5s clip
        // seeded by one frame — Kling is i2v-only, so that path can't preserve motion).
        if (op === 'character' && swapPhoto) {
          const swapped = await roopFaceSwapVideo(videoUrl, swapPhoto);
          if (swapped) return ok(swapped, { method: 'faceswap' });
        }
        const editPrompt =
          op === 'restyle'
            ? `Restyle this exact scene: ${text || 'cinematic, film-grade color grade'}. Keep the composition and subjects, change only the visual style.`
            : op === 'background_remove'
              ? `Remove the background behind the subject and replace it with ${text || 'a clean, plain neutral studio backdrop'}. Keep the subject exactly as-is.`
              : `${text || 'replace the main character with a new person'}. Keep the background, framing and lighting; change the character${swapPhoto ? ' to the reference person, preserving their face and identity' : ' to match this description'}.`;
        const styled = await generateNanoBananaImage({
          prompt: editPrompt,
          referenceImageDataUrl: frame,
          aspectRatio: aspect,
        }).catch(() => null);
        const startImage = styled?.url || frame;
        const motionPrompt = op === 'restyle' ? (text || 'cinematic motion') : (text || 'natural character motion');
        // Premium i2v if a token is set, else a guaranteed Ken-Burns animation so the
        // user ALWAYS gets a moving, restyled clip. The swap photo (if any) rides along as
        // the kling identity reference.
        const url = (await klingI2v(startImage, motionPrompt, aspect, swapPhoto ? [swapPhoto] : undefined)) || (await kenBurnsClip(startImage, 5, aspect));
        return url ? ok(url, { still: styled?.url ?? null }) : failRefund(op === 'character' ? 'პერსონაჟის შეცვლა ვერ მოხერხდა.' : 'რესტაილი ვერ მოხერხდა.');
      }

      default:
        // Unknown op AFTER a debit (a charged alias that fell through) still refunds.
        return failRefund(`უცნობი ოპერაცია: ${op || '(none)'}`, 'unknown-op');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[video/remix]', op, err instanceof Error ? err.message : err);
    // A downstream throw (roop/kling/ffmpeg exception, timeout abort) refunds the up-front charge.
    return failRefund('The remix could not be completed.', 'exception');
  }
}
