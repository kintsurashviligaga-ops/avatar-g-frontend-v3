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
import { videoProviderUnavailableMessage, videoProviderConnectionFailedMessage } from './videoProvider';
import { BUDGET_ERROR_PREFIX, budgetReasonOf, budgetRefusalMessage, isBudgetRefusal } from '@/lib/services/billing/budgetMessage';
import type { OrchestratorInput, ChatResponse } from './providerRouter';
import { withTrace } from '@/lib/observability/agentTrace';
import { forecastMarginForAction } from '@/lib/monetization/audit-engine';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { consumeFreeFilm, restoreFreeFilm } from '@/lib/billing/wallet-ledger';
import { deductCredits, refundCredits, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { videoCredits, perSceneCredits, STUDIO_DEFAULT_VEO_TIER } from '@/lib/credits/videoPricing';
import { sceneCredits } from '@/lib/credits/priceBook';
import { TRIAL } from '@/lib/billing/tiers';
import { insufficientCreditsResponse, chargeRefusedResponse } from './chatBilling';
import { isAdminEmail } from '@/lib/auth/adminGuard';
import { lyriaBedReady } from '@/lib/audio/lyriaBed';
import { PipelineTimer } from '@/lib/pipeline/timing';
import { selectClipVideoModel } from '@/lib/pipeline/modelSelection';
import { ServiceManager } from './ServiceManager';
import { encodeFilmRef } from './filmTaskRef';
import { deriveFilmTokenId, recordFreeFilmWaiver, recordFilmPaid, getFilmStartReplay, recordFilmStartReplay, recordFilmCaptions } from './filmStatusStore';
import { filmChargeRef as filmChargeRefFor, recordFilmBilling, recordFilmScenes, filmStartKey } from './filmBilling';
import { filmSceneShares } from './filmSceneRefund';
import { saveFilmSceneBook } from './filmSceneBook';
import type { FilmBookScene } from './filmSceneRedo';
import { claimPaidStartKey, releaseIdempotencyKey } from '@/lib/orchestrator/idempotency';
import { generateCheckedFilmVoiceover, generateDialogueVoiceover, generateDialogueStems, dialogueStemsViable, wantsCommentary, type CheckedFilmVoiceover, type DialogueStem } from './filmVoiceover';
import { parseMasterScript, masterDialogueTurns } from '@/lib/pipeline/script/masterScript';
import { evaluateFilmQa } from '@/lib/ai/qaDirectorAgent';
import {
  planFilmScenes,
  buildFilmClipRequest,
  normalizeReferenceImages,
  splitStructuredScriptScenes,
  planFilmGrid,
  FILM_SCENE_COUNT,
  FILM_CLIP_SEC,
  type FilmScene,
  type FilmShared,
  type FilmSceneWindow,
  type SceneScreenwriterMeta,
} from './filmPipeline';
import { planSceneDialogue, type SceneSpokenLine } from './sceneDialogue';
import { checkSceneSpeech, reflowSpeech, speechSeconds, OVERFLOW_TOLERANCE, SPEECH_LEAD_SEC, SPEECH_TAIL_SEC } from '@/lib/video/speechTiming';
import { isGeorgianText } from '@/lib/audio/tts-model';
import { filmFrameChainOn, chainEndFrame } from '@/lib/video/frameChain';
import { filmSequentialChainOn, filmChainStoreReady, saveFilmChainPlan } from './filmChain';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import {
  MAX_CLIP_DISPATCH_ATTEMPTS,
  clipDispatchConcurrency,
  clipDispatchJitterMs,
  clipRetryBackoffMs,
  shouldDownshiftToLtx,
  mapWithConcurrency,
} from './filmClipRetry';
import { filmBalanceDecision } from './filmBalanceGate';
import { runPromptAgent, type MasterFilmSfxCue } from './promptAgent';
import { parseSceneMeta, parseVeoRenderOptions } from '@/lib/veo/renderOptions';
import { nativeAspectFor } from '@/lib/veo/capabilities';
import { veoTransport } from '@/lib/veo/engine';
import { vertexConfigProblems } from '@/lib/veo/vertexAuth';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';
import { resolveFilmTemplate } from '@/lib/studio/templateContext';

const serviceManager = new ServiceManager();

// v330 — buildMusicRequest (the Udio request builder) was removed with the Udio
// retirement. Music is now generated at the assemble step: Lyria on Vertex
// (buildSongPrompt in lib/audio/songPrompt.ts, lib/audio/lyriaBed.ts), with no fallback engine.

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
  /**
   * The engine that ACCEPTED this clip ('gemini-veo' | 'runway' | 'replicate' | …). Load-bearing for the
   * double-voice guard: only a Veo clip speaks its dialogue in-clip, so only a Veo clip may have its
   * ElevenLabs VO suppressed. Null when the dispatch produced no provider job.
   */
  engine?: string | null;
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
  /** PHASE 25 (VECTOR 2) — the QA Director Agent's pre-assembly verdict (grade + graded flags).
   *  Telemetry only; the render is never blocked (fail-open). */
  qa?: { grade: string; pass: boolean; issues: { code: string; severity: string; detail: string; autoFixed?: boolean }[] } | null;
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
  /** The NEXT scene's first frame: this clip ends on it (Veo interpolation) so the cut is seamless. */
  nextSceneFrame: string | null = null,
): Promise<FilmClipResult> {
  // The same test the door used: a film needs a Veo route (MASTER TASK v3.1: Veo is the only clip engine). A clip is
  // skipped only when there is none, which the door-level pre-flight already caught.
  if (veoTransport() === null) {
    return { ordinal: scene.ordinal, taskRef: null, status: 'skipped', attempts: 0, debited: false };
  }

  // PHASE 4A — preview-tier model gate: the premium i2v upgrade (Kling/Hailuo) is only
  // honored for a signed-in, non-preview render; anon trials + preview-quality renders
  // fall through to the cheap LTX default and never burn the premium budget.
  const clipModel = selectClipVideoModel({
    requested: typeof input.metadata?.videoModel === 'string' ? input.metadata.videoModel : null,
    isSignedIn: Boolean(input.userId && input.userId !== 'anonymous'),
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
  if (sceneFrame && nextSceneFrame) clipReq.selectedOptions.veoEndFrame = nextSceneFrame;

  return submitFilmClip(
    { userId: input.userId ?? null, sessionId: input.sessionId, locale: input.locale, videoModel: clipModel ?? null },
    clipReq, scene, compositeId, forecastClipWholesale, forecastClipRetail, waiveClipBilling,
  );
}

/** Who a film clip is rendered for: the film's owner, session and locale, and the clip model the start resolved. */
export interface FilmClipContext {
  userId: string | null;
  sessionId: string;
  locale: string;
  videoModel: ReturnType<typeof selectClipVideoModel> | null;
}

/**
 * Send ONE film clip request (already built: prompt, start frame, Veo options) and report the leg. Shared by the film
 * start and by a chained scene the poll dispatches later (lib/chat/filmChain), so both follow the same retry, budget and
 * billing rules. Never throws.
 */
export async function submitFilmClip(
  ctx: FilmClipContext,
  clipReq: { userPrompt: string; selectedOptions: Record<string, string> },
  scene: { ordinal: number; seed: number },
  compositeId: string,
  forecastClipWholesale: number,
  forecastClipRetail: number,
  /** True for a FREE film (promo) or founder/admin render, and for every film charged up front → no per-clip charge. */
  waiveClipBilling: boolean,
): Promise<FilmClipResult> {
  // A debit is only ever issued by withTrace for a real, billable user with a
  // positive retail price. Track it locally so the orchestrator can refund this
  // exact leg if the whole film collapses.
  const realUser = Boolean(ctx.userId && ctx.userId !== 'anonymous');
  // A FREE film (promo slot) or founder/admin render must NOT charge per clip — the pre-flight
  // waives them, but the per-leg debit was still firing (promo not actually free; founder drained).
  const billable = realUser && forecastClipRetail > 0 && !waiveClipBilling;
  let debited = false;

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
    // PHASE 23 — once Kling has had its attempts, FORCE the LTX-2 down-shift on the remaining
    // retries so a saturated / timing-out Kling cluster can't starve this scene: skipI2v makes
    // execute() skip the premium create and land straight on LTX (which keeps the identity anchor
    // + drift clause). Sticky by design — once we down-shift a scene, later retries stay on LTX.
    // Google-only: never down-shift to LTX (skipI2v also skips Veo) — the scene stays on Veo or fails honestly.
    if (shouldDownshiftToLtx(attempt) && clipReq.selectedOptions.googleOnly !== '1') clipReq.selectedOptions.skipI2v = '1';
    try {
      const dispatched = await withTrace(
        {
          userId: ctx.userId || null,
          agentId: 'video-agent',
          workerKind: 'veo',
          action: 'generate_clip',
          promptSummary: clipReq.userPrompt,
          costWholesaleGel: forecastClipWholesale,
          costRetailGel: forecastClipRetail,
          metadata: { composite: true, leg: 'film-clip', ordinal: scene.ordinal, seed: scene.seed, attempt },
          // Honor the waiver: `billable` (realUser && retail>0 && !waiveClipBilling) is the SSoT for "should
          // this leg charge". `deduct: true` unconditionally charged FREE/founder/promo films per clip and
          // left `debited` false so the rollback never refunded them; deduct: billable keeps paying users
          // byte-identical and correctly stops charging a waived film.
          deduct: billable,
          deductRef: `${compositeId}:clip:${scene.ordinal}`,
        },
        () =>
          serviceManager.execute({
            sessionId: ctx.sessionId,
            serviceContext: 'video',
            intent: 'video_generation',
            userPrompt: clipReq.userPrompt,
            selectedOptions: clipReq.selectedOptions,
            locale: ctx.locale,
            // PHASE 2 L5 / 4A — per-render i2v model (Cinema panel Kling/Hailuo toggle),
            // gated by selectClipVideoModel so anon/preview renders stay on cheap LTX.
            ...(ctx.videoModel ? { videoModel: ctx.videoModel } : {}),
          }),
        (r) => r.predictionId || r.assetUrl || null,
      );
      const taskRef = dispatched.predictionId || dispatched.assetUrl || null;
      // WHICH engine took the job. Only 'gemini-veo' speaks the scene's dialogue in-clip, so this is what
      // the double-voice guard checks before dropping an ElevenLabs leg (a Veo outage falls back to a
      // MUTE engine, and suppressing the VO on that would leave the film silent where it should talk).
      const engine = typeof dispatched.metadata?.videoProvider === 'string' ? dispatched.metadata.videoProvider : null;
      // The inner call resolved, so withTrace has issued the (idempotent) debit
      // for this leg — flag it even when no taskRef came back, so a downstream
      // total-failure rollback refunds exactly what was billed.
      if (billable) debited = true;
      // ⚠️ A REFERENCE IS NOT AN ACCEPTANCE. This checked only that SOMETHING came back, so a dispatch
      // that handed over an id while reporting a terminal failure was filed as `queued` — which did three
      // wrong things at once: the leg kept its charge, it counted toward `anyClip` and so suppressed the
      // whole-film rollback for its siblings, and the poller was left waiting on a job that was already
      // dead. ServiceManager.execute() reports exactly this shape (`predictionStatus: 'failed'` /
      // `success: false`, ServiceManager.ts:277) and its own retry loop already refuses it the same way
      // (line 371) — this call site was the one that did not.
      // ⚠️ A BUDGET REFUSAL IS FINAL FOR THE DAY. The platform limit answered "no" before anything was sent to Google;
      // asking three more times only repeats the "no" (2026-10-16: four refusals per clip, then "could not reach the
      // video service" instead of the limit). It goes back as `budget_exceeded:<reason>` so the film says which
      // limit stopped it and when it lifts.
      if (dispatched.metadata?.budgetExceeded === true) {
        const reason = typeof dispatched.metadata.budgetReason === 'string' ? dispatched.metadata.budgetReason : 'daily_limit';
        return { ordinal: scene.ordinal, taskRef: null, status: 'failed', attempts: attempt, debited, error: `${BUDGET_ERROR_PREFIX}${reason}` };
      }
      const dispatchDead = dispatched.success === false
        || dispatched.predictionStatus === 'failed'
        || dispatched.predictionStatus === 'canceled'
        || dispatched.predictionStatus === 'error';
      if (taskRef && !dispatchDead) {
        return { ordinal: scene.ordinal, taskRef, status: 'queued', attempts: attempt, debited, engine };
      }
      // No usable provider job — treat as a soft failure and retry. Naming which of the two it was keeps
      // "the provider refused it" distinguishable from "nothing came back at all" in the leg's error.
      lastErr = new Error(dispatchDead
        ? `dispatch reported ${dispatched.predictionStatus ?? 'failure'} without a usable job`
        : 'dispatch returned no task reference');
      // ⚠️ A VEO SUBMIT IS RE-POSTED ONLY WHEN GOOGLE PROVABLY REFUSED IT (429 / 503). predictLongRunning has no
      // idempotency key: after a timeout or a 5xx the job may already exist and bill, so a retry would pay twice
      // (owner rule: never repeat a generation POST on an unclear outcome). A 400 / auth / billing / safety miss
      // cannot succeed on a retry either. ServiceManager reports which it was in metadata.veoFailure.
      const veoFailure = dispatched.metadata?.veoFailure as { reason?: string; retryable?: boolean } | undefined;
      if (veoFailure && veoFailure.retryable !== true) {
        const veoErr = `veo ${veoFailure.reason ?? 'failure'} — not retried`;
        // eslint-disable-next-line no-console
        console.warn(`[film] clip ${scene.ordinal}: Veo ${veoFailure.reason ?? 'failure'} — no retry (a re-POST could bill twice or cannot succeed)`);
        return { ordinal: scene.ordinal, taskRef: null, status: 'failed', attempts: attempt, debited, error: veoErr };
      }
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
 * A film start refused BEFORE anything was charged: a duplicate of a start already under way (the same Generate press sent
 * twice, or retried), or — in Production — a start whose duplicate state neither the database nor Redis could confirm.
 */
export function filmStartRefused(locale: string, why: 'duplicate' | 'unconfirmed'): ChatResponse {
  const message = why === 'duplicate'
    ? (locale === 'en' ? 'This film is already starting from your earlier request — nothing more was charged.'
      : locale === 'ru' ? 'Этот фильм уже запускается по вашему предыдущему запросу — повторно ничего не списано.'
      : 'ეს ფილმი უკვე იწყება შენი წინა მოთხოვნით — ხელახლა არაფერი ჩამოგეჭრა.')
    : (locale === 'en' ? 'The film could not be started safely right now — nothing was charged. Please try again in a minute.'
      : locale === 'ru' ? 'Сейчас фильм нельзя безопасно запустить — ничего не списано. Попробуйте через минуту.'
      : 'ფილმის უსაფრთხოდ დაწყება ახლა ვერ მოხერხდა — არაფერი ჩამოგეჭრა. სცადე ერთ წუთში.');
  return { success: false, intent: 'video_generation', responseType: 'text', message, metadata: { provider: 'billing', filmStart: why } };
}

/** A retried press whose first start already answered: the same film again, nothing charged or dispatched again. */
export function filmStartReplayed(locale: string, predictionId: string, film: unknown): ChatResponse {
  const message = locale === 'en' ? 'This film is already rendering from your earlier request — nothing more was charged.'
    : locale === 'ru' ? 'Этот фильм уже создаётся по вашему предыдущему запросу — повторно ничего не списано.'
    : 'ეს ფილმი უკვე იქმნება შენი წინა მოთხოვნით — ხელახლა არაფერი ჩამოგეჭრა.';
  return {
    success: true, intent: 'video_generation', responseType: 'video', message,
    predictionId, predictionStatus: 'processing', assetType: 'composite-film',
    metadata: { provider: 'composite', composite: true, film, filmStart: 'replayed' },
  };
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
  // Google-only (docs/VEO_ENGINE.md §3, always since MASTER TASK v3.1): the door needs a Veo route. An LTX or Replicate
  // key alone must not wave a film through that would then refuse every non-Google engine clip by clip.
  // veoTransport() also honours a VEO_TRANSPORT pin: a pinned-but-unready transport is no route at all.
  const providerReady = veoTransport() !== null;
  if (!providerReady) {
    // eslint-disable-next-line no-console
    console.error('[film] aborted pre-storyboard: no video provider configured (Vertex AI is not configured for Veo)');
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
        missingEnv: vertexConfigProblems(),
      },
    };
  }
  // ⚠️ AN ANONYMOUS CALLER COULD RENDER A FILM ON PAID ENGINES, UNBILLED. /api/chat/orchestrate has no auth gate of
  // its own (the studio stops a guest in the browser, the API did not), and every clip engine costs money — Veo
  // $0.10–0.40 per second, Runway and Kling per clip — while the per-leg debit only exists for a real user. Refused
  // here, before any planning, frame or clip. FILM_ALLOW_ANONYMOUS=1 re-opens it for a demo/preview deployment.
  if (!(input.userId && input.userId !== 'anonymous') && process.env.FILM_ALLOW_ANONYMOUS !== '1') {
    const loc = input.locale === 'en' ? 'en' : input.locale === 'ru' ? 'ru' : 'ka';
    return {
      success: false,
      intent: 'video_generation',
      responseType: 'text',
      message: loc === 'en' ? 'Sign in to make a video.' : loc === 'ru' ? 'Войдите, чтобы создать видео.' : 'ვიდეოს შესაქმნელად შედი ანგარიშზე.',
      metadata: { provider: 'composite', composite: true, authRequired: true },
    };
  }
  // The studio's Veo plan (lib/video/veoPlan → toRenderOptions), re-validated: anything malformed is ignored.
  const veoPlan = parseVeoRenderOptions(input.metadata?.veo);

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
  // Veo renders only 16:9 and 9:16. The DELIVERED format decides the native ratio: 4:5 is cropped from 9:16 (it
  // used to be cropped from 16:9, keeping ~45% of the width), 1:1 from 16:9.
  const orientation: 'landscape' | 'vertical' = veoPlan
    ? (nativeAspectFor(veoPlan.film.format) === '9:16' ? 'vertical' : 'landscape')
    : (input.metadata?.orientation === 'vertical' || input.metadata?.orientation === 'portrait' ? 'vertical' : 'landscape');
  // The user's PINNED clip count (6s→1 · 30s→6 · 60s→12). When present it fixes the render's scene count so a
  // scriptless / raced dispatch can never fall back to FILM_SCENE_COUNT (30s/6 scenes) — the "6s selection → 30s
  // film with a dropped selfie anchor" bug. Null → prior behaviour (derive from sceneScripts.length, else default).
  const pinnedSceneCount = (() => {
    const n = Number(input.metadata?.sceneCount);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? Math.round(n) : null;
  })();
  // ⚠️ THE TEMPLATE CARD'S LOOK + DIRECTOR NOTE ARE RESOLVED HERE, FROM ITS ID (metadata.templateId) — never accepted
  // as text, and only when THIS render's style and music-video mode still select the card, and its length when the
  // render states one: the pinned scene count × the pinned clip length (a 4 × 6 s script is still a 24 s film). The
  // storyboard route runs the same resolver, so the approved board and the paid film are planned with one look.
  const filmTemplate = resolveFilmTemplate({
    templateId: input.metadata?.templateId, style, musicVideoMode: !!input.metadata?.musicVideoMode,
    runtimeSec: (() => {
      if (!pinnedSceneCount) return null;
      const c = Number(input.metadata?.clipSec);
      return pinnedSceneCount * (Number.isFinite(c) && c >= 4 && c <= 8 ? c : FILM_CLIP_SEC);
    })(),
  });
  // Approved LLM story scenes from the storyboard step — the clips render from
  // these exact scene descriptions (real story) instead of the deterministic beats.
  let sceneScripts = Array.isArray(input.metadata?.sceneScripts)
    ? (input.metadata.sceneScripts as unknown[]).map((s) => (typeof s === 'string' ? s : '')).filter(Boolean)
    : undefined;
  // V1 — the screenwriter's per-scene metadata (cameraShot/mood/location), populated ONLY from the
  // Prompt-Agent brief path below (plain string sceneScripts from other sources carry no shot data).
  // The director's per-scene provenance approved with the storyboard (structured camera, lighting…). The
  // render-time fallback agent below only runs when no scenes arrived, so this is the common source now.
  let sceneMeta: SceneScreenwriterMeta[] | undefined = parseSceneMeta(input.metadata?.sceneMeta);

  // ── SPOKEN DIALOGUE + SCENE TIMING SOURCES ─────────────────────────────────
  // Parsed ONCE, up front, because three separate decisions depend on them: the scene GRID (a 4 × 6s
  // script must not be forced onto the 8s cadence), the per-scene SPOKEN LINE handed to Veo, and whether
  // the ElevenLabs dialogue leg would now be a SECOND voice over the same words.
  const voiceMeta = input.metadata as { narrationScript?: unknown; narratorGender?: unknown; dialogueScript?: unknown; masterScript?: unknown; voiceLanguage?: unknown; voicePersona?: unknown; voiceTone?: unknown } | undefined;
  // FILM-COMPILER PHASE 1 (audio fidelity) — a pasted Master Production Script parsed (pure/fail-open)
  // into the STRUCTURED render inputs: scene sheets, the VO spine, and per-SPEAKER dialogue turns.
  const parsedMaster = (() => {
    const v = voiceMeta?.masterScript;
    if (typeof v !== 'string' || !v.trim()) return null;
    const p = parseMasterScript(v);
    return p.ok ? p : null;
  })();
  // A structured script pasted straight into the CHAT MESSAGE ("🎬 სცენა 1 (0:00–0:06) … დიალოგი: „…"").
  // Its per-scene dialogue + timecodes used to be discarded by the visual-only cleaner.
  const structuredScenes = splitStructuredScriptScenes(input.message, 12);

  // DAY-6 — a pasted TIMECODED Master Production Script drives the STORYBOARD: its parsed SCENE sheets
  // (action lines, in order) become the per-scene prompts, so the film follows the script VISUALLY — not just
  // its audio (the narration + multi-voice dialogue legs already read metadata.masterScript below). Additive +
  // fail-open: only when the UI supplied no explicit sceneScripts AND the script parses to ≥2 scenes.
  if ((!sceneScripts || sceneScripts.length === 0) && parsedMaster) {
    const fromMaster = parsedMaster.scenes.map((s) => s.action.trim()).filter(Boolean).map((a) => a.slice(0, 2000));
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
  // PHASE 22 (VECTOR 1) — the Director's "what to avoid" negative. Prefer one threaded via metadata
  // (storyboard-first path), else capture it from the Prompt-Agent brief below. planFilmScenes merges
  // it with the always-on FILM_DRIFT_NEGATIVE baseline, so EVERY clip suppresses tint/deform natively.
  let filmNegative: string | null =
    typeof input.metadata?.negativePrompt === 'string' && input.metadata.negativePrompt.trim()
      ? input.metadata.negativePrompt.trim()
      : null;
  if (!characterLock && (!sceneScripts || sceneScripts.length === 0)) {
    // FIRST honour the user's OWN scenes: if the brief embeds an explicit
    // multi-scene script (an attached screenplay/shot-list), split it deterministically
    // — the render then follows the script exactly instead of losing it to a flaky/
    // timed-out LLM scene-writer (which fell back to the generic music-video orbit).
    if (structuredScenes && structuredScenes.length >= 2) {
      sceneScripts = structuredScenes.map((s) => s.prompt);
      // eslint-disable-next-line no-console
      console.log(`[filmComposite] used ${structuredScenes.length} scenes from the attached structured script (no LLM)`);
    } else {
      // A reference image (bridged photo / uploaded selfie) present → the agent must NOT invent a persona.
      const refImgs = input.metadata?.referenceImages as unknown;
      const hasRefImg = !!input.metadata?.avatarUrl || (Array.isArray(refImgs) && refImgs.length > 0);
      const fbCount = pinnedSceneCount ?? FILM_SCENE_COUNT; // honour the user's package, not the 30s/6 default
      const brief = await runPromptAgent({
        brief: input.message,
        mode: input.metadata?.musicVideoMode ? 'music_video' : 'documentary',
        sceneCount: fbCount,
        length: fbCount * FILM_CLIP_SEC,
        effect: style ?? 'Cinematic',
        language: input.locale,
        hasReferenceImage: hasRefImg,
        ...(filmTemplate ? { templateNote: filmTemplate.directorNote } : {}),
      }).catch(() => null);
      if (brief) {
        characterLock = brief.character.imagePromptFragment;
        sceneScripts = brief.scenes.map((s) => s.imagePrompt);
        // V1 — stop FLATTENING the brief away: carry the screenwriter's per-scene shot direction
        // (cameraShot/mood/location) index-aligned with sceneScripts so the Camera stage honors the
        // script's intent instead of re-deriving from the deterministic beat ladder.
        sceneMeta = brief.scenes.map((s) => ({
          cameraShot: s.cameraShot, mood: s.mood, location: s.location,
          ...(s.camera ? { camera: s.camera } : {}),
          ...(s.lighting ? { lighting: s.lighting } : {}),
        }));
        sfxCues = brief.sfxCues;
        // VECTOR 1 — capture the Director's scene-tailored negative so it reaches the provider.
        if (!filmNegative && brief.visualStyle?.negativePrompt?.trim()) filmNegative = brief.visualStyle.negativePrompt.trim();
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

  // ── SCENE GRID — follow the script's own cadence (Veo accepts 4–8s) ─────────
  // Timecode windows, in source priority: the Master Script's scene sheets, then a structured script
  // pasted into the message. A 24s film written as 4 × 6s now renders as 4 × 6s instead of being forced
  // onto 3 × 8s (which dropped a scene and slid every dialogue cue off its beat).
  const sceneWindows: (FilmSceneWindow | null)[] =
    (parsedMaster?.scenes.length ? parsedMaster.scenes.map((s) => ({ startSec: s.startSec, endSec: s.endSec })) : null)
    ?? (structuredScenes?.length ? structuredScenes.map((s) => s.window) : null)
    ?? [];
  // When explicit sceneScripts exist their COUNT is fixed (each one is a planned shot), so no runtime
  // contract is passed. Otherwise the user's package length IS the contract: a 24s package with a 6s
  // script must render 4 × 6s, not 3 × 6s = 18s (the cadence must not cost the user runtime).
  const grid = planFilmGrid({
    sceneCount: sceneScripts?.length ?? pinnedSceneCount ?? null,
    ...(sceneScripts?.length ? {} : { totalSec: (pinnedSceneCount ?? FILM_SCENE_COUNT) * FILM_CLIP_SEC }),
    ...(Number.isFinite(Number(input.metadata?.clipSec)) ? { clipSec: Number(input.metadata?.clipSec) } : {}),
    windows: sceneWindows,
  });
  if (grid.clipSec !== FILM_CLIP_SEC) {
    // eslint-disable-next-line no-console
    console.log(`[filmComposite] scene grid from the script: ${grid.sceneCount} × ${grid.clipSec}s = ${grid.totalSec}s (default is ${FILM_CLIP_SEC}s)`);
  }

  // ── VEO-NATIVE SPEECH — does the engine that will render these clips SPEAK? ─
  // Only Veo generates in-clip speech. The decision must be made HERE (dispatch time) because it also
  // decides whether the ElevenLabs dialogue leg runs — and that leg is minted before any clip lands.
  // Mirror ServiceManager's engine gate exactly: an explicit Kling/Hailuo pick opts out of Veo, and
  // selectClipVideoModel is what actually resolves the request's model (an anon/preview render has its
  // premium pick stripped, which only makes Veo MORE likely).
  const effectiveVideoModel = selectClipVideoModel({
    requested: typeof input.metadata?.videoModel === 'string' ? input.metadata.videoModel : null,
    isSignedIn: Boolean(input.userId && input.userId !== 'anonymous'),
    preview: input.metadata?.quality === 'preview',
  });
  // Google-only renders every clip on Veo whatever the panel's engine pick. Veo speaks only when it renders audio:
  // the plan's "native audio" switch is honoured on Vertex AI (a video-only clip is cheaper) — so a film with native
  // audio OFF keeps its ElevenLabs dialogue leg.
  const clipTransport = veoTransport();
  const nativeSpeech = clipTransport !== null
    && veoPlan?.film.generateAudio !== false;

  // Per-scene spoken lines, index-aligned with the scenes. Sources, best first: the line written inside
  // each scene's own sheet → the Master Script's timecoded dialogue turns → the dialogue textarea → a
  // typed narration script that is really character speech. We track WHICH source won, because that is
  // exactly the leg that must not also be voiced by ElevenLabs (see the audio legs below).
  const dialogueScriptRaw = (() => {
    const v = voiceMeta?.dialogueScript;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  })();
  // `narrationScript` is overloaded: it is the VO spine when the brief asks for a narrator/commentator,
  // but it is ALSO where a user types the verbatim lines their characters speak. Treat it as speech only
  // in the latter case — a real narrator has no mouth in frame, and making a character lip-sync a
  // disembodied VO is worse than the ElevenLabs track it would replace.
  const narrationAsDialogue = (() => {
    const v = voiceMeta?.narrationScript;
    const s = typeof v === 'string' && v.trim() ? v.trim() : null;
    return s && !wantsCommentary(input.message) ? s : null;
  })();
  type DialogueSourceKind = 'master-script' | 'script-scenes' | 'dialogueScript' | 'narrationScript';
  const { sceneDialogue: plannedDialogue, dialogueSource, dialogueComplete, dialoguePlacedCount: plannedPlacedCount } = ((): {
    sceneDialogue: SceneSpokenLine[][]; dialogueSource: DialogueSourceKind | null; dialogueComplete: boolean; dialoguePlacedCount: number;
  } => {
    const base = { sceneCount: grid.sceneCount, clipSec: grid.clipSec };
    // The MASTER SCRIPT's timecoded turns come first when present, because they are ALSO what the
    // ElevenLabs dialogue leg would have voiced — so delegation and suppression describe the same set of
    // lines. Its per-scene windows are only trustworthy when they describe the same number of scenes the
    // film will actually render (a sheet with no action line gets filtered out upstream, which shifts
    // every later window); when they don't, the uniform clipSec grid is the honest fallback.
    if (parsedMaster?.dialogue?.length) {
      const turns = parsedMaster.dialogue.map((d) => ({ speaker: d.speaker, text: d.text, startSec: d.startSec }));
      const windowsAligned = sceneWindows.length === grid.sceneCount;
      const p = planSceneDialogue({ ...base, ...(windowsAligned ? { windows: sceneWindows } : {}), turns });
      return { sceneDialogue: p.scenes, dialogueSource: 'master-script', dialogueComplete: p.complete, dialoguePlacedCount: p.placed };
    }
    // Then the composer's dialogue textarea, then a typed "narration" that is really character speech.
    // These come BEFORE the message's scene sheets on purpose: each of them drives a REAL ElevenLabs leg,
    // so they are the set that delegation has to match. Delegating the sheets while suppressing a
    // dialogueScript leg would drop words nobody ever spoke.
    for (const [kind, text] of [['dialogueScript', dialogueScriptRaw], ['narrationScript', narrationAsDialogue]] as const) {
      if (!text) continue;
      const p = planSceneDialogue({ ...base, script: text });
      if (p.total > 0) return { sceneDialogue: p.scenes, dialogueSource: kind, dialogueComplete: p.complete, dialoguePlacedCount: p.placed };
    }
    // Finally the lines written inside the scene sheets the user pasted into the message. Positional, so
    // only when the sheet count matches the render's scene count — otherwise scene 4's line would land in
    // scene 3's mouth. Nothing else voices these (they feed no ElevenLabs leg), so delegating them adds
    // speech that simply did not exist before.
    // The sheets are positional against the MESSAGE's order, while sceneScripts may have been REORDERED by
    // the user on the storyboard board (drag / chevrons permute sceneScripts and keep the count), which
    // would put scene 4's line in scene 3's mouth. Both come from the same cleaner, so equality of the
    // visual text per index is a cheap, exact proof that the order still matches.
    const sheetsInScriptOrder = !sceneScripts?.length
      || (structuredScenes?.length === sceneScripts.length
          && structuredScenes.every((sc, i) => sc.prompt === sceneScripts![i]));
    if (structuredScenes?.length === grid.sceneCount && sheetsInScriptOrder) {
      const p = planSceneDialogue({ ...base, windows: sceneWindows, sheets: structuredScenes.map((s) => s.dialogue) });
      if (p.total > 0) return { sceneDialogue: p.scenes, dialogueSource: 'script-scenes', dialogueComplete: p.complete, dialoguePlacedCount: p.placed };
    }
    if (structuredScenes?.length && !sheetsInScriptOrder) {
      // eslint-disable-next-line no-console
      console.log('[filmComposite] scene sheets no longer match the approved scene order (reordered/edited) → dialogue not delegated');
    }
    return { sceneDialogue: [], dialogueSource: null, dialogueComplete: false, dialoguePlacedCount: 0 };
  })();
  let sceneDialogue = plannedDialogue;
  let dialoguePlacedCount = plannedPlacedCount;
  const spokenSceneCount = sceneDialogue.filter((l) => l.length > 0).length;
  // ALL-OR-NOTHING. The ElevenLabs dialogue leg is ONE track for the whole film, so it can only be
  // dropped wholesale — which means a line we failed to place in some scene's prompt would end up spoken
  // by nobody. `complete` is false whenever anything could not be placed (a third line inside one 6s
  // window, more lines than scenes, a line with no speakable words), and then we delegate NOTHING: the
  // prompts and the ElevenLabs path stay byte-identical to before.
  //
  // ⚠️ GEORGIAN IS NEVER HANDED TO VEO. Veo cannot speak it: the 2026-10-16 ad (a Georgian narration delegated scene by
  // scene) came back with a new voice in every scene and the words garbled. A Georgian film is voiced OFF CAMERA by one
  // ElevenLabs voice over the whole cut (the owner's call, 2026-10-16): nobody on screen talks (silentPresenter in the
  // plan), the clips render without Veo's own audio, and the ElevenLabs leg that owns the source voices every line.
  // Not for a music video: its singer sings, and that film's voice is the song. Keyed on the SOURCE text, not on
  // the lines that could be placed: a Georgian script too long to place is still voiced by ElevenLabs, and a clip
  // that talks on its own beside it is the same double voice.
  const offCameraText = dialogueSource === 'narrationScript' ? narrationAsDialogue
    : dialogueSource === 'dialogueScript' ? dialogueScriptRaw
    : dialogueSource === 'master-script'
      ? [parsedMaster?.narrationScript, ...(parsedMaster?.dialogue ?? []).map((d) => d.text)].filter(Boolean).join(' ')
      : sceneDialogue.flat().map((l) => l.text).join(' ');
  const offCameraVoice = !input.metadata?.musicVideoMode && !!offCameraText?.trim() && isGeorgianText(offCameraText);
  const delegateSpeech = nativeSpeech && !offCameraVoice && dialogueComplete && spokenSceneCount > 0;
  if (spokenSceneCount > 0 && !delegateSpeech) {
    // eslint-disable-next-line no-console
    console.log(`[filmComposite] dialogue from ${dialogueSource} NOT delegated to Veo (nativeSpeech=${nativeSpeech}, complete=${dialogueComplete}, offCamera=${offCameraVoice}) → ElevenLabs keeps every line`);
  }

  // ── EVERY WORD MUST FIT ITS SCENE ───────────────────────────────────────────
  // Veo never refuses a line that is too long for its clip: it rushes it, swallows words, or stops when the shot
  // ends. The 2026-10-16 ad (three 36–42-syllable Georgian lines on three 8 s scenes) came back exactly so —
  // speech from frame 0 to the last frame, the third line cut off. So the words are measured against the time
  // BEFORE anything is charged: an overfull scene hands its overflow to the next one (one speaker, words kept in
  // order, cut at a sentence or clause break — with chained scenes the speech runs on across the cut), and a
  // script that cannot fit the film at all is refused with the scene count it needs, never rendered half-said.
  if (delegateSpeech) {
    const sceneTexts = sceneDialogue.map((lines) => lines.map((l) => l.text).join(' '));
    const fit = checkSceneSpeech(sceneTexts, grid.clipSec);
    if (fit.overflow) {
      const speakers = Array.from(new Set(sceneDialogue.flat().map((l) => l.speaker ?? '')));
      const reflowed = speakers.length <= 1
        ? reflowSpeech(sceneTexts.filter((t) => t.trim()).join(' '), sceneDialogue.length, grid.clipSec)
        : null;
      if (!reflowed) {
        // eslint-disable-next-line no-console
        console.log(`[filmComposite] speech does not fit: ${fit.totalSeconds}s of speech over ${sceneDialogue.length} × ${grid.clipSec}s scenes — needs ${fit.scenesNeeded}; refused before any charge`);
        return speechTooLongResponse(input.locale, fit.totalSeconds, sceneDialogue.length, fit.scenesNeeded, grid.clipSec);
      }
      const speaker = speakers[0] || null;
      sceneDialogue = reflowed.map((text) => (text ? [{ text, speaker }] : []));
      dialoguePlacedCount = sceneDialogue.reduce((n, lines) => n + lines.length, 0);
      // eslint-disable-next-line no-console
      console.log(`[filmComposite] speech re-flowed across ${sceneDialogue.length} scenes so every word fits (${fit.scenes.map((x) => `${x.seconds}s`).join(' / ')} → ${checkSceneSpeech(reflowed, grid.clipSec).scenes.map((x) => `${x.seconds}s`).join(' / ')})`);
    }
  }
  // The off-camera voice is ONE track over the whole cut, so its words are measured against the film, not a scene: a
  // script longer than the film would be cut off at the last frame, so it is refused here, before any charge.
  if (offCameraVoice) {
    const seconds = speechSeconds(offCameraText ?? '');
    if (seconds > Math.max(0, grid.totalSec - SPEECH_LEAD_SEC - SPEECH_TAIL_SEC) * OVERFLOW_TOLERANCE) {
      const scenesNeeded = Math.ceil((seconds + SPEECH_LEAD_SEC + SPEECH_TAIL_SEC) / grid.clipSec);
      // eslint-disable-next-line no-console
      console.log(`[filmComposite] off-camera voice does not fit: ${Math.round(seconds)}s of speech over a ${grid.totalSec}s film — needs ${scenesNeeded} scenes; refused before any charge`);
      return speechTooLongResponse(input.locale, seconds, grid.sceneCount, scenesNeeded, grid.clipSec);
    }
  }

  // ⚠️ ENGLISH FOR THE RENDERER — VERBATIM FOR THE VOICE. Veo, Runway, Kling and LTX are trained
  // overwhelmingly on English, so a Georgian visual brief reached them as noise, the model fell back to its
  // priors, and the user got a competent-looking film unrelated to the one they asked for. On video that
  // failure is INVISIBLE: it plays fine and simply is not what was requested.
  //
  // TRANSLATED (all four are DESCRIPTIONS of what to render):
  //   · the brief, which becomes every scene's `subject`
  //   · the per-scene shot text (Prompt-Agent imagePrompts, Master-Script actions, pasted scene sheets)
  //   · the character appearance LOCK, stamped verbatim on every clip
  //   · the Director's negative list, which lands on Veo's dedicated negativePrompt field
  //
  // NOT TRANSLATED — `sceneDialogue`. Those are the words a character SPEAKS. buildSpeechDirection splices
  // them into the scene prompt verbatim BELOW this point, which is the entire reason lib/chat/sceneDialogue.ts
  // exists: Veo says the user's line, in the user's language, with synced lips. Translating them would replace
  // the user's line with a translation of it — and worse, the ElevenLabs dialogue leg has already been dropped
  // on the promise that Veo speaks them verbatim, so those words would be spoken by nobody at all.
  //
  // POSITION IS LOAD-BEARING. This sits AFTER every dialogue-source and scene-order check above, each of which
  // compares against the ORIGINAL text (`structuredScenes[i].prompt === sceneScripts[i]`). Translating any
  // earlier would break that equality and silently switch Veo's native speech back off.
  //
  // FAIL-OPEN, and free for a Latin-script brief (promptToEnglish returns immediately, no network call).
  // The user's own negative (the Veo panel's advanced field) joins the director's; normalisation happens in the plan.
  if (veoPlan?.negativePrompt) filmNegative = filmNegative ? `${filmNegative}, ${veoPlan.negativePrompt}` : veoPlan.negativePrompt;
  const [messageEn, characterLockEn, filmNegativeEn] = await Promise.all([
    promptToEnglish(input.message, 'video'),
    characterLock ? promptToEnglish(characterLock, 'video') : Promise.resolve(characterLock),
    filmNegative ? promptToEnglish(filmNegative, 'video') : Promise.resolve(filmNegative),
  ]);
  const sceneScriptsEn: string[] | undefined = sceneScripts?.length
    ? await Promise.all(sceneScripts.map((s) => promptToEnglish(s, 'video')))
    : undefined;
  const plan = planFilmScenes(messageEn, { avatarReference, referenceImages: hostedRefs, style, ...(filmTemplate ? { look: filmTemplate.look } : {}), orientation, musicVideo: !!input.metadata?.musicVideoMode, clipSec: grid.clipSec, ...(characterLockEn ? { characterLock: characterLockEn } : {}), ...(sceneScriptsEn?.length ? { sceneScripts: sceneScriptsEn, totalSec: sceneScriptsEn.length * grid.clipSec } : { totalSec: grid.totalSec }), ...(sceneMeta?.length ? { sceneMeta } : {}), ...(cameraMove ? { cameraMove } : {}), ...(motionIntensity ? { motionIntensity } : {}), ...(filmNegativeEn ? { negativePrompt: filmNegativeEn } : {}), ...(delegateSpeech ? { nativeSpeech: true, sceneDialogue } : {}), ...(offCameraVoice ? { silentPresenter: true } : {}), ...(veoPlan ? { veo: veoPlan.film, veoScenes: veoPlan.scenes, outputFormat: veoPlan.film.format } : {}) });
  // `grid.totalSec` (not a bare pinnedSceneCount × clipSec) is what the plan splits, so plan.sceneCount
  // and grid.sceneCount can never disagree — a mismatch would slide every dialogue line one scene off.
  const sceneCount = plan.shared.sceneCount || FILM_SCENE_COUNT;
  // Scenes whose prompt carries a line for Veo to speak. Whether the ElevenLabs leg is actually
  // suppressed is decided AFTER dispatch, once the real engine per clip is known (see below).
  const spokenOrdinals = plan.scenes.filter((s) => s.spokenLines.length > 0).map((s) => s.ordinal);
  const delegatedLineCount = plan.scenes.reduce((n, s) => n + s.spokenLines.length, 0);
  // FINAL PROOF before any leg may be dropped: every delegated line is present, verbatim, in the prompt
  // that will actually be submitted. `spokenLines` is derived from the plan INPUT, so on its own it only
  // says what we ASKED for; this checks what came out (the prompt passes through a length clamp). Also
  // requires the emitted count to equal what the resolver placed, so a scene the planner blanked (a
  // music-video intro shot) can never leave a line unspoken while its leg is dropped.
  const speechInPrompts = delegatedLineCount === dialoguePlacedCount
    && plan.scenes.every((s) => s.spokenLines.every((l) => s.prompt.includes(l)));
  if (spokenOrdinals.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[filmComposite] dialogue from ${dialogueSource}: ${delegatedLineCount}/${dialoguePlacedCount} line(s) verbatim in ${spokenOrdinals.length} Veo scene prompt(s)${speechInPrompts ? '' : ' — MISMATCH, ElevenLabs will keep the dialogue'}`);
  }
  const forecast = forecastFilm(sceneCount);
  const clipForecast = forecastMarginForAction('video_film');

  // ⚠️ NO VEO PLAN SENT (an older client, a direct caller) → render on the STUDIO default tier, explicitly. Left unset the engine
  // falls to its own default (Standard, $0.40/s) while the film is priced on Fast — a $3.20 render sold for ~$0.93 a clip.
  if (!plan.shared.veo) {
    plan.shared.veo = { tier: STUDIO_DEFAULT_VEO_TIER, format: orientation === 'vertical' ? '9:16' : '16:9', referenceMode: 'first_frame', generateAudio: true, seedLock: true, enhancePrompt: false };
  }

  // Stable per-request id; namespaces per-leg debit refs for idempotent retries.
  // ⚠️ ONE TIMESTAMP FOR THE FILM. The status token (deriveFilmTokenId) used to hash a second Date.now() taken after dispatch,
  // so nothing could lead from the token /assemble is handed back to the ledger row this film was charged under. The token
  // is now known BEFORE the charge, and the charge is taken under filmChargeRef(token): the durable proof of payment.
  const filmCreatedAt = Date.now();
  const compositeId = `film:${input.sessionId}:${filmCreatedAt}`;
  const filmTokenId = deriveFilmTokenId({ sessionId: input.sessionId, createdAt: filmCreatedAt, seed: plan.shared.seed });

  // ── ONE APPROVED START = AT MOST ONE CHARGE ─────────────────────────────────
  // ⚠️ THE FILM START HAD NO DUPLICATE GUARD. The chat's per-user paid-dispatch lock sits further down the router and the film
  // is dispatched before it, so a double-sent Generate — or a client retrying a start whose answer it never received — charged
  // the quote and rendered every clip again. The press's own id (or, without one, a key derived from the film) is claimed in
  // the shared database first; a duplicate is refused with nothing charged. A start that delivered nothing gives its key back.
  let startKey: string | null = null;
  let startWindowSec = 0;
  if (input.userId && input.userId !== 'anonymous') {
    const start = await filmStartKey(input.metadata, {
      sessionId: input.sessionId, message: input.message, totalSec: grid.totalSec,
      tier: plan.shared.veo?.tier ?? null, musicVideo: input.metadata?.musicVideoMode === true,
    });
    const claim = await claimPaidStartKey(input.userId, start.key, start.windowSec);
    if (claim === 'held') {
      // The same press again — most often a browser that timed out while the first start was charged and dispatched. It gets
      // THAT film back (its token and matrix) when the first start has answered, the plain refusal while it is still under
      // way; never a second charge or a second render.
      const replay = await getFilmStartReplay(input.userId, start.key, start.windowSec).catch(() => null);
      return replay ? filmStartReplayed(input.locale, replay.predictionId, replay.film) : filmStartRefused(input.locale, 'duplicate');
    }
    // Neither the database nor Redis could say whether this press already started a film: in Production that is a money
    // question nobody can answer, so nothing is charged; elsewhere (local / CI without the guard's table) it proceeds.
    if (claim === 'unavailable' && process.env.VERCEL_ENV === 'production') return filmStartRefused(input.locale, 'unconfirmed');
    if (claim === 'claimed') { startKey = start.key; startWindowSec = start.windowSec; }
  }
  const undoStart = async (): Promise<void> => {
    if (!startKey) return;
    const key = startKey;
    startKey = null;
    await releaseIdempotencyKey(input.userId, key).catch(() => {});
  };

  // ── THE VOICE TRACK ─────────────────────────────────────────────────────────
  // Which legs Veo already speaks in-clip is known only after dispatch (the double-voice guard below), so the sources take
  // that decision as an argument. An off-camera voice film has nothing delegated (its clips are silent), so its voice can be
  // made before anything is charged or sent.
  //   narration  → generateCheckedFilmVoiceover.narrationScript  (the sanitized VO spine, verbatim; listened to by Gemini)
  //   dialogue   → generateDialogueVoiceover.turns         (per-SPEAKER N-character casting)
  const filmVoiceSpec = (veoSpeaks: { dialogueLeg: boolean; narrationLeg: boolean; narrationSpine: string | null }) => {
    const suppressDialogueLeg = veoSpeaks.dialogueLeg;
    const suppressNarrationLeg = veoSpeaks.narrationLeg;
    const masterNarration = parsedMaster && parsedMaster.narrationScript.trim() ? parsedMaster.narrationScript.trim() : null;
    const customNarration = (() => {
      // Veo is already speaking these exact words inside the clips → voicing them again here is the double
      // voice. (Only fires when narrationScript was the delegated source; a real VO spine is untouched.)
      if (suppressNarrationLeg) return null;
      const v = voiceMeta?.narrationScript;
      const explicit = typeof v === 'string' && v.trim() ? v.trim() : null;
      // The parsed Master-Script VO spine feeds the SAME verbatim narrationScript slot when no explicit one is set.
      // Off camera, the lines written in the scene sheets feed no other leg: the narrator reads them, in scene order.
      const sheetLines = offCameraVoice && dialogueSource === 'script-scenes'
        ? sceneDialogue.flat().map((l) => l.text).join(' ').trim() || null
        : null;
      return explicit ?? masterNarration ?? sheetLines;
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
      // Veo speaks the ON-CAMERA dialogue in-clip → this leg would double it. The VO NARRATOR spine is NOT
      // delegated (a narrator has no mouth in frame), so it routes through the single-voice narration leg
      // below via `masterNarration` instead of being dropped.
      if (suppressDialogueLeg) return null;
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
    // Suppressed when Veo already speaks these lines in-clip (see the double-voice guard above).
    const dialogueScript = suppressDialogueLeg ? null : dialogueScriptRaw;
    return {
      masterTurns, dialogueScript, customNarration, narratorGender, voiceLanguage, voicePersona, voiceTone,
      suppressDialogueLeg, delegatedNarrationSpine: veoSpeaks.narrationSpine,
    } as const;
  };
  // DAY-6 multi-voice: when the Master-Script dialogue is multi-voice-viable (≥2 DISTINCT
  // TIMECODED speakers), render per-speaker STEMS ONCE (generateDialogueStems) so the assembler
  // spatial-premixes them with the -12dB sidechain duck. On ANY miss (not viable, 1 speaker, a
  // failed leg, or no ElevenLabs key) it returns null and we fall through to the EXACT single-track
  // path below — so every single-voice / narration film is byte-identical to before. No double-render:
  // generateDialogueStems returns null (never a partial upload) before we reach generateDialogueVoiceover.
  // `checked` is the narration as Gemini heard it (lib/chat/filmVoiceCheck): its score (its words are not timed since PR 5e).
  const renderVoiceTrack = async (spec: ReturnType<typeof filmVoiceSpec>): Promise<{ voiceUrl: string | null; dialogueStems: DialogueStem[] | null; checked?: CheckedFilmVoiceover | null }> => {
    const { masterTurns, dialogueScript, customNarration, narratorGender, voiceLanguage, voicePersona, voiceTone, suppressDialogueLeg, delegatedNarrationSpine } = spec;
    const heard: { v: CheckedFilmVoiceover | null } = { v: null };
    const narrate = async (narrationScript: string | null, leg: string): Promise<string | null> => {
      heard.v = await generateCheckedFilmVoiceover({
        brief: input.message,
        totalSec: plan.shared.totalSec,
        compositeId,
        narrationScript,
        narratorGender,
        voiceLanguage,
        voicePersona,
        voiceTone,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[film] ${leg} leg failed:`, err instanceof Error ? err.message : err);
        return null;
      });
      return heard.v?.url ?? null;
    };
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
    // TRACK 3.3 — Music Video mode: the SONG leads, so skip the spoken narrator/dialogue VO track
    // ENTIRELY (no VO mixed over the vocal → zero sync drift). Documentary is byte-identical to before.
    const single = input.metadata?.musicVideoMode
      ? null
      // SUPPRESSION MUST NOT PROMOTE A DIFFERENT VOICE. Nulling `dialogueScript`/`masterTurns` does not
      // end this ternary chain — it ADVANCES it, so a film whose dialogue Veo now speaks would fall
      // through to the narration leg and get a narrator track laid over clips that already talk
      // (either the same words again from the "what the character says" box, or a brand-new brief-derived
      // commentary). The ONLY voice that legitimately survives delegation is a VO NARRATOR SPINE that was
      // already part of the suppressed leg — i.e. a Master Script's own VO sheet, which is off-camera and
      // was never delegated. Everything else: no voice track.
      : suppressDialogueLeg
      ? (delegatedNarrationSpine ? await narrate(delegatedNarrationSpine, 'narrator-spine') : null)
      : (masterTurns || dialogueScript)
      ? await generateDialogueVoiceover(
          // Structured Master-Script turns → N-character casting; else the legacy gender-tagged script.
          masterTurns ? { turns: masterTurns, compositeId } : { script: dialogueScript!, compositeId },
        ).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[film] dialogue voiceover leg failed:', err instanceof Error ? err.message : err);
          return null;
        })
      : (wantsCommentary(input.message) || customNarration)
      ? await narrate(customNarration, 'voiceover')
      : null;
    return { voiceUrl: single, dialogueStems: null, checked: heard.v };
  };

  // ── AN OFF-CAMERA VOICE IS MADE FIRST ───────────────────────────────────────
  // ⚠️ 2026-10-17: the paid 32 s ad came back SILENT. A Georgian film is voiced off camera by ElevenLabs only (its clips
  // render with Veo's own audio off, see offCameraVoice), the voice leg ran beside the clips, ElevenLabs refused every
  // request, and the leg's null quietly became a film with no sound after the Veo render was paid for. That voice is the
  // film's only speech, so it is made before anything is charged or rendered: no voice, no film, nothing taken.
  let voiceMadeFirst: { voiceUrl: string | null; dialogueStems: DialogueStem[] | null; checked?: CheckedFilmVoiceover | null } | null = null;
  if (offCameraVoice) {
    voiceMadeFirst = await renderVoiceTrack(filmVoiceSpec({ dialogueLeg: false, narrationLeg: false, narrationSpine: null }));
    if (!voiceMadeFirst.voiceUrl && !voiceMadeFirst.dialogueStems?.length) {
      // eslint-disable-next-line no-console
      console.warn('[filmComposite] off-camera voice could not be made (ElevenLabs gave no audio) → film refused before any charge or render');
      await undoStart();
      return filmVoiceUnavailableResponse(input.locale);
    }
    // …and it must SAY the film's words (the owner's audit 2026-10-17, item 3): read twice, both reads lost most of them.
    if (voiceMadeFirst.checked?.verdict === 'fail') {
      // eslint-disable-next-line no-console
      console.warn(`[filmComposite] off-camera voice did not say its words (score ${voiceMadeFirst.checked.score}, ${voiceMadeFirst.checked.reads} reads) → film refused before any charge or render`);
      await undoStart();
      return filmVoiceUnclearResponse(input.locale);
    }
  }

  // ── Pre-flight: balance gate (skips anonymous; downstream gate covers them) ─
  // (Clip legs never charge: the film is debited once up front and renderClip always gets the waiver — see its call.)
  // Tracked so a film that dispatches nothing can hand the slot back (see the restore below).
  let freeFilmConsumed = false;
  // ⚠️ THE FILM IS CHARGED ONCE, UP FRONT, AT ITS QUOTE (lib/credits/videoPricing — the number on the Generate button).
  // It used to be charged almost nothing: each clip's debit called `debit_wallet_gel`, which does not exist on the production
  // database (so every clip was free), and the stitch took a flat 20 credits whatever the length — a 48 s film cost the
  // platform ~$5.76 of Veo and the customer 20 credits. `filmCharged` is what is currently held against this film (net of any
  // dispatch-time refund); the ref makes every debit/refund of it idempotent.
  let filmCharged = 0;
  // The quote as taken, before any refund: every scene's share (dispatch refund and R3-A alike) is cut from it.
  let filmQuoteTaken = 0;
  const filmChargeRef = filmChargeRefFor(filmTokenId);
  if (input.userId && input.userId !== 'anonymous') {
    // A founder/promo FREE film needs ZERO wallet balance, so it must bypass the
    // gate entirely — otherwise a 0.00 ₾ wallet would block the very first free
    // film (the regression the no-row→0 balance change introduced).
    //
    // ⚠️ THIS USED TO *PEEK* THE SLOT — READ IT, WAIVE EVERY CLIP, AND NEVER SPEND IT. The counter was
    // decremented only by /api/video/assemble, which the CLIENT calls afterwards. So anyone who ran the
    // film pipeline and simply never assembled kept `free_films_remaining` at its starting value and got
    // the expensive half free every single time: the clips ARE the cost ($0.96 of Veo each, up to 12 per
    // film), while the stitch is 20 credits. A one-video quota that is never consumed is not a quota.
    //
    // Consumed ATOMICALLY here instead, at the moment the waiver is granted, via the race-safe
    // consume_free_film RPC — and restored below if the film fails to dispatch a single clip, so a
    // broken render never eats someone's only free video. The waiver is then recorded SERVER-SIDE
    // (recordFreeFilmWaiver) so /assemble honours the same slot for the stitch rather than taking a
    // second one; that marker deliberately does not travel in the client-held `film:` token.
    // ⚠️ THE FREE VIDEO IS ONE SHORT CLIP (TRIAL.freeFilmMaxSeconds = 8 s), NOT "A FILM OF ANY LENGTH". The slot was spent on
    // whatever the user asked for, so a new account's free film could be 48 s ($5.76 of Veo) — and with the studio now
    // offering up to 4 minutes, an e-mail address would buy $28. A longer film simply isn't the free one: it is a paid film and
    // the slot stays for a short clip.
    const freeEligible = grid.totalSec <= TRIAL.freeFilmMaxSeconds;
    const consumed = freeEligible ? await consumeFreeFilm(input.userId).catch(() => null) : null;
    const hasFreeFilm = typeof consumed === 'number' && consumed >= 0;
    freeFilmConsumed = hasFreeFilm;
    // Founder/admin renders on the platform's own provider budget → bypass the
    // wallet gate (their personal wallet may legitimately be 0 while the platform
    // LTX balance funds the real render). Checked only when no free film applies.
    const founderBypass = hasFreeFilm ? false : await isAdminUser(input.userId);
    // ⚠️ THE FREE FILM IS PAID BY THE PLATFORM — and anyone gets one by signing up. On Veo Standard ($0.40/s) a 48 s
    // free film is $19.20 of Google spend for an e-mail address; on Fast ($0.12/s at 1080p) it is $5.76. Google-only
    // free films therefore render on Fast at most (Lite stays Lite). Founder/admin renders and paid films keep the
    // tier they chose.
    if (hasFreeFilm && plan.shared.veo?.tier !== 'lite') {
      plan.shared.veo = plan.shared.veo
        ? { ...plan.shared.veo, tier: 'fast' }
        : { tier: 'fast', format: orientation === 'vertical' ? '9:16' : '16:9', referenceMode: 'first_frame', generateAudio: true, seedLock: true, enhancePrompt: false };
    }
    const balance = (hasFreeFilm || founderBypass) ? null : await readWalletBalanceGel(input.userId);
    if (!hasFreeFilm && !founderBypass) {
      // The price is the quote for THIS film's real length, Veo tier and mode — the same function the button shows.
      const filmQuote = videoCredits({
        seconds: grid.totalSec,
        scenes: grid.sceneCount,
        quality: plan.shared.veo?.tier ?? STUDIO_DEFAULT_VEO_TIER,
        mode: input.metadata?.musicVideoMode ? 'musicvideo' : 'documentary',
        referenceMode: plan.shared.veo?.referenceMode === 'reference',
      });
      // The pre-flight gate (credits against credits — it compared credits with ₾, ten times too lax) stops the obvious
      // case before anything is touched; the debit below is the real, atomic guard.
      if (filmBalanceDecision(balance, filmQuote) === 'insufficient') {
        await undoStart();
        return insufficientCreditsResponse('video_generation', filmQuote, input.locale);
      }
      const debit = await deductCredits(input.userId, filmQuote, filmChargeRef);
      if (!debit.ok) {
        // 'insufficient' is the honest top-up answer; anything else (ledger down, RPC absent) FAILS CLOSED — a render we
        // cannot charge for must not start, and nothing was taken, so nothing needs refunding.
        await undoStart();
        return debit.reason === 'insufficient'
          ? insufficientCreditsResponse('video_generation', filmQuote, input.locale)
          : chargeRefusedResponse('video_generation', filmQuote, 'error', input.locale);
      }
      filmCharged = filmQuote;
      filmQuoteTaken = filmQuote;
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
    console.warn(`[film] refunding ${billed.length} billed clip leg(s) that produced nothing, for ${input.userId}`);
    // ⚠️ REFUND WHAT THE LEDGER SHOWS WAS TAKEN — NEVER A FORECAST. This used to pay `clipForecast.retailGel` back
    // through credit_wallet_gel, which converts GEL at ×10: a 2.0 ₾ leg came back as 20 CREDITS while the debit
    // (debit_wallet_gel) is not even defined on the production database — so a charge of nothing was "refunded"
    // with 20 credits, and every refused Veo scene minted balance. refundDebitByRef pays back exactly the net debit
    // under the leg's own deductRef (0 when none landed), idempotent on `${ref}:refund`.
    await Promise.all(
      billed.map((c) =>
        refundDebitByRef(input.userId as string, `${compositeId}:clip:${c.ordinal}`).catch(() => null),
      ),
    );
  };

  // ⚠️ GIVE BACK WHAT THIS REQUEST CAN PROVE IT DID NOT DELIVER — AND ONLY THAT. Decided from state THIS request owns (its own
  // synchronous dispatch results), never from a client-held token or a later poll: `film:` is unsigned and a transient 429 can
  // read as 'failed', so refunding on a poll result would let anyone mint credits (the long-standing reason async failures are
  // not refunded). `scenes` = how many of the film's scenes produced nothing at dispatch; 'all' = the whole film.
  // Idempotent on the film's own refs, and what is returned stays out of the amount /assemble is later told was paid.
  const refundFilmScenes = async (scenes: number | 'all'): Promise<void> => {
    if (!realUser || filmCharged <= 0 || !input.userId) return;
    const total = Math.max(1, plan.scenes.length);
    const amount = scenes === 'all'
      ? filmCharged
      : Math.min(filmCharged, perSceneCredits(filmCharged, total) * Math.max(0, scenes));
    if (amount <= 0) return;
    const ref = scenes === 'all' ? `${filmChargeRef}:refund` : `${filmChargeRef}:refund:dispatch`;
    const r = await refundCredits(input.userId, amount, ref).catch(() => null);
    if (r?.ok) filmCharged -= amount;
    // eslint-disable-next-line no-console
    else console.error(`[film] REFUND FAILED ref=${ref} user=${input.userId} amount=${amount} — needs manual credit`);
  };

  // The platform's own spend limit stopped every clip (not the provider): say which limit and when it lifts.
  const budgetRefused = (reason?: string): ChatResponse => ({
    success: false,
    intent: 'video_generation',
    responseType: 'text',
    message: budgetRefusalMessage(input.locale, reason),
    metadata: {
      provider: 'composite',
      composite: true,
      platformBudget: true,
      budgetReason: reason ?? 'daily_limit',
      balanceProtected: true,
    },
  });

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
  // OFF-CAMERA VOICE → the clips render without Veo's own audio: a silent presenter's clip would otherwise carry a
  // murmur under the voice-over. (Vertex honours the switch, and costs less without audio; the Gemini API always
  // renders sound.) The film's price is unchanged.
  if (offCameraVoice && plan.shared.veo) plan.shared.veo = { ...plan.shared.veo, generateAudio: false };

  let clips: FilmClipResult[];
  // True once the later scenes wait on the sequential chain (lib/chat/filmChain): the token says so, and the poll advances it.
  let filmChained = false;
  // Every scene's own clip request and storyboard frame, kept for a scene redo (lib/chat/filmSceneRedo) once the film is out.
  let bookScenes: FilmBookScene[] | null = null;
  try {
    // PREFER approved storyboard frames (from /api/film/storyboard) as the
    // per-scene identity anchors: the user reviewed them, so the render MATCHES
    // the storyboard. They align with plan.scenes by index (same deterministic
    // plan/prompt/seed produced both). Without them a scene has no frame: the
    // on-dispatch frame chain (FLUX / NanoBanana via ServiceManager) is gone.
    const approvedFrames = Array.isArray(input.metadata?.sceneFrames)
      ? (input.metadata.sceneFrames as unknown[]).map((f) =>
          typeof f === 'string' && /^https?:\/\//i.test(f) ? f : null)
      : null;
    // REFERENCE MODE (the studio's Veo plan): the photos ride as Veo asset references and Veo composes each scene
    // itself — a first frame would be dropped by the engine (it cannot take both), so no frame is made or paid for.
    const referenceMode = veoPlan?.film.referenceMode === 'reference';
    const sceneFrames = referenceMode
      ? plan.scenes.map(() => null as string | null)
      : approvedFrames && approvedFrames.length === plan.scenes.length
        ? approvedFrames
        : plan.scenes.map(() => null as string | null);
    // FRAME CHAINING — each clip ends on the next scene's first frame (Veo first→last interpolation), so every
    // join is a match cut: same framing, light, pose and wardrobe on both sides of the cut. Independent clips
    // rendered in parallel each drifted on their own (the 2026-10-16 ad: framing, background and colour jumped at
    // every join). 8 s clips only (Google's interpolation length); FILM_FRAME_CHAIN=0 turns it off.
    // SEQUENTIAL CHAIN (owner's choice, 2026-10-16) — scene 1 renders now; every later scene starts from the previous
    // clip's REAL last frame, dispatched by the film's poll once that clip lands (lib/chat/filmChain). Asking Veo to end a
    // clip on the next storyboard frame did not hold on the paid ad, so the joins jumped. Needs a store every poll can
    // read; without one, and for anything the chain does not cover, the scenes render side by side exactly as before.
    const sequential = filmSequentialChainOn({
      sceneCount: plan.scenes.length,
      googleOnly: true,
      referenceMode,
      musicVideo: !!input.metadata?.musicVideoMode,
      owner: input.userId,
    }) && filmChainStoreReady();
    let chained: FilmClipResult[] | null = null;
    let firstClip: FilmClipResult | null = null;
    if (sequential) {
      // no per-clip legs: the film was charged ONCE up front (filmCharged), as in the side-by-side path below
      firstClip = await renderClip(input, plan.scenes[0]!, plan.shared, compositeId, clipForecast.wholesaleGel, clipForecast.retailGel, sceneFrames[0] ?? null, true);
      if (firstClip.status === 'queued') {
        const saved = await saveFilmChainPlan({
          v: 1,
          tokenId: filmTokenId,
          uid: input.userId as string,
          sessionId: input.sessionId,
          locale: input.locale,
          compositeId,
          videoModel: effectiveVideoModel ?? null,
          forecast: { wholesaleGel: clipForecast.wholesaleGel, retailGel: clipForecast.retailGel },
          sceneCredits: filmCharged > 0 ? perSceneCredits(filmQuoteTaken, Math.max(1, plan.scenes.length)) : 0,
          chargeRef: filmCharged > 0 ? filmChargeRef : null,
          scenes: plan.scenes.slice(1).map((scene, i) => {
            const req = buildFilmClipRequest(scene, plan.shared);
            return { ordinal: scene.ordinal, seed: scene.seed, userPrompt: req.userPrompt, selectedOptions: req.selectedOptions, storyboardFrame: sceneFrames[i + 1] ?? null };
          }),
          createdAt: Date.now(),
        });
        if (saved) {
          // The waiting scenes are Veo scenes (the chain runs only behind the Google-only boundary): the double-voice guard
          // below counts them as such.
          chained = [firstClip, ...plan.scenes.slice(1).map((scene): FilmClipResult => ({ ordinal: scene.ordinal, taskRef: null, status: 'pending', attempts: 0, debited: false, engine: 'gemini-veo' }))];
          // eslint-disable-next-line no-console
          console.log(`[filmComposite] sequential chain: scene 1 sent, ${plan.scenes.length - 1} scene(s) start from the previous clip's last frame`);
        }
      }
    }
    bookScenes = plan.scenes.map((scene, i) => {
      const req = buildFilmClipRequest(scene, plan.shared);
      return { ordinal: scene.ordinal, seed: scene.seed, userPrompt: req.userPrompt, selectedOptions: req.selectedOptions, storyboardFrame: sceneFrames[i] ?? null };
    });
    if (chained) {
      clips = chained;
      filmChained = true;
    } else {
      const chainFrames = filmFrameChainOn(grid.clipSec, sceneFrames);
      if (chainFrames) {
        // eslint-disable-next-line no-console
        console.log(`[filmComposite] frame chaining on: ${sceneFrames.length - 1} clip(s) end on the next scene's first frame`);
      }
      // A chain whose plan could not be stored keeps the scene 1 it already sent; the rest go side by side.
      const sent = firstClip;
      clips = await mapWithConcurrency(plan.scenes, clipDispatchConcurrency(), (scene, i) =>
        i === 0 && sent
          ? Promise.resolve(sent)
          : renderClip(
            input,
            scene,
            plan.shared,
            compositeId,
            clipForecast.wholesaleGel,
            clipForecast.retailGel,
            sceneFrames[i] ?? null,
            true, // no per-clip legs: the film was charged ONCE up front (filmCharged) — `debit_wallet_gel` is not on prod, and if it ever is, this keeps it from charging twice
            chainFrames ? chainEndFrame(sceneFrames, i) : null,
          ),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[film] scene synthesis threw — protecting balance:', err instanceof Error ? err.message : err);
    await refundFilmScenes('all');
    if (freeFilmConsumed && input.userId) await restoreFreeFilm(input.userId).catch(() => {});
    await undoStart();
    return connectionFailed(err instanceof Error ? err.message : String(err));
  }
  const anyClip = clips.some((c) => c.status === 'queued');

  // ── 38% FAILURE GUARD — the upstream synthesis request timed out / threw and
  // NO clip queued. Atomically refund every billed leg and return the clean,
  // localized "balance protected" halt instead of a half-charged dead pipeline.
  if (!anyClip) {
    await rollbackFilmDebits(clips);
    await refundFilmScenes('all');
    // ⚠️ HAND THE FREE VIDEO BACK. The slot is spent up front (see the waiver above) so it cannot be
    // reused, which means a film that dispatched nothing must return it — otherwise a provider outage
    // silently costs the user their only free video and they have nothing to show for it.
    if (freeFilmConsumed && input.userId) await restoreFreeFilm(input.userId).catch(() => {});
    // Bubble up WHY every clip failed (first distinct upstream reason) so the
    // failure is actionable instead of an opaque "couldn't connect".
    const reason = clips.map((c) => c.error).find((e): e is string => Boolean(e)) ?? null;
    await undoStart();
    const budgetError = clips.map((c) => c.error).find((e): e is string => isBudgetRefusal(e));
    if (budgetError) return budgetRefused(budgetReasonOf(budgetError));
    return connectionFailed(reason);
  }

  // ── PARTIAL FAILURE — refund the legs that were billed and produced nothing ──
  //
  // ⚠️ THE ROLLBACK ABOVE ONLY RUNS WHEN *NOTHING* QUEUED, AND THAT WAS THE HOLE. A leg is billed the
  // moment withTrace's inner call resolves (`if (billable) debited = true`, above) — including when the
  // dispatch came back with NO task reference and every retry was exhausted. So a five-scene film where
  // three clips queued and two died kept the money for the two that produced nothing: `anyClip` was
  // true, this whole branch was skipped, and no other code path in the pipeline credits a clip leg.
  //
  // ⚠️ THIS IS SAFE TO DO HERE AND ONLY HERE. The refund is decided from state THIS request owns — the
  // legs it just dispatched and their task references — so there is no client-supplied token, no
  // caller-declared "it failed", and nothing to farm. That distinction is why the ASYNC failure (a clip
  // that queues and then dies at the provider) is deliberately still not refunded: `film:` is an
  // unsigned, client-held token and a transient 429 can read as 'failed', so refunding on a poll result
  // would let anyone mint credits. Closing that one needs the server-authoritative per-clip charge
  // record; it is not a missing function call.
  const strandedLegs = clips.filter((c) => c.debited && c.status !== 'queued');
  if (strandedLegs.length) await rollbackFilmDebits(strandedLegs);
  // The up-front charge's share for every scene that produced nothing AT DISPATCH (a refused / exhausted request — state this
  // request owns). A scene that queues and dies later is the async case above: deliberately not refunded here.
  const deadAtDispatch = clips.filter((c) => c.status === 'failed').length;
  if (deadAtDispatch > 0) await refundFilmScenes(deadAtDispatch);

  // ── DOUBLE-VOICE GUARD ──────────────────────────────────────────────────────
  // The stitch PRESERVES each clip's native audio (nativeAudio[] → the filtergraph's diegetic lane), so a
  // Veo clip arrives already speaking its line. Laying the same words down again as an ElevenLabs track
  // would be audibly doubled and out of sync.
  //
  // The decision is made HERE, not at plan time, because it must be keyed on the engine that ACTUALLY
  // took each clip — not on the engine we hoped for. Veo falling back to Runway/Kling/LTX yields a MUTE
  // clip, and suppressing the VO for that would leave the film silent exactly where it should talk. So we
  // only drop a leg when EVERY scene carrying a line went to Veo; a partial or total fallback keeps the
  // ElevenLabs path byte-identical to before.
  const veoOrdinals = new Set(clips.filter((c) => c.engine === 'gemini-veo').map((c) => c.ordinal));
  const allSpokenOnVeo = spokenOrdinals.length > 0 && speechInPrompts && spokenOrdinals.every((o) => veoOrdinals.has(o));
  // 'script-scenes' is deliberately absent: those lines live only in the pasted message and feed no
  // ElevenLabs leg, so there is nothing to suppress (and suppressing would be a lie about what was voiced).
  const suppressDialogueLeg = allSpokenOnVeo && (dialogueSource === 'master-script' || dialogueSource === 'dialogueScript');
  // The off-camera VO NARRATOR spine of a Master Script. masterDialogueTurns FOLDS it into the dialogue leg
  // we are about to drop, and a narrator has no mouth in frame so it was never delegated to Veo — it has to
  // keep its ElevenLabs voice. Only ever this: never the dialogue textarea, never a brief-derived commentary.
  const delegatedNarrationSpine = suppressDialogueLeg && dialogueSource === 'master-script'
    ? (parsedMaster?.narrationScript?.trim() || null)
    : null;
  const suppressNarrationLeg = allSpokenOnVeo && dialogueSource === 'narrationScript';
  if (spokenOrdinals.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[film] in-clip speech: ${spokenOrdinals.filter((o) => veoOrdinals.has(o)).length}/${spokenOrdinals.length} spoken scene(s) accepted by Veo → ElevenLabs ${
        suppressDialogueLeg || suppressNarrationLeg ? `${dialogueSource} leg SUPPRESSED (no double voice)` : 'leg kept (fallback engine is mute)'}`,
    );
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
  } else if (lyriaBedReady()) {
    // The score is Lyria on Vertex and runs SYNCHRONOUSLY at the assemble step (lib/audio/lyriaBed), so there is
    // no async audio leg here (no workId, no charge).
    // eslint-disable-next-line no-console
    console.log('[film] Lyria configured → score composed at assemble; no audio leg here');
  }
  // v330 — Udio is fully retired. Music is generated at the ASSEMBLE step (ElevenLabs
  // Music primary, Replicate MusicGen fallback), so the film's async audio leg no longer
  // mints a workId — `musicWorkId` stays null and the union poll reports audio 'skipped'.

  // ── Leg 4b: narration voice-over (PHASE 48 §2) ─
  // STRICTLY fail-open + unbilled. Voice-over only fires when the brief asks for a commentator/narrator
  // OR the user typed verbatim dialogue (narrationScript). The SFX leg (§49.7) is gone since PR 5e.
  // (voiceMeta + parsedMaster are resolved up-front, before the plan — the scene grid and the per-scene
  // spoken lines both derive from the same parse.)
  // (The voice's sources and its render: filmVoiceSpec / renderVoiceTrack, above the charge.)
  // PHASE 25 (VECTOR 2) — QA DIRECTOR AGENT pre-assembly gate. Pure, deterministic, fail-open. It
  // grades the collective PLANNING output (character lock, scene count, empty/monotone scenes,
  // orientation). Its one correction, filling a missing per-scene SFX cue, fed the SFX brief, which is gone
  // since PR 5e, so it is no longer adopted. Everything is a graded FLAG
  // (logged + returned in metadata.film.qa), NOT an unbounded LLM re-generation loop (see the module
  // header for why that would spiral cost/latency). Async per-clip render outcomes are out of scope
  // here — they resolve at poll time and are covered by the Phase-23 retry/down-shift + salvage gate.
  let qaVerdict: { grade: string; pass: boolean; issues: { code: string; severity: string; detail: string; autoFixed?: boolean }[] } | null = null;
  try {
    const qa = evaluateFilmQa({
      characterLock,
      characterAnchor: plan.shared.characterAnchor,
      scenePrompts: plan.scenes.map((s) => s.prompt),
      sfxCues: sfxCues?.map((c) => ({ sceneNumber: c.sceneNumber, sfxPrompt: c.sfxPrompt })),
      orientation: plan.shared.orientation,
      sceneCount,
    });
    qaVerdict = { grade: qa.grade, pass: qa.pass, issues: qa.issues };
    // eslint-disable-next-line no-console
    console.info(`[film][qa] grade=${qa.grade} pass=${qa.pass} issues=${qa.issues.map((i) => i.code).join(',') || 'none'}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[film][qa] gate errored (fail-open, skipping):', err instanceof Error ? err.message : err);
  }

  // An off-camera voice was made before the clips (AN OFF-CAMERA VOICE IS MADE FIRST); every other film's voice is made here.
  const voiceResult = await (voiceMadeFirst ?? renderVoiceTrack(filmVoiceSpec({ dialogueLeg: suppressDialogueLeg, narrationLeg: suppressNarrationLeg, narrationSpine: delegatedNarrationSpine })));
  // No sound-effects bed: it was ElevenLabs sound-generation, which has no Google engine (MASTER TASK v3.1 PR 5e). Veo's own
  // audio carries each clip's ambience; the field stays for the assembly contract and is always null.
  const sfxUrl: string | null = null;
  const voiceUrl = voiceResult.voiceUrl;
  if (voiceResult.checked) {
    // eslint-disable-next-line no-console
    console.log(`[film] voice check: score ${voiceResult.checked.score ?? 'unverified'}, verdict ${voiceResult.checked.verdict ?? 'none'}, ${voiceResult.checked.reads} read(s)`);
    // The narration's words, timed, for the subtitles the user may ask for at the stitch (never burned unless asked).
    if (voiceResult.checked.words?.length && input.userId && input.userId !== 'anonymous') {
      await recordFilmCaptions(filmTokenId, input.userId, voiceResult.checked.words).catch(() => {});
    }
  }
  // DAY-6 — the per-speaker dialogue stems (null for single-voice / narration films).
  const dialogueStems = voiceResult.dialogueStems;

  timer.mark('clips-dispatched+voice+sfx');

  // PHASE 43 §1 — Mint the Union Poll token. Every clip taskRef + the audio
  // workId rides in ONE predictionId; `pollFilmTask` decodes it and polls the
  // full matrix in lock-step instead of tracking a single clip.
  // deriveFilmTokenId() must hash the SAME createdAt the token carries (filmCreatedAt, taken before the charge), or /assemble
  // would look up a different record and ledger ref and bill a free or paid film again.
  const filmToken = encodeFilmRef({
    sessionId: input.sessionId,
    createdAt: filmCreatedAt,
    seed: plan.shared.seed,
    sceneCount,
    // The real per-scene length (4–8s) — the assembler derives the master timeline from it, so a 6s grid
    // must not be stitched as 8s.
    clipSec: grid.clipSec,
    clips: clips.map((c) => ({ ordinal: c.ordinal, taskRef: c.taskRef, status: clipDispatchStatus(c.status), attempts: c.attempts })),
    // The later scenes are dispatched by the poll from the previous clip's last frame (lib/chat/filmChain).
    ...(filmChained ? { chain: true } : {}),
    musicWorkId,
    voiceUrl,
    sfxUrl,
    // DAY-6 multi-voice — carried through the token so the poll surfaces them to the
    // authed client, which forwards them to /api/video/assemble. Absent → single-voice.
    ...(dialogueStems && dialogueStems.length ? { dialogueStems } : {}),
  });

  // ⚠️ TELL /assemble THAT THIS FILM IS ALREADY PAID FOR, SERVER-SIDE. The free slot was spent above to
  // waive the clips; without this marker the stitch would either take a SECOND slot or charge
  // ASSEMBLE_COST (20 credits) for a film the user was told is free. Written to the film status store
  // — never into `filmToken`, which the client holds and could forge into unlimited free assembles.
  // Owner-bound and single-use on the assemble side. Fail-open: a store miss just bills normally.
  if (freeFilmConsumed && input.userId) {
    // Durable first (film_billing, migration 20261014a); the Redis marker stays as the cache /assemble falls back to.
    await recordFilmBilling({ uid: input.userId, tokenId: filmTokenId, kind: 'free', credits: 0, ref: null }).catch(() => 'unavailable');
    await recordFreeFilmWaiver(filmTokenId, input.userId).catch(() => {});
  }
  // The same for a PAID film: the whole price is already taken, so the stitch must not charge it again (its own key — see
  // recordFilmPaid). Fail-open: a store miss makes /assemble bill the stitch by the film's length, the safe direction.
  if (filmCharged > 0 && input.userId) {
    // The ledger row under filmChargeRef IS the proof of payment; film_billing counts the stitches it covers (a lost row is
    // rebuilt from the ledger by /assemble), and the Redis marker is only the cache.
    await recordFilmBilling({ uid: input.userId, tokenId: filmTokenId, kind: 'paid', credits: filmCharged, ref: filmChargeRef }).catch(() => 'unavailable');
    await recordFilmPaid(filmTokenId, { uid: input.userId, credits: filmCharged, ref: filmChargeRef }).catch(() => {});
    // R3-A: each queued Veo scene's operation and share, recorded SERVER-SIDE, so a scene Google fails later can be given
    // back on the server's own word (lib/chat/filmSceneRefund) — never on the client-held token. Fail-open: no record = no
    // async refund, as before.
    const shares = filmSceneShares(clips, perSceneCredits(filmQuoteTaken, Math.max(1, plan.scenes.length)));
    if (shares.length > 0) await recordFilmScenes(input.userId, filmTokenId, shares).catch(() => 'unavailable');
  }
  // The film's scene book: what one scene costs and how each was asked for, so the owner can have ONE scene rendered again
  // at that scene's price and cut back into this film (owner's tap 2026-10-17 14:26:55Z, "სცენის ფასი"). Fail-open: without
  // it a redo is simply not offered for this film.
  if (input.userId && input.userId !== 'anonymous' && bookScenes) {
    await saveFilmSceneBook({
      v: 1,
      tokenId: filmTokenId,
      uid: input.userId,
      sessionId: input.sessionId,
      locale: input.locale,
      compositeId,
      videoModel: effectiveVideoModel ?? null,
      forecast: { wholesaleGel: clipForecast.wholesaleGel, retailGel: clipForecast.retailGel },
      // One scene: its clip and what the film adds to it, without the film's base (lib/credits/priceBook sceneCredits).
      scenePrice: sceneCredits(plan.shared.veo?.tier ?? STUDIO_DEFAULT_VEO_TIER, Boolean(input.metadata?.musicVideoMode), grid.clipSec, plan.shared.veo?.referenceMode === 'reference'),
      scenes: bookScenes,
      createdAt: Date.now(),
    }).catch(() => false);
  }

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
    qa: qaVerdict,
  };

  const renderedCount = clips.filter((c) => c.status === 'queued').length;
  const summary = [
    `🎬 Film pipeline started (${sceneCount} × ${grid.clipSec}s Veo scenes)`,
    `📝 Storyboard: ${sceneCount} scenes planned`,
    filmChained
      ? `🎥 Scene 1 dispatched; scenes 2–${sceneCount} each start from the previous scene's last frame (shared seed ${plan.shared.seed})`
      : `🎥 Clips dispatched: ${renderedCount}/${sceneCount} (shared seed ${plan.shared.seed})`,
    '✂️ Editor will stitch the final cut',
    // musicWorkId is always null (Udio retired) — the score is generated at the ASSEMBLE step (Lyria) or the
    // user's custom soundtrack is used. So don't tell every user "Score skipped".
    (hasCustomSoundtrack || lyriaBedReady()) ? '🎵 Score added at final assembly' : '⚠️ No score',
  ].join('\n');

  timer.mark('dispatch-complete');
  // eslint-disable-next-line no-console
  console.log('[film] timing', JSON.stringify(timer.summary()));
  // A retry of this press whose answer was lost gets this same film back (see the start guard above).
  if (startKey) await recordFilmStartReplay(input.userId, startKey, { predictionId: filmToken, film: filmSummary }, startWindowSec).catch(() => {});

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

/** The script holds more speech than the film's scenes can say: refuse before any charge, naming what would fit. */
/** A film whose off-camera voice could not be made: refused before anything was charged or rendered. */
function filmVoiceUnavailableResponse(locale: string | undefined): ChatResponse {
  const loc = (locale || 'ka').toLowerCase();
  const message = loc === 'en'
    ? 'The film’s voice could not be made right now (the voice service did not answer), so the film was not started — nothing was charged. Please try again later.'
    : loc === 'ru'
      ? 'Голос фильма сейчас не удалось создать (голосовой сервис не ответил), поэтому фильм не запущен — ничего не списано. Попробуйте позже.'
      : 'ფილმის ხმა ახლა ვერ შეიქმნა (ხმის სერვისმა არ უპასუხა), ამიტომ ფილმი არ დაიწყო — თანხა არ ჩამოგეჭრა. სცადე მოგვიანებით.';
  return {
    success: false,
    intent: 'video_generation',
    responseType: 'text',
    message,
    metadata: { provider: 'composite', composite: true, voiceUnavailable: true },
  };
}

function filmVoiceUnclearResponse(locale: string | undefined): ChatResponse {
  const loc = (locale || 'ka').toLowerCase();
  const message = loc === 'en'
    ? 'The film’s voice came out unclear twice (it did not say the script’s words), so the film was not started — nothing was charged. Please try again, or shorten the text.'
    : loc === 'ru'
      ? 'Голос фильма дважды получился неразборчивым (он не произнёс текст сценария), поэтому фильм не запущен — ничего не списано. Попробуйте ещё раз или сократите текст.'
      : 'ფილმის ხმა ორჯერ გაურკვევლად გამოვიდა (ტექსტის სიტყვები ვერ წარმოთქვა), ამიტომ ფილმი არ დაიწყო — თანხა არ ჩამოგეჭრა. სცადე თავიდან ან შეამოკლე ტექსტი.';
  return {
    success: false,
    intent: 'video_generation',
    responseType: 'text',
    message,
    metadata: { provider: 'composite', composite: true, voiceUnavailable: true, voiceUnclear: true },
  };
}

function speechTooLongResponse(locale: string | undefined, speechSec: number, scenes: number, scenesNeeded: number, clipSec: number): ChatResponse {
  const loc = (locale || 'ka').toLowerCase();
  const needSec = scenesNeeded * clipSec;
  const message = loc === 'en'
    ? `The text is about ${Math.round(speechSec)} s of speech, but ${scenes} scenes of ${clipSec} s can say only part of it — words would be rushed or cut off. Choose ${needSec} s (${scenesNeeded} scenes) or shorten the text. Nothing was charged.`
    : loc === 'ru'
      ? `Текст занимает около ${Math.round(speechSec)} с речи, а ${scenes} сцены по ${clipSec} с вмещают только часть — слова будут скомканы или обрезаны. Выберите ${needSec} с (${scenesNeeded} сцен) или сократите текст. Ничего не списано.`
      : `ტექსტი დაახლოებით ${Math.round(speechSec)} წამი საუბარია, ${scenes} სცენა ${clipSec} წამით კი მხოლოდ ნაწილს იტევს — სიტყვები აჩქარდება ან მოიჭრება. აირჩიე ${needSec} წამი (${scenesNeeded} სცენა) ან შეამოკლე ტექსტი. თანხა არ ჩამოგეჭრა.`;
  return {
    success: false,
    intent: 'video_generation',
    responseType: 'text',
    message,
    metadata: { provider: 'composite', composite: true, speechTooLong: true, speechSec, scenes, scenesNeeded, clipSec },
  };
}
