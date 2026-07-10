/**
 * lib/chat/filmComposite.ts
 * =========================
 * PHASE 42 §1 — The "30-Second Film" Master Agent fan-out (server side).
 *
 * Where `musicVideoComposite` fans a brief into lyrics + one 30s clip, the film
 * pipeline runs a full production studio:
 *
 *   1. Storyboard Agent   → `planFilmScenes` splits the brief into 6 sequential
 *                           5-second scenes (deterministic, continuity-locked).
 *   2. Continuity + Video → 6 LTX clips rendered with the SAME seed + character
 *                           reference so the protagonist never mutates.
 *   3. Editor Agent       → hard-cut the 6 clips into one EXACTLY-30s stream.
 *   4. Audio / Foley      → bind one cohesive track / voiceover across the film.
 *
 * Every leg is env-gated and degrades gracefully — a missing provider key skips
 * that leg rather than failing the request. Each render leg is wrapped in
 * `withTrace` so wholesale + retail GEL land in agent_evolution_traces, and a
 * wallet pre-flight blocks runaway spend before any clip is dispatched.
 *
 * Polling limitation (intentional, documented for follow-up — mirrors the
 * music-video composite): the chat shell follows ONE predictionId at a time.
 * This handler tracks the first clip's taskRef as the primary tracker and
 * publishes the full per-leg status matrix in `metadata.film`, which the client
 * renders as the progressive agent timeline. A future poll codec can decode all
 * five clip refs + the stitch/audio legs and report union status in lock-step.
 */

import 'server-only';
import { hasVideoProvider, videoProviderUnavailableMessage, videoProviderConnectionFailedMessage } from './videoProvider';
import type { OrchestratorInput, ChatResponse } from './providerRouter';
import { withTrace } from '@/lib/observability/agentTrace';
import { forecastMarginForAction } from '@/lib/monetization/audit-engine';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { creditWalletGel, getOnboardingState } from '@/lib/billing/wallet-ledger';
import { isAdminEmail } from '@/lib/auth/adminGuard';
import { hasElevenLabsMusicKey } from '@/lib/elevenlabs/music';
import { PipelineTimer } from '@/lib/pipeline/timing';
import { selectClipVideoModel } from '@/lib/pipeline/modelSelection';
import { generateAnchorFrame } from '@/lib/pipeline/anchorFrame';
import { ServiceManager } from './ServiceManager';
import { encodeFilmRef } from './filmTaskRef';
import { generateFilmVoiceover, generateDialogueVoiceover, generateDialogueStems, dialogueStemsViable, wantsCommentary, generateFilmSfx, type DialogueStem } from './filmVoiceover';
import { parseMasterScript, masterDialogueTurns } from '@/lib/pipeline/script/masterScript';
import {
  planFilmScenes,
  buildFilmClipRequest,
  normalizeReferenceImages,
  splitStructuredScript,
  FILM_SCENE_COUNT,
  FILM_CLIP_SEC,
  type FilmScene,
  type FilmShared,
} from './filmPipeline';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import {
  MAX_CLIP_DISPATCH_ATTEMPTS,
  clipDispatchConcurrency,
  clipDispatchJitterMs,
  clipRetryBackoffMs,
  mapWithConcurrency,
} from './filmClipRetry';
import { filmBalanceDecision } from './filmBalanceGate';
import { visionQaEnabled, qaHealKeyframes } from '@/lib/pipeline/quality/scene-qa';
import { runPromptAgent, type MasterFilmSfxCue } from './promptAgent';

const serviceManager = new ServiceManager();

// v330 — buildMusicRequest (the Udio request builder) was removed with the Udio
// retirement. Music is now generated at the assemble step: ElevenLabs Music
// (buildElevenMusicPrompt in lib/elevenlabs/music.ts) primary, MusicGen fallback.

export { isThirtySecondFilm } from './filmPipeline';

type LegStatus = 'succeeded' | 'queued' | 'failed' | 'skipped' | 'pending';

interface FilmClipResult {
  ordinal: number;
  taskRef: string | null;
  status: LegStatus;
  /** PHASE 43 §3 — dispatch attempts made (1 = first try, >1 = retried). */
  attempts: number;
  /**
   * True once a wallet debit was actually issued for this leg. withTrace debits
   * the moment its inner call RESOLVES (trace status 'succeeded') — which happens
   * even when the provider accepted the request but returned no usable taskRef (a
   * soft upstream failure). So a clip can be `failed` yet still have been charged.
   * We track this so a total scene-synthesis failure can atomically refund exactly
   * the legs that were billed — never more, never less.
   */
  debited: boolean;
  /** Last upstream failure reason (e.g. the Replicate create status) when failed. */
  error?: string;
}

interface FilmPlanSummary {
  sceneCount: number;
  seed: number;
  storyboard: LegStatus;
  clips: { ordinal: number; status: LegStatus; url: string | null; attempts: number }[];
  stitch: LegStatus;
  audio: LegStatus;
  audioUrl: string | null;
  /** True once every non-skipped clip has landed and the editor can stitch. */
  readyToStitch: boolean;
  musicWorkId: string | null;
  /** PHASE 48 §2 — commentator/narration track (resolved at dispatch, may be null). */
  voiceUrl: string | null;
  /** PHASE 49 §7 — cinematic SFX / sound-design track (resolved at dispatch). */
  sfxUrl: string | null;
}

/** Narrow a dispatch-time LegStatus to the token's clip status union. */
function clipDispatchStatus(s: LegStatus): 'queued' | 'failed' | 'skipped' | 'pending' {
  return s === 'succeeded' ? 'queued' : s;
}

interface ForecastResult {
  totalRetailGel: number;
  totalWholesaleGel: number;
  marginMultiplier: number | null;
}

/** chat (storyboard) + N×video_film (clips) + voice_tts (audio track). */
function forecastFilm(sceneCount: number): ForecastResult {
  const storyboard = forecastMarginForAction('chat');
  const clip = forecastMarginForAction('video_film');
  const audio = forecastMarginForAction('voice_tts');
  const totalRetail = storyboard.retailGel + clip.retailGel * sceneCount + audio.retailGel;
  const totalWholesale = storyboard.wholesaleGel + clip.wholesaleGel * sceneCount + audio.wholesaleGel;
  return {
    totalRetailGel: totalRetail,
    totalWholesaleGel: totalWholesale,
    marginMultiplier: totalWholesale > 0 ? totalRetail / totalWholesale : null,
  };
}

/**
 * Read the user's wallet balance in GEL.
 *  • `null`  → balance is UNKNOWN (DB error / missing table / client unconfigured).
 *  • `0`     → query SUCCEEDED with no credits row: a CONFIRMED zero balance.
 *  • `>0`    → the stored balance.
 *
 * The null-vs-0 distinction is load-bearing: previously a no-row user returned
 * `null`, the gate skipped, and an unpayable render dispatched anyway — stranding
 * the user on a 0/5 spinner that the funded stitch step could never deliver. A
 * genuine query error still returns null so the gate fails OPEN (an infra blip
 * must not lock paying users out; per-leg debit + rollback still protect spend).
 */
async function readWalletBalanceGel(userId: string): Promise<number | null> {
  try {
    const supabase = createServiceRoleClient();
    // BALANCE OF RECORD = profiles.credits_balance — what Stripe/BOG top-ups credit
    // (creditWalletGel → credit_wallet_gel RPC) AND what /api/credits/balance shows AND
    // what the per-leg deduct_credits charges. The legacy `credits.balance_gel` was
    // backfilled ONCE and never resynced, so a funded user with no `credits` row read 0
    // here → film wrongly blocked despite funds (the "balance exists but won't generate"
    // bug). Read the real wallet. Per-leg debit + atomic rollback stay the true spend guard.
    const { data, error } = await supabase
      .from('profiles')
      .select('credits_balance')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null; // unknown → fail open
    if (!data) return 0; // no profile row == zero balance
    const num = Number(data.credits_balance ?? 0);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

/**
 * Founder/admin bypass: a platform admin (allowlisted email in lib/auth/adminGuard
 * — the founder's address is built-in, no env needed) tests renders on the
 * platform's own provider budget, so the wallet pre-flight must not block them
 * (the very "founder/promo FREE film" case the gate below already anticipates).
 * Self-contained: looks the email up by userId via the service role, fail-closed
 * (any error → not admin → the normal gate runs, so non-admins are unaffected).
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    return !error && typeof email === 'string' ? isAdminEmail(email) : false;
  } catch {
    return false;
  }
}

// The up-front gate decision is a pure, dependency-free helper (see
// ./filmBalanceGate) so it can be unit-tested without filmComposite's heavy
// server imports. Re-exported for callers that import it from here.
export { filmBalanceDecision };

/**
 * PER-SCENE IDENTITY FRAME (NanoBanana → LTX-2). Stylize the user's uploaded
 * selfie into THIS scene's exact composition + camera framing as a photorealistic
 * cinematic still, then hand that hosted frame to LTX-2 as the image-to-video
 * anchor — so the protagonist IS the uploaded person, shot-to-shot, instead of a
 * freshly-invented character. NanoBanana returns a hosted https URL synchronously
 * (with a Replicate-FLUX fallback when out of credits).
 *
 * Best-effort by construction: returns null on any failure or after a hard 35s
 * cap, and the caller falls back to the raw reference (or text-to-video) so a
 * slow/failed frame never blocks or fails the clip.
 */
async function stylizeSceneFrame(
  input: OrchestratorInput,
  scene: FilmScene,
  shared: FilmShared,
): Promise<string | null> {
  // OFF by default. Live measurement showed per-scene NanoBanana frame
  // generation pushes the synchronous dispatch to ~200s (Gemini throttles the
  // concurrent image calls, so even Promise.all serialises behind the provider)
  // — that's near the route timeout and a terrible "dispatching" wait. Until
  // it's moved off the dispatch hot-path, the pipeline anchors LTX-2 directly to
  // the uploaded selfie (fast dispatch, identity still locked). Flip
  // FILM_STYLE_FRAMES=1 to re-enable the stylized-frame chain.
  if (process.env.FILM_STYLE_FRAMES !== '1') return null;
  const selfie = shared.referenceImages?.[0] ?? shared.avatarReference ?? null;
  if (!selfie) return null;
  const work = (async (): Promise<string | null> => {
    try {
      const framePrompt =
        `Cinematic film still. ${scene.prompt} Featuring the EXACT same person as the reference image — ` +
        `identical face, hair and wardrobe. Photorealistic, professional cinematic colour, 16:9 composition.`;
      const r = await serviceManager.execute({
        sessionId: input.sessionId,
        serviceContext: 'image',
        intent: 'image_generation',
        userPrompt: framePrompt,
        imageUrl: selfie,
        selectedOptions: { aspect: '16:9', aspectRatio: '16:9' },
        locale: input.locale,
      });
      return typeof r.assetUrl === 'string' && /^https?:\/\//i.test(r.assetUrl) ? r.assetUrl : null;
    } catch {
      return null;
    }
  })();
  return Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 35_000)),
  ]);
}

/** Dispatch a single film clip through ServiceManager/LTX, traced for cost. */
async function renderClip(
  input: OrchestratorInput,
  scene: FilmScene,
  shared: FilmShared,
  compositeId: string,
  forecastClipWholesale: number,
  forecastClipRetail: number,
  /** Pre-generated NanoBanana identity frame for THIS scene (null = none). */
  sceneFrame: string | null,
  /** True for a FREE film (promo) or founder/admin render → clip legs must NOT charge. */
  waiveClipBilling: boolean,
): Promise<FilmClipResult> {
  // Gate on the SAME predicate as the pipeline pre-flight (hasVideoProvider =
  // LTX OR Replicate). The runtime now renders via Replicate as a primary when no
  // LTX key is present (see ServiceManager.runLtxVideo), so this leg only skips
  // when NEITHER provider exists — which the door-level pre-flight already caught.
  // Using hasLtxApiKey() here would skip every clip on a Replicate-only config the
  // pre-flight had waved through, re-creating the ~38% silent-skip-after-spend trap.
  if (!hasVideoProvider()) {
    return { ordinal: scene.ordinal, taskRef: null, status: 'skipped', attempts: 0, debited: false };
  }

  // A debit is only ever issued by withTrace for a real, billable user with a
  // positive retail price. Track it locally so the orchestrator can refund this
  // exact leg if the whole film collapses.
  const realUser = Boolean(input.userId && input.userId !== 'anonymous');
  // A FREE film (promo slot) or founder/admin render must NOT charge per clip — the pre-flight
  // waives them, but the per-leg debit was still firing (promo not actually free; founder drained).
  const billable = realUser && forecastClipRetail > 0 && !waiveClipBilling;
  let debited = false;

  // PHASE 4A — preview-tier model gate: the premium i2v upgrade (Kling/Hailuo) is only
  // honored for a signed-in, non-preview render; anon trials + preview-quality renders
  // fall through to the cheap LTX default and never burn the premium budget.
  const clipModel = selectClipVideoModel({
    requested: typeof input.metadata?.videoModel === 'string' ? input.metadata.videoModel : null,
    isSignedIn: realUser,
    preview: input.metadata?.quality === 'preview',
  });

  // PHASE 58 — the clips dispatch through a bounded concurrency pool (see
  // CLIP_DISPATCH_CONCURRENCY) so at most a couple of createPrediction calls are
  // ever in flight at once — the live failure showed the provider throttling the
  // tail clips when all 5 fired together. On top of the pool, a tiny random
  // pre-dispatch jitter de-syncs the few legs that start in the same wave so they
  // don't issue their call on the exact same millisecond. Dispatch-only delay —
  // the renders still run fully in parallel on the provider.
  const dispatchJitter = clipDispatchJitterMs();
  if (dispatchJitter > 0) {
    await new Promise((resolve) => setTimeout(resolve, dispatchJitter));
  }

  // PER-SCENE IDENTITY FRAME — anchor LTX-2 to the pre-generated NanoBanana frame
  // for this scene (computed in PARALLEL before the fan-out, so 5 frames cost one
  // frame's latency, not five). Best-effort: a null frame leaves the raw
  // reference in place (buildFilmClipRequest already wired it).
  const clipReq = buildFilmClipRequest(scene, shared);
  if (sceneFrame) clipReq.selectedOptions.characterReference = sceneFrame;

  // PHASE 43 §3 / PHASE 58 — Isolated per-leg retry. We retry ONLY when a dispatch
  // fails to produce a provider job (throw or null taskRef); a successfully queued
  // clip is never re-dispatched (that would double-render + double-charge). The
  // shared `deductRef` keeps every attempt idempotent so a partial first attempt
  // can't double-bill the same scene. Siblings are untouched — one bad leg never
  // discards or re-runs the others. Between attempts we wait an exponentially
  // growing, jittered, ordinal-offset window (clipRetryBackoffMs) so the
  // last-dispatched legs don't retry straight back into the same rate-limit burst.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_CLIP_DISPATCH_ATTEMPTS; attempt++) {
    const backoff = clipRetryBackoffMs(attempt, scene.ordinal);
    if (backoff > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
    try {
      const taskRef = await withTrace(
        {
          userId: input.userId || null,
          agentId: 'video-agent',
          workerKind: 'ltx',
          action: 'generate_clip',
          promptSummary: clipReq.userPrompt,
          costWholesaleGel: forecastClipWholesale,
          costRetailGel: forecastClipRetail,
          metadata: { composite: true, leg: 'film-clip', ordinal: scene.ordinal, seed: scene.seed, attempt },
          deduct: true,
          deductRef: `${compositeId}:clip:${scene.ordinal}`,
        },
        () =>
          serviceManager.execute({
            sessionId: input.sessionId,
            serviceContext: 'video',
            intent: 'video_generation',
            userPrompt: clipReq.userPrompt,
            selectedOptions: clipReq.selectedOptions,
            locale: input.locale,
            // PHASE 2 L5 / 4A — per-render i2v model (Cinema panel Kling/Hailuo toggle),
            // gated by selectClipVideoModel so anon/preview renders stay on cheap LTX.
            ...(clipModel ? { videoModel: clipModel } : {}),
          }),
        (r) => r.predictionId || r.assetUrl || null,
      ).then((r) => r.predictionId || r.assetUrl || null);
      // The inner call resolved, so withTrace has issued the (idempotent) debit
      // for this leg — flag it even when no taskRef came back, so a downstream
      // total-failure rollback refunds exactly what was billed.
      if (billable) debited = true;
      if (taskRef) {
        return { ordinal: scene.ordinal, taskRef, status: 'queued', attempts: attempt, debited };
      }
      // No provider job materialised — treat as a soft failure and retry.
      lastErr = new Error('dispatch returned no task reference');
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line no-console
      console.warn(
        `[film] clip ${scene.ordinal} dispatch attempt ${attempt}/${MAX_CLIP_DISPATCH_ATTEMPTS} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  const failReason = lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'unknown');
  // eslint-disable-next-line no-console
  console.warn(`[film] clip ${scene.ordinal} exhausted retries:`, failReason);
  return { ordinal: scene.ordinal, taskRef: null, status: 'failed', attempts: MAX_CLIP_DISPATCH_ATTEMPTS, debited, error: failReason };
}

/**
 * Run the 30-second film pipeline. Returns a single ChatResponse to fit the
 * existing chat-shell contract; the full production matrix lives in
 * `metadata.film` for the progressive agent timeline.
 */
export async function handleFilmComposite(input: OrchestratorInput): Promise<ChatResponse> {
  const timer = new PipelineTimer('film'); // Phase 6A — stage timing → [film] logs
  // ── STRICT PRE-FLIGHT: video provider gate ─────────────────────────────────
  // Halt the ENTIRE pipeline at the door when no render provider is wired (no
  // LTX alias AND no Replicate failover token). This runs BEFORE the storyboard
  // engine (planFilmScenes), the wallet balance gate, and every per-leg credit
  // debit — so a missing infrastructure token can never burn a founder free-film
  // slot or a GEL charge, and never strands the user at the ~38% "Video skipped
  // (no provider)" mark. Returns a clean, localized, zero-cost failure instead.
  if (!hasVideoProvider()) {
    // eslint-disable-next-line no-console
    console.error('[film] aborted pre-storyboard: no video provider configured (LTX / Replicate both absent)');
    return {
      success: false,
      intent: 'video_generation',
      responseType: 'text',
      message: videoProviderUnavailableMessage(input.locale),
      metadata: {
        provider: 'composite',
        composite: true,
        providerUnavailable: true,
        // Names-only — surfaced for diagnostics, never a secret value.
        missingEnv: ['LTX2_API_KEY', 'REPLICATE_API_TOKEN'],
      },
    };
  }

  const opts = input.selectedOptions || {};
  const avatarReference =
    opts.avatarReference ||
    opts.characterReference ||
    (typeof input.metadata?.avatarUrl === 'string' ? input.metadata.avatarUrl : undefined) ||
    null;
  // FIX B — the Video-panel effect (Cinematic / Vintage / Neon …). Read from BOTH
  // selectedOptions AND metadata: the composer now threads it as metadata.style so it
  // reaches the CLIP prompts' style guide, not just the storyboard frames.
  const style =
    opts.style ||
    (typeof input.metadata?.style === 'string' ? input.metadata.style : null) ||
    null;
  // PHASE 2 L1 — user camera controls (video panel). Whitelisted; absent → the
  // storyboard's per-beat camera variety is unchanged (fully additive).
  const cameraMove = (() => {
    const v = input.metadata?.cameraMove;
    return v === 'pan_left' || v === 'pan_right' || v === 'zoom_in' || v === 'zoom_out' || v === 'tilt_up' || v === 'tilt_down' || v === 'auto' ? v : null;
  })();
  const motionIntensity = (() => {
    const n = Number(input.metadata?.motionIntensity);
    return Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(10, Math.round(n))) : null;
  })();
  // Frame orientation forwarded from the composer (Video mode 16:9 / 9:16) via
  // metadata. Drives the per-clip aspect ratio so the cut never changes shape.
  const orientation: 'landscape' | 'vertical' =
    input.metadata?.orientation === 'vertical' ? 'vertical' : 'landscape';
  // Approved LLM story scenes from the storyboard step — the clips render from
  // these exact scene descriptions (real story) instead of the deterministic beats.
  let sceneScripts = Array.isArray(input.metadata?.sceneScripts)
    ? (input.metadata.sceneScripts as unknown[]).map((s) => (typeof s === 'string' ? s : '')).filter(Boolean)
    : undefined;
  // DAY-6 — a pasted TIMECODED Master Production Script drives the STORYBOARD: its parsed SCENE sheets
  // (action lines, in order) become the per-scene prompts, so the film follows the script VISUALLY — not just
  // its audio (the narration + multi-voice dialogue legs already read metadata.masterScript below). Additive +
  // fail-open: only when the UI supplied no explicit sceneScripts AND the script parses to ≥2 scenes.
  if ((!sceneScripts || sceneScripts.length === 0) && typeof input.metadata?.masterScript === 'string' && input.metadata.masterScript.trim()) {
    const pm = parseMasterScript(input.metadata.masterScript);
    const fromMaster = pm.ok ? pm.scenes.map((s) => s.action.trim()).filter(Boolean).map((a) => a.slice(0, 2000)) : [];
    if (fromMaster.length >= 2) {
      sceneScripts = fromMaster.slice(0, 12); // bound to the pipeline's max segment count
      // eslint-disable-next-line no-console
      console.log(`[filmComposite] master-script storyboard: ${sceneScripts.length} scenes from parseMasterScript`);
    }
  }
  // FIX A — Prompt-Agent character LOCK. The storyboard step (which runs the Prompt
  // Agent) threads the locked appearance fragment here so every clip prompt asserts the
  // SAME protagonist. If it's absent (a direct render that skipped the storyboard), run
  // the Prompt Agent NOW as a fail-open fallback so the character is still locked.
  let characterLock =
    typeof input.metadata?.characterLock === 'string' && input.metadata.characterLock.trim()
      ? input.metadata.characterLock.trim()
      : null;
  // PHASE 2 L3 — per-scene SFX cues from the Prompt Agent (when it runs here as the
  // fallback). Used below to make the SFX bed scene-aware instead of one generic bed.
  let sfxCues: MasterFilmSfxCue[] | undefined;
  if (!characterLock && (!sceneScripts || sceneScripts.length === 0)) {
    // FIRST honour the user's OWN scenes: if the brief embeds an explicit
    // multi-scene script (an attached screenplay/shot-list), split it deterministically
    // — the render then follows the script exactly instead of losing it to a flaky/
    // timed-out LLM scene-writer (which fell back to the generic music-video orbit).
    const fromScript = splitStructuredScript(input.message, 12);
    if (fromScript && fromScript.length >= 2) {
      sceneScripts = fromScript;
      // eslint-disable-next-line no-console
      console.log(`[filmComposite] used ${fromScript.length} scenes from the attached structured script (no LLM)`);
    } else {
      const brief = await runPromptAgent({
        brief: input.message,
        mode: input.metadata?.musicVideoMode ? 'music_video' : 'documentary',
        sceneCount: FILM_SCENE_COUNT,
        length: FILM_SCENE_COUNT * FILM_CLIP_SEC,
        effect: style ?? 'Cinematic',
        language: input.locale,
      }).catch(() => null);
      if (brief) {
        characterLock = brief.character.imagePromptFragment;
        sceneScripts = brief.scenes.map((s) => s.imagePrompt);
        sfxCues = brief.sfxCues;
        // eslint-disable-next-line no-console
        console.log('[filmComposite] Prompt Agent fallback produced a locked character + scene prompts');
      }
    }
  }
  // PHASE 45 §2/§3 — accept 1–3 multimodal reference images from the composer.
  // They arrive either as a JSON string in selectedOptions or as an array on
  // metadata; planFilmScenes normalises/caps/dedupes them either way.
  const referenceImagesRaw =
    opts.referenceImages ??
    opts.characterReferences ??
    (input.metadata?.referenceImages as unknown) ??
    null;

  // CARD A FIX — HOST the reference images. The composer hands us 1-3 photos as
  // `data:image/...` URIs. The direct LTX endpoint (api.ltx.video) frequently
  // REJECTS a data URI for its `image` input, so the identity anchor was being
  // silently dropped (clips fell back to text-to-video → "it ignored my photo").
  // Upload each data URI to a signed https URL up-front so EVERY downstream clip
  // (direct LTX or Replicate) reliably ingests the subject. Fail-open per image:
  // an upload miss keeps the original ref, so a storage hiccup never fails the
  // film. https refs pass through untouched.
  const refList = normalizeReferenceImages(referenceImagesRaw);
  let hostedRefs: string[] = refList;
  if (refList.length > 0) {
    hostedRefs = await Promise.all(
      refList.map(async (ref, i) => {
        if (!ref.startsWith('data:')) return ref; // already an https/asset URL
        try {
          const m = ref.match(/^data:([^;,]+)[;,]/);
          const mime = (m?.[1] || 'image/jpeg').toLowerCase();
          const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
          const b64 = ref.includes(',') ? ref.split(',')[1] ?? '' : '';
          const path = `${input.userId || 'anon'}/film-ref/${Date.now()}-${i}.${ext}`;
          const url = await uploadAndSign('uploads', path, b64, mime, 7200);
          return url || ref; // fail-open → keep the data URI
        } catch {
          return ref;
        }
      }),
    );
  }
  const hostedCount = hostedRefs.filter((r) => /^https?:\/\//i.test(r)).length;
  // eslint-disable-next-line no-console
  console.log('[filmComposite] reference images', { received: refList.length, hostedHttps: hostedCount });

  const plan = planFilmScenes(input.message, { avatarReference, referenceImages: hostedRefs, style, orientation, musicVideo: !!input.metadata?.musicVideoMode, ...(characterLock ? { characterLock } : {}), ...(sceneScripts?.length ? { sceneScripts, totalSec: sceneScripts.length * FILM_CLIP_SEC } : {}), ...(cameraMove ? { cameraMove } : {}), ...(motionIntensity ? { motionIntensity } : {}) });
  const sceneCount = plan.shared.sceneCount || FILM_SCENE_COUNT;
  const forecast = forecastFilm(sceneCount);
  const clipForecast = forecastMarginForAction('video_film');

  // Stable per-request id; namespaces per-leg debit refs for idempotent retries.
  const compositeId = `film:${input.sessionId}:${Date.now()}`;

  // ── Pre-flight: balance gate (skips anonymous; downstream gate covers them) ─
  // Hoisted to function scope so the per-clip billing step below can waive charges for a
  // FREE (promo) or founder/admin film (they bypass the pre-flight gate but were still charged).
  let clipBillingWaived = false;
  if (input.userId && input.userId !== 'anonymous') {
    // A founder/promo FREE film needs ZERO wallet balance, so it must bypass the
    // gate entirely — otherwise a 0.00 ₾ wallet would block the very first free
    // film (the regression the no-row→0 balance change introduced). We only PEEK
    // the slot here (read, never consume); the actual waiver happens at the
    // charge step. Fail-open: an unreadable slot just falls through to the
    // balance check below.
    const onboarding = await getOnboardingState(input.userId).catch(() => null);
    const hasFreeFilm = (onboarding?.freeFilmsRemaining ?? 0) > 0;
    // Founder/admin renders on the platform's own provider budget → bypass the
    // wallet gate (their personal wallet may legitimately be 0 while the platform
    // LTX balance funds the real render). Checked only when no free film applies.
    const founderBypass = hasFreeFilm ? false : await isAdminUser(input.userId);
    clipBillingWaived = hasFreeFilm || founderBypass;
    const balance = (hasFreeFilm || founderBypass) ? null : await readWalletBalanceGel(input.userId);
    if (!hasFreeFilm && !founderBypass && filmBalanceDecision(balance, forecast.totalRetailGel) === 'insufficient') {
      return {
        success: false,
        intent: 'video_generation',
        responseType: 'text',
        message: `Insufficient balance for the 30-second film pipeline. Required: ${forecast.totalRetailGel.toFixed(2)} ₾. Current: ${(balance ?? 0).toFixed(2)} ₾.`,
        metadata: {
          provider: 'composite',
          composite: true,
          insufficientBalance: true,
          requiredGel: forecast.totalRetailGel,
          balanceGel: balance ?? 0,
        },
      };
    }
  }

  const realUser = Boolean(input.userId && input.userId !== 'anonymous');

  // ATOMIC LEDGER ROLLBACK — refund EXACTLY the legs that were billed. Keyed by a
  // distinct `:refund` ref so the credit RPC is itself idempotent (a retried
  // rollback can't over-credit), and fail-open so a missing migration never
  // throws. This is the "balance protected" guarantee behind the localized
  // connection-failed copy.
  const rollbackFilmDebits = async (legs: FilmClipResult[]): Promise<void> => {
    if (!realUser || clipForecast.retailGel <= 0) return;
    const billed = legs.filter((c) => c.debited);
    if (billed.length === 0) return;
    // eslint-disable-next-line no-console
    console.warn(`[film] scene synthesis failed — refunding ${billed.length} billed clip leg(s) for ${input.userId}`);
    await Promise.all(
      billed.map((c) =>
        creditWalletGel(input.userId as string, clipForecast.retailGel, `${compositeId}:clip:${c.ordinal}:refund`),
      ),
    );
  };

  const connectionFailed = (diagnostic?: string | null): ChatResponse => ({
    success: false,
    intent: 'video_generation',
    responseType: 'text',
    message: videoProviderConnectionFailedMessage(input.locale),
    metadata: {
      provider: 'composite',
      composite: true,
      providerConnectionFailed: true,
      balanceProtected: true,
      // Surface the upstream reason (e.g. "Replicate LTX create failed (402)") so a
      // dead provider is DIAGNOSABLE — a low balance / bad token / rate limit is no
      // longer an opaque "couldn't connect". Never contains secrets (status + text).
      ...(diagnostic ? { providerError: diagnostic.slice(0, 200) } : {}),
    },
  });

  // ── Legs 2 + 3: render the continuity-locked clips through a bounded pool ──
  // mapWithConcurrency caps how many clip dispatches are in flight at once
  // (CLIP_DISPATCH_CONCURRENCY) so the failover createPrediction calls can't
  // burst the provider rate limit, while preserving scene order in the result.
  // renderClip never throws (it catches per-leg), but guard the fan-out anyway:
  // an unexpected throw must still roll the ledger back and surface the clean
  // localized halt rather than a 500.
  let clips: FilmClipResult[];
  try {
    // PREFER approved storyboard frames (from /api/film/storyboard) as the
    // per-scene identity anchors: the user reviewed them, so the render MATCHES
    // the storyboard — and we skip the costly on-dispatch frame generation that
    // made stylizeSceneFrame too slow to keep on the hot-path. They align with
    // plan.scenes by index (same deterministic plan/prompt/seed produced both).
    // Fall back to stylizeSceneFrame (off by default) only when none were given.
    const approvedFrames = Array.isArray(input.metadata?.sceneFrames)
      ? (input.metadata.sceneFrames as unknown[]).map((f) =>
          typeof f === 'string' && /^https?:\/\//i.test(f) ? f : null)
      : null;
    let sceneFrames = approvedFrames && approvedFrames.length === plan.scenes.length
      ? approvedFrames
      : await Promise.all(plan.scenes.map((scene) => stylizeSceneFrame(input, scene, plan.shared)));
    // AUTO CHARACTER-ANCHOR — a text-only brief (no uploaded photo, no storyboard frames)
    // has no i2v start image, so clips fall to LTX text-to-video even when Kling is selected.
    // Generate ONE flux-schnell portrait (~3.65s) from the locked character and reuse it as
    // the start image for EVERY clip → the i2v (Kling/LTX-2) path fires with a consistent
    // identity. DEFAULT-OFF (opt-in via AUTO_ANCHOR_FRAME=1): enabling it routes text-only
    // films onto the i2v path, but Kling is Replicate-only and the prod Replicate account is
    // currently throttled to 6/min+burst-1 (<$5 credit) → Kling creates 429 and the film
    // FAILS instead of falling to the working (direct) LTX text-to-video. Turn this on once
    // Replicate has ≥$5 credit. Fail-open: a miss leaves sceneFrames null → unchanged LTX path.
    const autoAnchorOn = /^(1|true|on)$/i.test((process.env.AUTO_ANCHOR_FRAME || '').trim());
    // Source for the anchor portrait: the Prompt Agent's character fragment is often EMPTY
    // (the character lives in the scene scripts), so fall back to the first scene prompt,
    // then the raw brief — otherwise the anchor silently skips and clips drop to LTX.
    const anchorDesc =
      (characterLock && characterLock.trim()) ||
      (Array.isArray(sceneScripts) && sceneScripts.find((s) => typeof s === 'string' && s.trim())) ||
      input.message.slice(0, 400);
    if (autoAnchorOn && anchorDesc && hostedCount === 0 && !sceneFrames.some(Boolean)) {
      const tAnchor = Date.now();
      const anchor = await generateAnchorFrame(anchorDesc, orientation === 'vertical' ? '9:16' : '16:9');
      if (anchor) {
        sceneFrames = plan.scenes.map(() => anchor);
        // eslint-disable-next-line no-console
        console.log(`[filmComposite] auto-anchor ready in ${Date.now() - tAnchor}ms → i2v start image set for all ${plan.scenes.length} clips`);
      }
    }
    // Vision QA heal pass (env-gated FILM_VISION_QA=1) — inspect each storyboard keyframe
    // for severe artifacts/face-melting and regenerate failures via the SAME stylizeSceneFrame
    // path BEFORE the costly render. Fail-OPEN per scene; structured report logged.
    if (visionQaEnabled()) {
      const qa = await qaHealKeyframes(sceneFrames, (i) => {
        const sc = plan.scenes[i];
        return sc ? stylizeSceneFrame(input, sc, plan.shared) : Promise.resolve(null);
      });
      sceneFrames = qa.frames;
      // eslint-disable-next-line no-console
      console.info('[film] vision-qa report:', JSON.stringify(qa.report));
    }
    clips = await mapWithConcurrency(plan.scenes, clipDispatchConcurrency(), (scene, i) =>
      renderClip(
        input,
        scene,
        plan.shared,
        compositeId,
        clipForecast.wholesaleGel,
        clipForecast.retailGel,
        sceneFrames[i] ?? null,
        clipBillingWaived, // a free/founder film charges no clip legs
      ),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[film] scene synthesis threw — protecting balance:', err instanceof Error ? err.message : err);
    return connectionFailed(err instanceof Error ? err.message : String(err));
  }
  const anyClip = clips.some((c) => c.status === 'queued');

  // ── 38% FAILURE GUARD — the upstream synthesis request timed out / threw and
  // NO clip queued. Atomically refund every billed leg and return the clean,
  // localized "balance protected" halt instead of a half-charged dead pipeline.
  if (!anyClip) {
    await rollbackFilmDebits(clips);
    // Bubble up WHY every clip failed (first distinct upstream reason) so the
    // failure is actionable instead of an opaque "couldn't connect".
    const reason = clips.map((c) => c.error).find((e): e is string => Boolean(e)) ?? null;
    return connectionFailed(reason);
  }

  // ── Leg 4: bind one cohesive audio track across the timeline (Udio) ────────
  // (Past the 38% guard above, at least one clip is guaranteed queued.)
  // v330 — read the explicit Music Video signals the composer threads through
  // metadata. A user-uploaded soundtrack BYPASSES the ambient music-generation
  // loop entirely (we never call — or bill — Udio); the explicit mode flag forces
  // a sung song when the brief keywords would otherwise miss.
  const filmMeta = (input.metadata ?? {}) as { soundtrackUrl?: unknown };
  const hasCustomSoundtrack = typeof filmMeta.soundtrackUrl === 'string' && filmMeta.soundtrackUrl.trim().length > 0;
  const musicWorkId: string | null = null;
  if (hasCustomSoundtrack) {
    // eslint-disable-next-line no-console
    console.log('[film] custom soundtrack supplied → skipping the Udio audio leg (no generation, no charge)');
  } else if (hasElevenLabsMusicKey()) {
    // v330 — ElevenLabs Music is the master audio layer and runs SYNCHRONOUSLY at the
    // assemble step, so the async Udio leg is skipped entirely (no workId, no charge).
    // Udio remains the fallback only when no ElevenLabs key is configured.
    // eslint-disable-next-line no-console
    console.log('[film] ElevenLabs Music configured → song synthesized at assemble; skipping the legacy audio leg');
  }
  // v330 — Udio is fully retired. Music is generated at the ASSEMBLE step (ElevenLabs
  // Music primary, Replicate MusicGen fallback), so the film's async audio leg no longer
  // mints a workId — `musicWorkId` stays null and the union poll reports audio 'skipped'.

  // ── Legs 4b + 4c: narration voice-over (PHASE 48 §2) + cinematic SFX (§49.7) ─
  // These two are INDEPENDENT (both derive from the brief, not from each other or
  // the clips) and both STRICTLY fail-open + unbilled, so we run them CONCURRENTLY
  // instead of back-to-back — the audio legs finish in max(voice, sfx) rather than
  // their sum. Voice-over only fires when the brief asks for a commentator/narrator
  // OR the user typed verbatim dialogue (narrationScript); SFX runs for every film.
  const voiceMeta = input.metadata as { narrationScript?: unknown; narratorGender?: unknown; dialogueScript?: unknown; masterScript?: unknown; voiceLanguage?: unknown; voicePersona?: unknown; voiceTone?: unknown } | undefined;
  // FILM-COMPILER PHASE 1 (audio fidelity) — when the user pastes a full Master Production Script,
  // parse it (pure/fail-open) into the STRUCTURED voice inputs the pipeline already consumes:
  //   narration  → generateFilmVoiceover.narrationScript  (the sanitized VO spine, verbatim)
  //   dialogue   → generateDialogueVoiceover.turns         (per-SPEAKER N-character casting)
  // Inert unless metadata.masterScript is a non-empty string; a parse that finds no sheets is ignored.
  const parsedMaster = (() => {
    const v = voiceMeta?.masterScript;
    if (typeof v !== 'string' || !v.trim()) return null;
    const p = parseMasterScript(v);
    return p.ok ? p : null;
  })();
  const masterNarration = parsedMaster && parsedMaster.narrationScript.trim() ? parsedMaster.narrationScript.trim() : null;
  const customNarration = (() => {
    const v = voiceMeta?.narrationScript;
    const explicit = typeof v === 'string' && v.trim() ? v.trim() : null;
    // The parsed Master-Script VO spine feeds the SAME verbatim narrationScript slot when no explicit one is set.
    return explicit ?? masterNarration;
  })();
  // Explicit narrator gender (video panel 👩/👨) — overrides brief auto-detection.
  const narratorGender: 'male' | 'female' | null =
    voiceMeta?.narratorGender === 'male' || voiceMeta?.narratorGender === 'female' ? voiceMeta.narratorGender : null;
  // Master-Script dialogue leg — the parsed on-camera dialogue with the VO NARRATOR spine folded in,
  // timecode-ordered (review finding #2: don't drop narration when dialogue also exists). Empty → null,
  // so narration-only scripts route through the single-voice narration leg below. Exact silence-gap
  // placement at each timecode is the Phase-2 assemble refinement; here they play in script order.
  const masterTurns = (() => {
    if (!parsedMaster) return null;
    const t = masterDialogueTurns(parsedMaster, narratorGender);
    return t.length ? t : null;
  })();
  // PHASE 2 L1 — Character Voice selector (language + persona + tone). Whitelisted to
  // the allowed unions; null when unset so the legacy gender/brief path is unchanged.
  const voiceLanguage = (voiceMeta?.voiceLanguage === 'ka' || voiceMeta?.voiceLanguage === 'en' || voiceMeta?.voiceLanguage === 'ru') ? voiceMeta.voiceLanguage : null;
  const voicePersona = (voiceMeta?.voicePersona === 'male' || voiceMeta?.voicePersona === 'female' || voiceMeta?.voicePersona === 'child' || voiceMeta?.voicePersona === 'elderly') ? voiceMeta.voicePersona : null;
  const voiceTone = (voiceMeta?.voiceTone === 'epic' || voiceMeta?.voiceTone === 'emotional' || voiceMeta?.voiceTone === 'energetic') ? voiceMeta.voiceTone : null;
  // Multi-character dialogue script (video panel toggle) — split per speaker, each
  // line voiced in its gendered voice and mixed into one track. Wins over single narration.
  const dialogueScript = (() => {
    const v = voiceMeta?.dialogueScript;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  })();
  const [voiceResult, sfxUrl] = await Promise.all([
    // DAY-6 multi-voice: when the Master-Script dialogue is multi-voice-viable (≥2 DISTINCT
    // TIMECODED speakers), render per-speaker STEMS ONCE (generateDialogueStems) so the assembler
    // spatial-premixes them with the -12dB sidechain duck. On ANY miss (not viable, 1 speaker, a
    // failed leg, or no ElevenLabs key) it returns null and we fall through to the EXACT single-track
    // path below — so every single-voice / narration film is byte-identical to before. No double-render:
    // generateDialogueStems returns null (never a partial upload) before we reach generateDialogueVoiceover.
    (async (): Promise<{ voiceUrl: string | null; dialogueStems: DialogueStem[] | null }> => {
      if (masterTurns && dialogueStemsViable(masterTurns)) {
        const stemsRes = await generateDialogueStems({ turns: masterTurns, compositeId }).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[film] dialogue stems leg failed:', err instanceof Error ? err.message : err);
          return null;
        });
        if (stemsRes && stemsRes.stems.length >= 2) {
          return { voiceUrl: stemsRes.mergedUrl, dialogueStems: stemsRes.stems };
        }
      }
      const single = (masterTurns || dialogueScript)
        ? await generateDialogueVoiceover(
            // Structured Master-Script turns → N-character casting; else the legacy gender-tagged script.
            masterTurns ? { turns: masterTurns, compositeId } : { script: dialogueScript!, compositeId },
          ).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('[film] dialogue voiceover leg failed:', err instanceof Error ? err.message : err);
            return null;
          })
        : (wantsCommentary(input.message) || customNarration)
        ? await generateFilmVoiceover({
            brief: input.message,
            totalSec: plan.shared.totalSec,
            compositeId,
            narrationScript: customNarration,
            narratorGender,
            voiceLanguage,
            voicePersona,
            voiceTone,
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('[film] voiceover leg failed:', err instanceof Error ? err.message : err);
            return null;
          })
        : null;
      return { voiceUrl: single, dialogueStems: null };
    })(),
    generateFilmSfx({
      // PHASE 2 L3 — when the Prompt Agent produced per-scene SFX cues, compose them
      // into a scene-aware ambience brief (no music/speech) instead of the generic
      // film brief. Strictly additive: without cues this is exactly input.message.
      brief: (sfxCues?.length
        ? sfxCues.map((c) => c.sfxPrompt).filter(Boolean).join('. ').slice(0, 280)
        : '') || input.message,
      totalSec: plan.shared.totalSec,
      compositeId,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[film] sfx leg failed:', err instanceof Error ? err.message : err);
      return null;
    }),
  ]);
  const voiceUrl = voiceResult.voiceUrl;
  // DAY-6 — the per-speaker dialogue stems (null for single-voice / narration films).
  const dialogueStems = voiceResult.dialogueStems;

  timer.mark('clips-dispatched+voice+sfx');

  // PHASE 43 §1 — Mint the Union Poll token. Every clip taskRef + the audio
  // workId rides in ONE predictionId; `pollFilmTask` decodes it and polls the
  // full matrix in lock-step instead of tracking a single clip.
  const filmToken = encodeFilmRef({
    sessionId: input.sessionId,
    createdAt: Date.now(),
    seed: plan.shared.seed,
    sceneCount,
    clips: clips.map((c) => ({ ordinal: c.ordinal, taskRef: c.taskRef, status: clipDispatchStatus(c.status), attempts: c.attempts })),
    musicWorkId,
    voiceUrl,
    sfxUrl,
    // DAY-6 multi-voice — carried through the token so the poll surfaces them to the
    // authed client, which forwards them to /api/video/assemble. Absent → single-voice.
    ...(dialogueStems && dialogueStems.length ? { dialogueStems } : {}),
  });

  // The Editor (stitch) and Audio legs depend on the clips finishing first, so
  // they are reported as queued (the async assembler picks them up) — never
  // claimed done before the clips land. `readyToStitch` flips true only once the
  // poll confirms every non-skipped clip has landed.
  const filmSummary: FilmPlanSummary = {
    sceneCount,
    seed: plan.shared.seed,
    storyboard: 'succeeded',
    clips: clips.map((c) => ({ ordinal: c.ordinal, status: c.status, url: null, attempts: c.attempts })),
    stitch: 'queued',
    audio: musicWorkId ? 'queued' : 'pending',
    audioUrl: null,
    readyToStitch: false,
    musicWorkId,
    voiceUrl,
    sfxUrl,
  };

  const renderedCount = clips.filter((c) => c.status === 'queued').length;
  const summary = [
    '🎬 30-Second Film pipeline started',
    `📝 Storyboard: ${sceneCount} scenes planned`,
    `🎥 Clips dispatched: ${renderedCount}/${sceneCount} (shared seed ${plan.shared.seed})`,
    '✂️ Editor will stitch the final cut',
    musicWorkId ? '🎵 Score generation started' : '⚠️ Score skipped',
  ].join('\n');

  timer.mark('dispatch-complete');
  // eslint-disable-next-line no-console
  console.log('[film] timing', JSON.stringify(timer.summary()));

  return {
    success: true,
    intent: 'video_generation',
    responseType: 'video',
    message: summary,
    // PHASE 43 §1 — track the WHOLE matrix via the union token, not one clip.
    predictionId: filmToken,
    predictionStatus: 'processing',
    assetType: 'composite-film',
    metadata: {
      provider: 'composite',
      composite: true,
      film: filmSummary,
      forecast: {
        retailGel: forecast.totalRetailGel,
        wholesaleGel: forecast.totalWholesaleGel,
        marginMultiplier: forecast.marginMultiplier,
      },
    },
  };
}
