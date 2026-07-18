import { createHash } from 'crypto';
import { z } from 'zod';

import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { withRetry } from '@/lib/utils/withRetry';
import { getNanoBananaCreditCost, resolveNanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { generateGrokImage, hasXaiApiKey } from '@/lib/ai/xaiImage';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';
import { resolveModel } from '@/lib/replicate/models';
import { VIDEO_PRIMARY } from '@/lib/video/modelLock';
import { buildModelInput, validateInput } from '@/lib/replicate/schemas';
import { normalizeOutput } from '@/lib/replicate/normalizer';
import type { IntentCategory } from '@/lib/chat/intentDetector';
import { extractPromptTraits, enrichVideoPrompt } from '@/lib/chat/promptTraits';
import { extractAspectDirective } from '@/lib/chat/outputEnforcement';
import { resolveLtxApiKey, hasLtxApiKey } from '@/lib/chat/ltxKey';
import { selectVideoPrimaryProvider } from '@/lib/chat/videoProvider';
import { submitVideoWithFallback, pollVideoProvider, shouldUseNativeCascade, type VideoGenInput, type Aspect } from '@/lib/video/videoProviderCascade';
import { expandCinematicPrompt } from '@/lib/video/cinematicPrompt';
import { llmText } from '@/lib/ai/llmText';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { hasRunwayProvider, runwayModel, createRunwayI2V, pollRunwayTask } from '@/lib/ai/runway';
import { withColorScience } from '@/lib/video/colorScience';

export type DeterministicProvider = 'nanobanana' | 'replicate' | 'ltx' | 'heygen' | 'xai';
export type DeterministicOperation = 'text-to-image' | 'video-avatar';

// PHASE 24 — 'runway' is an async provider tier (Runway Gen-3 Alpha primary i2v). It surfaces on the
// wire as provider:'replicate' (DeterministicProvider has no 'runway'); the real engine lives in
// metadata.videoProvider — same pattern as 'video-cascade'.
type AsyncProvider = 'replicate' | 'ltx' | 'heygen' | 'video-cascade' | 'runway';
type ResponseType = 'text' | 'image' | 'video' | 'audio' | 'analysis' | 'action_suggestions';

const LTX_BASE_URL = 'https://api.ltx.video';
const HEYGEN_BASE_URL = 'https://api.heygen.com';
// PHASE 60 — Replicate-hosted LTX-Video (the SAME Lightricks model) used as the
// default render path: the direct api.ltx.video account was charging-but-never-
// completing in prod, while this funded, verified Replicate model generates real
// mp4s end-to-end. Pinned version is env-overridable for a clean future bump.
const REPLICATE_LTX_VIDEO_VERSION =
  process.env.REPLICATE_LTX_VIDEO_VERSION ||
  '8c47da666861d081eeb4d1261853087de23923a268a69b63febdf5dc1dee08e4';
const TASK_REF_VERSION = 1;

// PHASE 47 §3 — Radical agent recovery. A film clip's LTX dispatch is retried up
// to 3 times with exponential backoff before the master agent falls back to the
// amber strip. We retry ONLY transient failures (network throw / 429 / 5xx); a
// deterministic 4xx (401/403/400 — auth or bad request) fails fast on the first
// try so we never burn three slow round-trips on a credential that will never
// validate. A failed dispatch creates no provider job, so retrying can never
// double-render or double-charge.
const LTX_MAX_DISPATCH_ATTEMPTS = 3;
const LTX_RETRY_BASE_MS = 400;
// Hard ceiling on a single provider *create* (queue-a-job) call. A create returns
// in a few seconds when healthy; without this cap a degraded/hanging provider can
// stall the synchronous film dispatch past the 300s gateway limit → a 504 that
// looks like "video generation is broken". On abort the caller falls through to
// the legacy model / per-clip retry, so the dispatch always returns its poll token.
const PROVIDER_CREATE_TIMEOUT_MS = 25_000;

// ── PHOTOREALISTIC i2v UPGRADE ──────────────────────────────────────────────
// The premium image-to-video model that animates a clip FROM its per-scene
// identity frame (Kling by default — smooth photorealistic motion + zero
// character drift, the gap vs the legacy LTX clips). Tried FIRST whenever a
// Replicate token + a start image both exist; on ANY miss the dispatch falls
// straight through to the proven LTX path, so this can never break a render.
// DAY-6 — default upgraded to Kling v2.1 (verified live on Replicate: 4.1M runs; input schema = start_image +
// prompt + duration + negative_prompt, no aspect_ratio, which buildI2vInput's v2.1 branch already matches).
// Override with REPLICATE_VIDEO_MODEL (e.g. kwaivgi/kling-v1.6-standard for the cheaper tier, bytedance/
// seedance-1-lite); kill with VIDEO_I2V_DISABLED=1. The provider cascade (Luma/LTX/Replicate) remains the
// safety net — a v2.1 miss still falls through, so this can never leave a render with no engine.
const VIDEO_I2V_MODEL = VIDEO_PRIMARY; // hard-locked Kling v2.1 default (env-overridable) — see lib/video/modelLock
const VIDEO_I2V_DISABLED = process.env.VIDEO_I2V_DISABLED === '1';
const VIDEO_I2V_NEGATIVE =
  'blurry, distorted face, different person, deformed, low quality, cartoon, illustration, morphing, flickering, extra limbs, watermark, text overlay, bad anatomy, deformed hands, glitch, artifact, overexposed, underexposed, inconsistent clothing';

// PHASE 51 §2 — Re-hosted LTX render URLs live for 7 days. A sync LTX call
// returns the MP4 *binary*; turning that into a multi-MB `data:` URL is the
// known iOS / standalone-PWA infinite-spinner failure (the <video> element
// never fires loadedmetadata for a giant inline source). We re-host the bytes
// to our CSP-allowed *.supabase.co storage and hand the browser a real https
// URL it can stream natively — with a 7-day signed lifetime so the asset
// survives well past the render session.
const LTX_REHOST_TTL_SEC = 7 * 24 * 60 * 60;

const LTX_SUPPORTED_RESOLUTIONS: Record<'ltx-2-3-fast' | 'ltx-2-3-pro', readonly string[]> = {
  'ltx-2-3-fast': ['1920x1080', '1080x1920', '2560x1440', '3840x2160'],
  'ltx-2-3-pro': ['1920x1080', '1080x1920', '2560x1440', '3840x2160'],
};
const LTX_ALLOWED_FPS = [24, 25, 30] as const;

const ltxRequestSchema = z.object({
  prompt: z.string().min(1).max(1500),
  model: z.enum(['ltx-2-3-fast', 'ltx-2-3-pro']).default('ltx-2-3-fast'),
  resolution: z
    .enum(['1920x1080', '1080x1920', '2560x1440', '3840x2160'])
    .default('1920x1080'),
  duration: z.number().int().min(2).max(60).default(6),
  fps: z
    .number()
    .int()
    .refine((v) => (LTX_ALLOWED_FPS as readonly number[]).includes(v), {
      message: 'fps must be one of 24, 25, 30',
    })
    .default(24),
  // PHASE 40 §1 — audio is no longer hardcoded off. Driven by acoustic intent
  // extracted from the prompt (see promptTraits) so cinematic / spoken clips
  // ship with LTX's native synchronized audio track instead of silent video.
  generateAudio: z.boolean().default(true),
  // PHASE 42 §1 — continuity controls for the 30-second-film pipeline. A fixed
  // seed re-anchors the protagonist across consecutive clips so the character
  // never mutates; characterReference pins the user's avatar identity.
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  characterReference: z.string().min(1).max(2048).optional(),
  // PHASE 50 §3 — image-to-video anchor. When the user triggers "Turn this into
  // a video" from an existing image card, the originating asset URL is bound here
  // as a HARD first-frame / conditioning reference so LTX animates the actual
  // image instead of writing a fresh text-to-video prompt from scratch.
  imageReference: z.string().min(1).max(4096).optional(),
});

const heygenRequestSchema = z.object({
  script: z.string().min(1).max(1500),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  voiceGender: z.enum(['female', 'male']).default('female'),
  voiceLanguage: z.string().min(2).max(8).default('en'),
});

type EncodedTaskRef = {
  v: number;
  provider: AsyncProvider;
  providerTaskId: string;
  sessionId: string;
  serviceContext: string;
  intent: IntentCategory;
  operation: DeterministicOperation;
  responseType: Exclude<ResponseType, 'action_suggestions'>;
  promptHash: string;
  createdAt: number;
};

export interface ServiceManagerRequest {
  sessionId: string;
  serviceContext: string;
  intent: IntentCategory;
  userPrompt: string;
  selectedOptions?: Record<string, string>;
  imageUrl?: string;
  locale?: string;
  confidence?: number;
  /** PHASE 2 L5 / Master Contract V3 — per-render i2v engine override (Cinema panel: Runway vs Kling;
   *  Hailuo retained as a valid routing value). 'runway'/unset → Runway-first cascade; 'kling' opts out
   *  of the Runway attempt and renders Kling-first; then the REPLICATE_VIDEO_MODEL env default. */
  videoModel?: 'runway' | 'kling' | 'hailuo';
}

export interface ServiceManagerResponse {
  success: boolean;
  provider: DeterministicProvider;
  operation: DeterministicOperation;
  responseType: ResponseType;
  message: string;
  assetUrl?: string | null;
  assetType?: string;
  predictionId?: string;
  predictionStatus?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'error';
  metadata: {
    provider: DeterministicProvider;
    model?: string;
    operation: DeterministicOperation;
    outputType?: string;
    endpoint?: string;
    creditCost?: number;
    sessionId: string;
    taskRef?: string;
    providerTaskId?: string;
    promptHash: string;
    confidence?: number;
    [key: string]: unknown;
  };
}

/**
 * PHASE 56 (root-cause) — a NanoBanana response with NO media URL is not always
 * a success. The image provider returns soft failures — HTTP 402 "insufficient
 * credits", quota/rate limits, auth faults — as an ordinary JSON body carrying a
 * numeric `code` >= 400 and a human message, rather than throwing. The no-URL
 * branch previously laundered that into `success:true responseType:'text'`, so
 * the client believed generation succeeded and opened a preview with no asset to
 * mount — the exact "preview never shows the image / hangs" report. This returns
 * the provider's error message when the result is a failure, or null when it is a
 * genuine text answer (so a real text reply still flows through untouched).
 */
function detectNanoProviderError(result: { url?: string; text?: string; raw: unknown }): string | null {
  if (result.url) return null;
  let code: number | undefined;
  let rawMsg: string | undefined;
  if (result.raw && typeof result.raw === 'object') {
    const r = result.raw as Record<string, unknown>;
    if (typeof r.code === 'number') code = r.code;
    const m = r.msg ?? r.message ?? r.error;
    if (typeof m === 'string') rawMsg = m;
  }
  const text = (result.text || rawMsg || '').trim();
  const errorByCode = typeof code === 'number' && code >= 400;
  const errorByText = /insufficient|top.?up|quota|rate.?limit|unauthor|invalid api|forbidden|denied|payment|balance/i.test(text);
  if (errorByCode || errorByText) {
    return text || `Image provider error${typeof code === 'number' ? ` (HTTP ${code})` : ''}`;
  }
  return null;
}

const HEYGEN_VOICE_MAP: Record<'female' | 'male', Record<string, string>> = {
  female: {
    en: '1bd001e7e50f421d891986aad5158bc8',
    ru: 'a50d990a4bd14da4a49d0f4d10310a6b',
    ka: '1bd001e7e50f421d891986aad5158bc8',
  },
  male: {
    en: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
    ru: 'a50d990a4bd14da4a49d0f4d10310a6b',
    ka: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
  },
};

const TERMINAL_LTX_STATUS = new Set(['completed', 'succeeded', 'success', 'failed', 'error', 'canceled']);
const FAILED_LTX_STATUS = new Set(['failed', 'error', 'canceled']);

export class ServiceManager {
  async execute(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const operation = this.resolveOperation(request);
    if (operation === 'text-to-image') {
      return this.runTextToImage(request);
    }

    return this.runVideoAvatar(request);
  }

  async poll(taskRefOrPredictionId: string, sessionId?: string): Promise<ServiceManagerResponse> {
    const decoded = this.decodeTaskRef(taskRefOrPredictionId);

    if (!decoded) {
      return this.pollLegacyReplicate(taskRefOrPredictionId, sessionId || 'legacy');
    }

    if (!sessionId || decoded.sessionId !== sessionId) {
      // 'video-cascade' and 'runway' are async tiers with no DeterministicProvider surface → 'replicate'.
      const surfaceProvider: DeterministicProvider =
        decoded.provider === 'video-cascade' || decoded.provider === 'runway' ? 'replicate' : decoded.provider;
      return {
        success: false,
        provider: surfaceProvider,
        operation: decoded.operation,
        responseType: decoded.responseType,
        message: 'Session mismatch. Refusing to mix output with a different session.',
        predictionId: taskRefOrPredictionId,
        predictionStatus: 'error',
        metadata: {
          provider: surfaceProvider,
          operation: decoded.operation,
          sessionId: decoded.sessionId,
          taskRef: taskRefOrPredictionId,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
        },
      };
    }

    if (decoded.provider === 'replicate') {
      return this.pollReplicateTask(decoded, taskRefOrPredictionId);
    }

    if (decoded.provider === 'video-cascade') {
      return this.pollVideoCascadeTask(decoded, taskRefOrPredictionId);
    }

    if (decoded.provider === 'heygen') {
      return this.pollHeygenTask(decoded, taskRefOrPredictionId);
    }

    if (decoded.provider === 'runway') {
      return this.pollRunwayTaskRef(decoded, taskRefOrPredictionId);
    }

    return this.pollLtxTask(decoded, taskRefOrPredictionId);
  }

  private async runTextToImage(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const provider = this.resolveImageProvider(request.selectedOptions);
    if (provider === 'replicate') {
      // P90 — FLUX 1.1 Pro primary, NanoBanana fail-open: a FLUX outage/quota still yields a real
      // preview (resilience preserved, just inverted from the old NanoBanana→FLUX order).
      // NOTE: createPrediction is `Prefer: respond-async`, so the NORMAL success return carries a
      // `predictionId` (client polls it) and NO `assetUrl` — accept that in-flight prediction as
      // success; only fail open to NanoBanana on a throw / !success / a synchronously-failed status.
      try {
        const res = await this.runReplicateImage(request);
        if (res.success && (res.assetUrl || res.predictionId) && res.predictionStatus !== 'failed') return res;
      } catch { /* fall through to NanoBanana */ }
      return this.runNanoBananaImage(request);
    }

    return this.runNanoBananaImage(request);
  }

  private async runVideoAvatar(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const provider = this.resolveVideoProvider(request);
    if (provider === 'heygen') {
      return this.runHeygenAvatarVideo(request);
    }

    // PHOTOREALISTIC i2v — try the premium image-to-video model (Kling/Seedance)
    // FIRST: it animates the clip FROM this scene's identity frame, so motion is
    // smooth + photorealistic and the character never drifts. Returns null when
    // disabled, no Replicate token, no start image, or the create failed → fall
    // straight through to the proven LTX engine below (the upgrade never breaks a
    // render). The returned `replicate` task-ref is resolved by the SAME poll path.
    const i2v = await this.tryI2vClip(request);
    if (i2v) return i2v;

    // VIDEO ENGINE — prefer the DIRECT LTX-2.3 API (api.ltx.video) whenever a
    // funded LTX key is configured: the operator provisioned LTX_VIDEO_API_KEY to
    // spend their LTX.video balance, so that account is the PRIMARY render engine.
    // runLtxVideo itself fails over to the Replicate-hosted LTX path on a credit/
    // auth error, so a dry/invalid LTX key can never dead-end the render. Set
    // LTX_VIA_REPLICATE=1 to force the Replicate-hosted LTX-2-fast path instead
    // (e.g. while the direct account is empty). Either way the engine is LTX-2.
    const forceReplicate = process.env.LTX_VIA_REPLICATE === '1';
    const hasReplicate = typeof process.env.REPLICATE_API_TOKEN === 'string' && process.env.REPLICATE_API_TOKEN.trim().length > 0;

    if (!forceReplicate && hasLtxApiKey()) {
      return this.runLtxVideo(request);
    }
    if (hasReplicate) {
      return this.runReplicateLtxVideo(request);
    }
    // No LTX key and no Replicate token → still attempt direct LTX (honest fail).
    return this.runLtxVideo(request);
  }

  /**
   * Clamp ANY incoming aspect to the three ratios every i2v model accepts
   * (16:9 / 9:16 / 1:1). normalizeAspectRatio can return 4:5 / 4:3 / 3:4 etc.,
   * which Kling's enum rejects with a 422 — Replicate validates the enum BEFORE
   * the model even though start_image makes it a no-op, so an unmapped ratio kills
   * the i2v attempt (it then wastes a round-trip falling back to LTX). Portrait →
   * 9:16, landscape → 16:9, square → 1:1.
   */
  private toI2vAspect(aspect: string | undefined): '16:9' | '9:16' | '1:1' {
    const a = (aspect || '').trim();
    const m = a.match(/^(\d+):(\d+)$/);
    if (m) {
      const w = parseInt(m[1]!, 10); const h = parseInt(m[2]!, 10);
      if (w > 0 && h > 0) return w > h ? '16:9' : w < h ? '9:16' : '1:1';
    }
    return /vert|portrait|9:16|story|tall/i.test(a) ? '9:16' : '16:9';
  }

  /**
   * Build the Replicate `input` for the configured i2v model. Each family names
   * its first-frame + control params differently, so map by model owner/name and
   * only ever send keys that model's schema accepts (an unknown key → 422). `aspect`
   * is already clamped (toI2vAspect) to 16:9 / 9:16 / 1:1.
   */
  private buildI2vInput(model: string, prompt: string, aspect: string, startImage: string, negative?: string): Record<string, unknown> {
    // PHASE 24 (VECTOR 2) — the SAME shared colour-science grade Runway's promptText gets, so a
    // mid-storyboard Runway→Kling fallback keeps identical tone/contrast (no seam across providers).
    const fullPrompt = withColorScience(`${prompt}, photorealistic, cinematic`, 900);
    // PHASE 22 (VECTOR 1) — the Director's scene-tailored negative (from the film pipeline's
    // selectedOptions.negativePrompt) is MERGED ahead of the fixed baseline and passed to the model's
    // NATIVE negative_prompt field — where it's weighted far more heavily than any in-prompt "no x".
    // This is the wire that was missing: previously every Kling clip got only VIDEO_I2V_NEGATIVE and
    // the per-scene negative (tint/deform suppression) was dropped. Capped so it can't blow the field.
    const neg = negative && negative.trim()
      ? `${VIDEO_I2V_NEGATIVE}, ${negative.trim()}`.slice(0, 600)
      : VIDEO_I2V_NEGATIVE;
    const m = model.toLowerCase();
    if (/kling/.test(m)) {
      // kling-v2.1 has no aspect_ratio (it's inferred from start_image); v1.6 does.
      const base: Record<string, unknown> = { start_image: startImage, prompt: fullPrompt, negative_prompt: neg, duration: 5 };
      if (/v1\.6|v1-6|kling-v1/.test(m)) { base.aspect_ratio = aspect; base.cfg_scale = 0.5; }
      return base;
    }
    if (/seedance/.test(m)) {
      return { image: startImage, prompt: fullPrompt, aspect_ratio: aspect, duration: 5, resolution: '1080p', fps: 24 };
    }
    if (/wan-?2|wan2|wan-video/.test(m)) {
      return { image: startImage, prompt: fullPrompt, negative_prompt: neg, aspect_ratio: aspect };
    }
    if (/minimax|hailuo|video-01/.test(m)) {
      return { first_frame_image: startImage, prompt: fullPrompt, prompt_optimizer: true };
    }
    // Generic i2v fallback — the most widely-accepted shape.
    return { image: startImage, prompt: fullPrompt };
  }

  /**
   * PHOTOREALISTIC i2v clip — animate this scene FROM its identity frame using the
   * premium model (Kling by default). Self-contained Replicate create that returns
   * a `replicate` task-ref the EXISTING poll path (pollReplicateTask →
   * normalizeOutput('video')) resolves to the mp4 — exactly like runReplicateLtxVideo.
   *
   * Returns null (so the caller falls through to LTX) when: the feature is disabled,
   * no Replicate token, NO start image (i2v needs a first frame — text-to-video stays
   * on LTX), or the create failed/timed-out/returned no id. NEVER throws.
   */
  private async tryI2vClip(request: ServiceManagerRequest): Promise<ServiceManagerResponse | null> {
    if (VIDEO_I2V_DISABLED) return null;
    // PHASE 23 — explicit engine DOWN-SHIFT. When the film retry loop has already spent Kling's
    // attempts (a prior full Kling+LTX attempt failed), it sets skipI2v so THIS retry skips the
    // premium i2v create entirely and lands straight on the proven LTX-2 engine — no wasted Kling
    // create-timeout under cluster saturation. Returning null routes execute() to LTX, which still
    // honours the character/image anchor + the in-prompt drift clause, so identity continuity holds.
    if (this.getOption(request.selectedOptions || {}, ['skipI2v', 'forceLtx', 'skip_i2v'])) return null;
    const startImage = this.resolveClipImage(request);
    if (!startImage) return null; // i2v needs an anchor frame; without one, keep LTX

    const aspect = this.toI2vAspect(
      this.normalizeAspectRatio(this.getOption(request.selectedOptions || {}, ['aspect', 'aspectRatio', 'ratio'])) || undefined,
    );
    // PHASE 22 (VECTOR 1) — the Director's scene negative threaded by the film pipeline. Passed to
    // buildI2vInput so Kling's NATIVE negative_prompt suppresses the flagged artifacts (sepia/deform).
    const negativePromptOpt = this.getOption(request.selectedOptions || {}, ['negativePrompt', 'negative_prompt', 'negative']) || undefined;

    // DAY-3 Task 2 — invisibly enrich the raw prompt with cinematic properties (shot type, camera motion,
    // framing, lens, dramatic lighting, mood) before the engine sees it. Film scene prompts are already
    // cinematically planned → looksEnriched() short-circuits the LLM for them; only a bare user clip triggers
    // one bounded call, and the deterministic fallback guarantees an enriched string even if the LLM is down.
    const enrichedPrompt = await expandCinematicPrompt(request.userPrompt, llmText, { timeoutMs: 9_000 });

    // PHASE 24 — RUNWAY Gen-3 Alpha is the PRIMARY premium i2v engine. Try it FIRST; on no key / no
    // image / any create failure (401/429/quota/timeout) it returns null and we fall straight through
    // to the existing Replicate Kling→LTX cascade below — same scene params, seamless colour-science.
    // Inert + byte-identical in prod until RUNWAY_API_KEY (or RUNWAYML_API_SECRET) is set + verified.
    // Master Contract V3 — the Cinema-panel engine toggle is now authoritative: selecting Kling opts OUT
    // of the Runway attempt (Kling-first); 'runway'/unset keeps the Runway-first cascade (the default).
    if (request.videoModel !== 'kling' && request.videoModel !== 'hailuo') {
      const runway = await this.tryRunwayClip(request, startImage, aspect, enrichedPrompt);
      if (runway) return runway;
    }

    // DAY-3 — native multi-engine cascade (Kling-native → Luma → LTX → Replicate). Gated on a genuinely
    // NEW provider key (Kling AK/SK or Luma) being provisioned: prod today has only Replicate + LTX, so this
    // is skipped entirely and the VERIFIED path below runs byte-identical. When a native key IS present the
    // cascade submits (fast) and returns a 'video-cascade' task-ref the poll dispatcher resolves per-provider.
    if (shouldUseNativeCascade(process.env)) {
      const cascade = await this.tryVideoCascade(request, startImage, aspect, enrichedPrompt);
      if (cascade) return cascade;
      // every configured tier failed to accept → fall through to the legacy Replicate/LTX path below
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return null;
    // PHASE 2 L5 — per-render i2v model: the Cinema panel's Kling/Hailuo toggle wins,
    // else the REPLICATE_VIDEO_MODEL env default. buildI2vInput already shapes the
    // input per model family (kling start_image / minimax first_frame_image).
    const KLING_I2V = VIDEO_PRIMARY; // hard-locked to Kling v2.1 (was v1.6-standard) — see lib/video/modelLock
    const model =
      request.videoModel === 'hailuo' ? 'minimax/hailuo-02'
      : request.videoModel === 'kling' ? KLING_I2V
      : VIDEO_I2V_MODEL;
    const promptHash = this.hashPrompt(request.userPrompt);

    // ONE create+accept attempt for a specific model. Returns the processing task-ref (or a rare
    // immediate success), or null on ANY failure (create 4xx/5xx, timeout, no id, throw) so the
    // caller can fail over. NEVER throws — the never-throws contract lives here.
    const attempt = async (modelId: string): Promise<ServiceManagerResponse | null> => {
      const input = this.buildI2vInput(modelId, enrichedPrompt, aspect, startImage, negativePromptOpt);
      try {
        // One quick retry on a transient 5xx/network blip; each attempt gets a fresh timeout so a
        // real latency stall (TimeoutError) bails fast and hands off to the failover / LTX.
        const res = await withRetry(
          async () => {
            const r = await fetch(`https://api.replicate.com/v1/models/${modelId}/predictions`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              cache: 'no-store',
              body: JSON.stringify({ input }),
              signal: AbortSignal.timeout(PROVIDER_CREATE_TIMEOUT_MS),
            });
            if (!r.ok && r.status >= 500) throw new Error(`i2v create ${r.status}`);
            return r;
          },
          { maxAttempts: 2, baseDelayMs: 800, label: `i2v-${modelId}` },
        );
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn(`[i2v] ${modelId} create ${res.status}`);
          return null;
        }
        const pred = (await res.json().catch(() => ({}))) as { id?: string; status?: string; output?: unknown };
        if (!pred.id) return null;

        // Rare immediate completion.
        const immediateUrl = this.extractUrl(pred.output);
        if (pred.status === 'succeeded' && immediateUrl) {
          return {
            success: true, provider: 'replicate', operation: 'video-avatar', responseType: 'video',
            message: 'Video generation completed successfully.', assetUrl: immediateUrl, assetType: 'video',
            predictionStatus: 'succeeded',
            metadata: { provider: 'replicate', model: modelId, operation: 'video-avatar', outputType: 'video', sessionId: request.sessionId, providerTaskId: pred.id, promptHash },
          };
        }
        const taskRef = this.encodeTaskRef({
          provider: 'replicate', providerTaskId: pred.id, sessionId: request.sessionId,
          serviceContext: request.serviceContext, intent: request.intent, operation: 'video-avatar',
          responseType: 'video', promptHash, createdAt: Date.now(),
        });
        // eslint-disable-next-line no-console
        console.log(`[i2v] ${modelId} accepted clip (${pred.id}) — photorealistic i2v engaged`);
        return {
          success: true, provider: 'replicate', operation: 'video-avatar', responseType: 'video',
          message: `${modelId} accepted the request. Polling for completion.`,
          predictionId: taskRef, predictionStatus: pred.status === 'failed' ? 'failed' : 'processing',
          metadata: { provider: 'replicate', model: modelId, operation: 'video-avatar', outputType: 'video', sessionId: request.sessionId, taskRef, providerTaskId: pred.id, promptHash },
        };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[i2v] ${modelId} create error:`, err instanceof Error ? err.message : err);
        return null;
      }
    };

    // CINEMA FAILSAFE MATRIX — the EXPERIMENTAL Hailuo leg fails over to the PROVEN Kling i2v
    // BEFORE the caller drops to LTX, so a Hailuo latency spike / rate-limit never stalls the
    // render nor silently skips the hardened Kling tier. Kling/env primaries are unchanged
    // (a failure returns null → the caller's LTX fallback, exactly as before).
    const primary = await attempt(model);
    if (primary) return primary;
    if (request.videoModel === 'hailuo' && model !== KLING_I2V) {
      // eslint-disable-next-line no-console
      console.warn('[i2v] hailuo unavailable → Kling failover (then LTX if that also fails)');
      const failover = await attempt(KLING_I2V);
      if (failover) return failover;
    }
    return null; // → caller's LTX fallback
  }

  /**
   * DAY-3 native multi-engine cascade. Submits the i2v clip through the ordered provider array
   * (Kling-native → Luma → LTX → Replicate) — a fast, non-blocking SUBMIT that falls through on any
   * provider failure. Returns a 'video-cascade' task-ref (winning provider encoded) that pollVideoCascadeTask
   * resolves, or null when every configured tier declined (→ the legacy Replicate/LTX path). NEVER throws.
   */
  private async tryVideoCascade(request: ServiceManagerRequest, startImage: string, aspect: string, prompt: string): Promise<ServiceManagerResponse | null> {
    try {
      const input: VideoGenInput = {
        prompt: prompt || request.userPrompt,
        imageUrl: startImage,
        aspectRatio: (aspect as Aspect) || '9:16',
        negativePrompt: 'blur, distortion, low quality, watermark, extra people, deformed face',
      };
      const { provider, taskId } = await submitVideoWithFallback(input);
      const composite = `${provider}::${taskId}`;
      const promptHash = this.hashPrompt(request.userPrompt);
      const taskRef = this.encodeTaskRef({
        provider: 'video-cascade', providerTaskId: composite, sessionId: request.sessionId,
        serviceContext: request.serviceContext, intent: request.intent, operation: 'video-avatar',
        responseType: 'video', promptHash, createdAt: Date.now(),
      });
      // eslint-disable-next-line no-console
      console.log(`[video-cascade] ${provider} accepted clip (${taskId})`);
      return {
        success: true, provider: 'replicate', operation: 'video-avatar', responseType: 'video',
        message: `${provider} accepted the request. Polling for completion.`,
        predictionId: taskRef, predictionStatus: 'processing',
        metadata: { provider: 'replicate' as const, videoProvider: provider, model: provider, operation: 'video-avatar', outputType: 'video', sessionId: request.sessionId, taskRef, providerTaskId: composite, promptHash },
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[video-cascade] all providers declined:', err instanceof Error ? err.message : err);
      return null; // → legacy Replicate/LTX path
    }
  }

  /** Resolve a 'video-cascade' task-ref by dispatching to the winning provider's poll (encoded as "name::id"). */
  private async pollVideoCascadeTask(decoded: EncodedTaskRef, taskRef: string): Promise<ServiceManagerResponse> {
    const sep = decoded.providerTaskId.indexOf('::');
    const providerName = sep > 0 ? decoded.providerTaskId.slice(0, sep) : 'replicate-kling';
    const taskId = sep > 0 ? decoded.providerTaskId.slice(sep + 2) : decoded.providerTaskId;
    const r = await pollVideoProvider(providerName, taskId);
    const baseMeta = {
      provider: 'replicate' as const, videoProvider: providerName, operation: decoded.operation,
      sessionId: decoded.sessionId, taskRef, providerTaskId: decoded.providerTaskId, promptHash: decoded.promptHash,
    };
    if (r.status === 'succeeded' && r.url) {
      return {
        success: true, provider: 'replicate', operation: decoded.operation, responseType: decoded.responseType,
        message: 'Generation completed successfully.', assetUrl: r.url, assetType: decoded.responseType,
        predictionId: taskRef, predictionStatus: 'succeeded', metadata: { ...baseMeta, outputType: decoded.responseType },
      };
    }
    if (r.status === 'failed') {
      return {
        success: false, provider: 'replicate', operation: decoded.operation, responseType: decoded.responseType,
        message: r.error || 'Video generation failed.', predictionId: taskRef, predictionStatus: 'failed', metadata: baseMeta,
      };
    }
    return {
      success: true, provider: 'replicate', operation: decoded.operation, responseType: decoded.responseType,
      message: 'Rendering…', predictionId: taskRef, predictionStatus: 'processing', metadata: baseMeta,
    };
  }

  /**
   * PHASE 24 — RUNWAY Gen-3 Alpha PRIMARY i2v. A fast, non-blocking CREATE that returns a 'runway'
   * task-ref the async film poll resolves via pollRunwayTaskRef. Gated on a Runway key + a start frame
   * (Gen-3's API is image-to-video). Returns null on no key / no image / ANY create failure so the
   * caller falls through to the Replicate Kling→LTX cascade. NEVER throws. Inert until a key is set.
   */
  private async tryRunwayClip(request: ServiceManagerRequest, startImage: string, aspect: string, prompt: string): Promise<ServiceManagerResponse | null> {
    if (!hasRunwayProvider()) return null;
    const seedRaw = this.getOption(request.selectedOptions || {}, ['seed', 'consistencySeed']);
    const seedParsed = seedRaw != null ? Number.parseInt(seedRaw, 10) : NaN;
    // Runway promptText is capped at 512 chars — withColorScience clamps + appends the shared grade.
    const created = await createRunwayI2V({
      promptImage: startImage,
      promptText: withColorScience(prompt || request.userPrompt, 512),
      aspect,
      durationSec: 5,
      ...(Number.isFinite(seedParsed) && seedParsed >= 0 ? { seed: seedParsed } : {}),
    });
    if (!created?.id) return null; // → Replicate/LTX cascade
    const promptHash = this.hashPrompt(request.userPrompt);
    const model = runwayModel();
    const taskRef = this.encodeTaskRef({
      provider: 'runway', providerTaskId: created.id, sessionId: request.sessionId,
      serviceContext: request.serviceContext, intent: request.intent, operation: 'video-avatar',
      responseType: 'video', promptHash, createdAt: Date.now(),
    });
    // eslint-disable-next-line no-console
    console.log(`[runway] ${model} accepted clip (${created.id})`);
    return {
      success: true, provider: 'replicate', operation: 'video-avatar', responseType: 'video',
      message: `Runway (${model}) accepted the request. Polling for completion.`,
      predictionId: taskRef, predictionStatus: 'processing',
      metadata: { provider: 'replicate' as const, videoProvider: 'runway', model, operation: 'video-avatar', outputType: 'video', sessionId: request.sessionId, taskRef, providerTaskId: created.id, promptHash },
    };
  }

  /** Resolve a 'runway' task-ref via Runway's GET /v1/tasks/{id}. Fail-open: unknown status → keep polling.
   *  The `message` names the engine on every branch so the active provider node is identifiable in the
   *  response (it rides into metadata.film.clips[].note) even where the Console UI still shows only status. */
  private async pollRunwayTaskRef(decoded: EncodedTaskRef, taskRef: string): Promise<ServiceManagerResponse> {
    const r = await pollRunwayTask(decoded.providerTaskId);
    const engine = `Runway (${runwayModel()})`;
    const baseMeta = {
      provider: 'replicate' as const, videoProvider: 'runway', operation: decoded.operation,
      sessionId: decoded.sessionId, taskRef, providerTaskId: decoded.providerTaskId, promptHash: decoded.promptHash,
    };
    if (r.status === 'succeeded' && r.url) {
      return {
        success: true, provider: 'replicate', operation: decoded.operation, responseType: decoded.responseType,
        message: `${engine} rendered the scene.`, assetUrl: r.url, assetType: decoded.responseType,
        predictionId: taskRef, predictionStatus: 'succeeded', metadata: { ...baseMeta, outputType: decoded.responseType },
      };
    }
    if (r.status === 'failed') {
      return {
        success: false, provider: 'replicate', operation: decoded.operation, responseType: decoded.responseType,
        message: `${engine} generation failed.`, predictionId: taskRef, predictionStatus: 'failed', metadata: baseMeta,
      };
    }
    return {
      success: true, provider: 'replicate', operation: decoded.operation, responseType: decoded.responseType,
      message: `${engine} rendering…`, predictionId: taskRef, predictionStatus: 'processing', metadata: baseMeta,
    };
  }

  /**
   * PHASE 60 — Dispatch a clip to Replicate-hosted `lightricks/ltx-video` (the
   * same Lightricks model), returning a `replicate` task-ref so the EXISTING,
   * proven Replicate poll path (pollReplicateTask → normalizeOutput('video'))
   * resolves the mp4. Self-contained: the input is the model's exact schema
   * ({prompt, aspect_ratio, length, target_size, [image]}), so it never collides
   * with the shared zeroscope input builder. renderClip's retry loop covers a
   * transient create failure (this throws on a non-2xx create).
   */
  private async runReplicateLtxVideo(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return this.runLtxVideo(request); // safety net: no token → direct API
    const promptHash = this.hashPrompt(request.userPrompt);
    const aspect =
      this.normalizeAspectRatio(this.getOption(request.selectedOptions || {}, ['aspect', 'aspectRatio', 'ratio'])) ||
      '16:9';
    // IDENTITY LOCK — the uploaded reference photo IS the protagonist. The film
    // pipeline carries it in selectedOptions.characterReference(s); feeding it as
    // the image-to-video anchor makes every clip animate FROM the user's subject
    // (same face/wardrobe), not a freshly-invented character.
    const imageUrl = this.resolveClipImage(request);
    // LTX-2 (native 1080p + synced audio) with automatic fallback to the proven
    // legacy clip model, so an LTX-2 hiccup can never break the render pipeline.
    const { pred, modelLabel } = await this.createReplicateLtxPrediction(
      token,
      request.userPrompt,
      aspect,
      imageUrl,
    );
    // The helper guarantees an id (it throws otherwise); this guard narrows the
    // optional type for the encodeTaskRef / metadata uses below.
    if (!pred.id) {
      throw new Error('Replicate LTX returned no prediction id');
    }
    // Rare immediate completion — hand back the URL straight away.
    const immediateUrl = this.extractUrl(pred.output);
    if (pred.status === 'succeeded' && immediateUrl) {
      return {
        success: true,
        provider: 'replicate',
        operation: 'video-avatar',
        responseType: 'video',
        message: 'Video generation completed successfully.',
        assetUrl: immediateUrl,
        assetType: 'video',
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'replicate',
          model: modelLabel,
          operation: 'video-avatar',
          outputType: 'video',
          sessionId: request.sessionId,
          providerTaskId: pred.id,
          promptHash,
        },
      };
    }

    const taskRef = this.encodeTaskRef({
      provider: 'replicate',
      providerTaskId: pred.id,
      sessionId: request.sessionId,
      serviceContext: request.serviceContext,
      intent: request.intent,
      operation: 'video-avatar',
      responseType: 'video',
      promptHash,
      createdAt: Date.now(),
    });
    return {
      success: true,
      provider: 'replicate',
      operation: 'video-avatar',
      responseType: 'video',
      message: 'LTX-Video (Replicate) accepted the request. Polling for completion.',
      predictionId: taskRef,
      predictionStatus: pred.status === 'failed' ? 'failed' : 'processing',
      metadata: {
        provider: 'replicate',
        model: modelLabel,
        operation: 'video-avatar',
        outputType: 'video',
        sessionId: request.sessionId,
        taskRef,
        providerTaskId: pred.id,
        promptHash,
      },
    };
  }

  /**
   * Resolve the identity-anchor image for a clip → the LTX image-to-video input.
   *
   * Priority: an explicit request.imageUrl, then the film pipeline's
   * selectedOptions.characterReference (single) / characterReferences (JSON
   * array — first entry). Accepts BOTH https URLs and `data:image/*` URIs, since
   * the studio composer compresses uploads to data URLs. Returns undefined when
   * no usable reference exists (clip renders text-to-video as before).
   */
  private resolveClipImage(request: ServiceManagerRequest): string | undefined {
    const usable = (s: unknown): s is string => {
      if (typeof s !== 'string') return false;
      if (/^https?:\/\//i.test(s)) return true;
      // data: image — cap the payload (~1.5 MB decoded) so an oversized upload
      // can't bloat the provider request; the LTX-2 attempt loop degrades to
      // text-to-video if it's skipped here.
      return /^data:image\//i.test(s) && s.length <= 2_000_000;
    };
    if (usable(request.imageUrl)) return request.imageUrl;
    const opts = request.selectedOptions || {};
    const single = this.getOption(opts, ['characterReference', 'imageUrl', 'image', 'referenceImage', 'startImage']);
    if (usable(single)) return single;
    const refsJson = this.getOption(opts, ['characterReferences', 'referenceImages']);
    if (refsJson) {
      try {
        const arr = JSON.parse(refsJson) as unknown;
        if (Array.isArray(arr)) {
          const first = arr.find(usable);
          if (usable(first)) return first;
        }
      } catch {
        /* not JSON → ignore */
      }
    }
    return undefined;
  }

  /**
   * Create a Replicate clip prediction, preferring LTX-2 with graceful fallback.
   *
   * LTX-2 (`lightricks/ltx-2-fast` by default, env `REPLICATE_LTX_MODEL`) is the
   * production-grade Lightricks model: native 1080p/4K with SYNCHRONISED AUDIO
   * (voices, music, SFX) generated in the same pass — the full LTX-2 capability
   * set. It is run by MODEL NAME (`/v1/models/{owner}/{name}/predictions`) so it
   * always uses the latest published version, with a minimal, confirmed input
   * ({prompt, duration[, image]}); audio + resolution use the model's defaults.
   *
   * SAFETY: if the LTX-2 create fails for ANY reason (schema drift, model
   * unavailable, quota), it transparently falls back to the proven legacy
   * `lightricks/ltx-video` (pinned version, 640p, no audio). So upgrading the
   * clip model can never break the just-stabilised render pipeline — worst case
   * is a silent downgrade to the old quality, never a failed film.
   *
   * Returns the raw prediction plus the model label that actually accepted it
   * (for honest telemetry).
   */
  private async createReplicateLtxPrediction(
    token: string,
    prompt: string,
    aspect: string,
    imageUrl?: string,
  ): Promise<{ pred: { id?: string; status?: string; output?: unknown }; modelLabel: string }> {
    const ltx2Model = (process.env.REPLICATE_LTX_MODEL || 'lightricks/ltx-2-fast').trim();

    if (/ltx-2/i.test(ltx2Model)) {
      // Try image-to-video FIRST (identity-locked to the uploaded subject). If
      // that create fails — a rejected or oversized reference — retry the SAME
      // model text-to-video, so a bad image never fails a clip that would
      // otherwise render (it just loses the photo anchor, keeps LTX-2 quality).
      const attempts: Array<Record<string, unknown>> = imageUrl
        ? [{ prompt, duration: 6, image: imageUrl }, { prompt, duration: 6 }]
        : [{ prompt, duration: 6 }];
      for (const input of attempts) {
        try {
          const res = await fetch(`https://api.replicate.com/v1/models/${ltx2Model}/predictions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ input }),
            signal: AbortSignal.timeout(PROVIDER_CREATE_TIMEOUT_MS),
          });
          if (res.ok) {
            const pred = (await res.json().catch(() => ({}))) as { id?: string; status?: string; output?: unknown };
            if (pred.id) return { pred, modelLabel: ltx2Model };
          }
          // Non-ok → try the next attempt (image-less), then the legacy model.
        } catch {
          /* network/other → try next attempt / legacy */
        }
      }
    }

    // Legacy proven path: lightricks/ltx-video (640p, no audio) by pinned version.
    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: aspect,
      length: 97,
      target_size: 640,
    };
    if (imageUrl) input.image = imageUrl;
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ version: REPLICATE_LTX_VIDEO_VERSION, input }),
      signal: AbortSignal.timeout(PROVIDER_CREATE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Replicate LTX create failed (${res.status}): ${txt.slice(0, 180)}`);
    }
    const pred = (await res.json().catch(() => ({}))) as { id?: string; status?: string; output?: unknown };
    if (!pred.id) {
      throw new Error('Replicate LTX returned no prediction id');
    }
    return { pred, modelLabel: 'lightricks/ltx-video' };
  }

  private async runNanoBananaImage(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const options = request.selectedOptions || {};
    const promptHash = this.hashPrompt(request.userPrompt);

    const requestedEndpoint = resolveNanoBananaEndpoint(
      this.getOption(options, ['nanobanana_endpoint', 'nanobananaEndpoint', 'endpoint']),
    );
    const highQualityRequested = this.isHighQualityRequest(options);
    const endpoint = highQualityRequested ? 'pro-4k' : requestedEndpoint;

    const aspectRatio = this.normalizeAspectRatio(this.getOption(options, ['aspect', 'aspectRatio', 'ratio', 'img-size']));
    const style = this.getOption(options, ['style', 'img-style', 'imgStyle']) || undefined;

    const result = await generateNanoBananaImage({
      // Strict pass-through: do not rewrite user prompt for image generation.
      prompt: request.userPrompt,
      endpoint,
      aspectRatio,
      style,
      referenceImageDataUrl: request.imageUrl,
      service: request.serviceContext,
    });

    if (result.url) {
      return {
        success: true,
        provider: 'nanobanana',
        operation: 'text-to-image',
        responseType: 'image',
        message: 'Image generation completed successfully.',
        assetUrl: result.url,
        assetType: 'image',
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'nanobanana',
          operation: 'text-to-image',
          sessionId: request.sessionId,
          endpoint,
          creditCost: getNanoBananaCreditCost(endpoint),
          outputType: 'image',
          promptHash,
          confidence: request.confidence,
          raw: result.raw,
        },
      };
    }

    // PHASE 56 (root-cause) — a no-URL result that carries a provider error
    // (402 insufficient credits, quota, auth) means NanoBanana produced NOTHING.
    // The default image provider being out of credits must NOT become a dead end:
    // transparently fail over to the funded Replicate (FLUX) image path so the
    // user still receives a real image to preview. The fallback returns either an
    // immediate asset URL or a predictionId the client already knows how to poll.
    // Only when that fallback ALSO fails do we surface the honest provider error
    // (a clear, actionable message) instead of a silent empty preview.
    const providerError = detectNanoProviderError(result);
    if (providerError) {
      try {
        const fallback = await this.runReplicateImage(request);
        if (fallback.success) {
          return {
            ...fallback,
            metadata: {
              ...fallback.metadata,
              imageFallback: 'nanobanana->replicate',
              primaryProvider: 'nanobanana',
              primaryProviderError: providerError,
            },
          };
        }
      } catch {
        // Replicate also unavailable — try the Grok tier before the honest error.
      }

      // Tier 3 — Grok Imagine (xAI). Funded last-resort image leg so a credits
      // outage on BOTH NanoBanana and Replicate still yields a real preview.
      try {
        const grok = await this.runGrokImage(request);
        if (grok && grok.success) {
          return {
            ...grok,
            metadata: {
              ...grok.metadata,
              imageFallback: 'nanobanana->replicate->grok',
              primaryProvider: 'nanobanana',
              primaryProviderError: providerError,
            },
          };
        }
      } catch {
        // Grok also unavailable — fall through to the honest NanoBanana error
        // below, which is the most actionable signal for the operator.
      }

      return {
        success: false,
        provider: 'nanobanana',
        operation: 'text-to-image',
        responseType: 'text',
        message: providerError,
        predictionStatus: 'failed',
        metadata: {
          provider: 'nanobanana',
          operation: 'text-to-image',
          sessionId: request.sessionId,
          endpoint,
          creditCost: getNanoBananaCreditCost(endpoint),
          outputType: 'text',
          promptHash,
          confidence: request.confidence,
          raw: result.raw,
          error: providerError,
        },
      };
    }

    return {
      success: true,
      provider: 'nanobanana',
      operation: 'text-to-image',
      responseType: 'text',
      message: result.text || 'NanoBanana task completed without media URL.',
      predictionStatus: 'succeeded',
      metadata: {
        provider: 'nanobanana',
        operation: 'text-to-image',
        sessionId: request.sessionId,
        endpoint,
        creditCost: getNanoBananaCreditCost(endpoint),
        outputType: 'text',
        promptHash,
        confidence: request.confidence,
        raw: result.raw,
      },
    };
  }

  /**
   * Grok Imagine (xAI) — the THIRD image tier. Reached only when NanoBanana AND
   * the Replicate FLUX failover have both failed. Reads XAI_API_KEY (operator-set
   * in env); returns null when unconfigured so the caller treats it as "leg
   * unavailable", or throws a diagnosable status on a real provider error.
   */
  private async runGrokImage(request: ServiceManagerRequest): Promise<ServiceManagerResponse | null> {
    if (!hasXaiApiKey()) return null;
    const promptHash = this.hashPrompt(request.userPrompt);
    const img = await generateGrokImage(request.userPrompt);
    const url = img?.url ?? (img?.b64 ? `data:image/png;base64,${img.b64}` : null);
    if (!url) return null;
    return {
      success: true,
      provider: 'xai',
      operation: 'text-to-image',
      responseType: 'image',
      message: img?.revisedPrompt || 'Image generation completed successfully.',
      assetUrl: url,
      assetType: 'image',
      predictionStatus: 'succeeded',
      metadata: {
        provider: 'xai',
        model: img?.model || 'grok-2-image',
        operation: 'text-to-image',
        outputType: 'image',
        sessionId: request.sessionId,
        promptHash,
        confidence: request.confidence,
      },
    };
  }

  private async runReplicateImage(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const options = request.selectedOptions || {};
    const promptHash = this.hashPrompt(request.userPrompt);
    const aspectRatio = this.normalizeAspectRatio(this.getOption(options, ['aspect', 'aspectRatio', 'ratio', 'img-size']));
    const style = this.getOption(options, ['style', 'img-style', 'imgStyle']) || undefined;
    const quality = this.mapReplicateQuality(this.getOption(options, ['quality', 'img-quality', 'imgQuality']));

    const validation = validateInput({
      service: 'image',
      prompt: request.userPrompt,
      // FLUX 1.1 Pro is the Replicate image quality (owner decision 2026-07-11): this path is BOTH
      // the explicit-replicate branch and the NanoBanana error-fallback, so 'general' → flux-pro
      // (models.ts image.variants) upgrades the fallback off the cheap flux-schnell 'fast' tier.
      variant: 'general',
      quality,
      aspectRatio,
      style,
      imageUrl: request.imageUrl,
    });

    if (!validation.valid || !validation.sanitized) {
      throw new Error(validation.error || 'Invalid text-to-image payload for Replicate');
    }

    validation.sanitized.prompt = request.userPrompt;

    const model = resolveModel('image', validation.sanitized.variant || 'general');
    const modelInput = buildModelInput(validation.sanitized);
    const prediction = await createPrediction(model.id, modelInput);

    if (prediction.status === 'succeeded') {
      const normalized = normalizeOutput(
        'image',
        model.label,
        model.outputType,
        prediction.id,
        prediction.status,
        prediction.output,
        prediction.error,
        prediction.metrics as unknown as Record<string, unknown> | undefined,
      );

      if (normalized.url || normalized.text) {
        return {
          success: normalized.success,
          provider: 'replicate',
          operation: 'text-to-image',
          responseType: normalized.url ? 'image' : 'text',
          message: normalized.text || 'Image generation completed successfully.',
          assetUrl: normalized.url,
          assetType: normalized.url ? 'image' : undefined,
          predictionStatus: 'succeeded',
          metadata: {
            provider: 'replicate',
            model: model.label,
            operation: 'text-to-image',
            outputType: model.outputType,
            sessionId: request.sessionId,
            providerTaskId: prediction.id,
            promptHash,
            confidence: request.confidence,
            metrics: prediction.metrics,
          },
        };
      }
    }

    const taskRef = this.encodeTaskRef({
      provider: 'replicate',
      providerTaskId: prediction.id,
      sessionId: request.sessionId,
      serviceContext: request.serviceContext,
      intent: request.intent,
      operation: 'text-to-image',
      responseType: 'image',
      promptHash,
      createdAt: Date.now(),
    });

    return {
      success: true,
      provider: 'replicate',
      operation: 'text-to-image',
      responseType: 'image',
      message: 'Image generation started. Waiting for provider status.',
      predictionId: taskRef,
      predictionStatus: prediction.status === 'failed' ? 'failed' : 'processing',
      metadata: {
        provider: 'replicate',
        model: model.label,
        operation: 'text-to-image',
        outputType: model.outputType,
        sessionId: request.sessionId,
        taskRef,
        providerTaskId: prediction.id,
        promptHash,
        confidence: request.confidence,
      },
    };
  }

  /**
   * PHASE 57 — Replicate (Zeroscope) text-to-video fallback. Mirrors
   * runReplicateImage: validate → resolve the funded `video` route → fire a
   * prediction → return an immediate asset URL when synchronous, else a
   * replicate taskRef the existing poll path already understands. Used as the
   * automatic failover when the primary LTX provider is out of funds (402).
   * The text-to-video route can't honor an image-anchor, but a generated clip
   * beats a hard error; image anchors degrade gracefully to prompt-only.
   */
  private async runReplicateVideo(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const options = request.selectedOptions || {};
    const promptHash = this.hashPrompt(request.userPrompt);
    const aspectRatio = this.normalizeAspectRatio(this.getOption(options, ['aspect', 'aspectRatio', 'ratio'])) || '16:9';

    const validation = validateInput({
      service: 'video',
      prompt: request.userPrompt,
      variant: 'text-to-video',
      quality: 'high',
      aspectRatio,
    });

    if (!validation.valid || !validation.sanitized) {
      throw new Error(validation.error || 'Invalid text-to-video payload for Replicate');
    }

    validation.sanitized.prompt = request.userPrompt;

    const model = resolveModel('video', validation.sanitized.variant || 'text-to-video');
    const modelInput = buildModelInput(validation.sanitized);
    const prediction = await createPrediction(model.id, modelInput);

    if (prediction.status === 'succeeded') {
      const normalized = normalizeOutput(
        'video',
        model.label,
        model.outputType,
        prediction.id,
        prediction.status,
        prediction.output,
        prediction.error,
        prediction.metrics as unknown as Record<string, unknown> | undefined,
      );

      if (normalized.url) {
        return {
          success: true,
          provider: 'replicate',
          operation: 'video-avatar',
          responseType: 'video',
          message: 'Video generation completed successfully.',
          assetUrl: normalized.url,
          assetType: 'video',
          predictionStatus: 'succeeded',
          metadata: {
            provider: 'replicate',
            model: model.label,
            operation: 'video-avatar',
            outputType: model.outputType,
            sessionId: request.sessionId,
            providerTaskId: prediction.id,
            promptHash,
            confidence: request.confidence,
            metrics: prediction.metrics,
          },
        };
      }
    }

    const taskRef = this.encodeTaskRef({
      provider: 'replicate',
      providerTaskId: prediction.id,
      sessionId: request.sessionId,
      serviceContext: request.serviceContext,
      intent: request.intent,
      operation: 'video-avatar',
      responseType: 'video',
      promptHash,
      createdAt: Date.now(),
    });

    return {
      success: true,
      provider: 'replicate',
      operation: 'video-avatar',
      responseType: 'video',
      message: 'Video generation started. Waiting for provider status.',
      predictionId: taskRef,
      predictionStatus: prediction.status === 'failed' ? 'failed' : 'processing',
      metadata: {
        provider: 'replicate',
        model: model.label,
        operation: 'video-avatar',
        outputType: model.outputType,
        sessionId: request.sessionId,
        taskRef,
        providerTaskId: prediction.id,
        promptHash,
        confidence: request.confidence,
      },
    };
  }

  /**
   * PHASE 57 — true when a provider HTTP failure means "no output is possible"
   * for a billing/auth reason (out of funds, quota, payment, unauthorized) as
   * opposed to a deterministic bad-request bug we'd want to surface. Drives the
   * automatic LTX→Replicate video failover.
   */
  private isProviderCreditError(status: number, text: string): boolean {
    if (status === 402 || status === 429) return true;
    return /insufficient|insufficient_funds|top.?up|quota|exceeded|payment|balance|out of credit|unauthor|forbidden|denied/i.test(text || '');
  }

  /** PHASE 47 §3 — abortable sleep used between backoff attempts. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** A 5xx or 429 is transient and worth retrying; a 4xx is deterministic. */
  private isRetryableLtxStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  /**
   * PHASE 47 §3 — Dispatch the LTX render with bounded exponential backoff.
   *
   * Returns the first successful (`response.ok`) Response, OR the final Response
   * even when it is a non-retryable error — so the caller's existing
   * `if (!response.ok)` branch still produces the exact provider error text.
   * Only transient failures (network throw / 429 / 5xx) consume a retry; a
   * deterministic 4xx returns immediately. Backoff grows 400ms → 800ms → 1600ms
   * with light jitter to avoid thundering-herd retries across the 5 parallel
   * clip legs.
   */
  private async dispatchLtxWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= LTX_MAX_DISPATCH_ATTEMPTS; attempt++) {
      try {
        // Bound each direct-LTX create attempt so a hanging api.ltx.video call
        // can't stall the synchronous film dispatch past the gateway limit
        // (mirrors the Replicate create timeout). A fresh signal per attempt;
        // respect a caller-supplied signal if one was passed.
        const attemptInit: RequestInit = {
          ...init,
          signal: init.signal ?? AbortSignal.timeout(PROVIDER_CREATE_TIMEOUT_MS),
        };
        const response = await fetch(url, attemptInit);
        if (response.ok || !this.isRetryableLtxStatus(response.status)) {
          return response;
        }
        // Transient HTTP error — drain the body so the socket can be reused,
        // then back off and retry (unless this was the final attempt).
        await response.text().catch(() => undefined);
        lastError = new Error(`LTX transient HTTP ${response.status}`);
        if (attempt === LTX_MAX_DISPATCH_ATTEMPTS) return response;
      } catch (err) {
        // Network/DNS/abort throw — retry unless we're out of attempts.
        lastError = err;
        if (attempt === LTX_MAX_DISPATCH_ATTEMPTS) throw err;
      }
      const backoff = LTX_RETRY_BASE_MS * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * 120);
      // eslint-disable-next-line no-console
      console.warn(
        `[ltx] dispatch attempt ${attempt}/${LTX_MAX_DISPATCH_ATTEMPTS} transient failure; retrying in ${backoff + jitter}ms:`,
        lastError instanceof Error ? lastError.message : lastError,
      );
      await this.delay(backoff + jitter);
    }
    // Unreachable (the loop always returns/throws on the final attempt), but the
    // type checker needs a terminal throw.
    throw lastError instanceof Error ? lastError : new Error('LTX dispatch failed');
  }

  private async runLtxVideo(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    // PHASE 45 §1 — accept the key under any provisioned alias.
    const apiKey = resolveLtxApiKey();
    if (!apiKey) {
      // LTX absent. Replicate is normally the *failover* triggered once a
      // configured LTX endpoint returns a credit/auth error — but with NO LTX key
      // at all that failover branch (below) is never reached. `selectVideoPrimaryProvider`
      // is the single source of truth for this choice: with no LTX key it promotes a
      // provisioned Replicate token to the PRIMARY render path. This is what makes a
      // Replicate-only deployment actually render clips, instead of the pipeline
      // pre-flight (hasVideoProvider = LTX || Replicate) waving the run through only
      // for every clip to skip at ~38% AFTER a founder slot / GEL was reserved.
      const decision = selectVideoPrimaryProvider();
      if (decision.primary === 'replicate') {
        const primary = await this.runReplicateVideo(request);
        return {
          ...primary,
          metadata: {
            ...primary.metadata,
            videoPrimary: 'replicate',
            primaryProviderReason: decision.reason,
          },
        };
      }
      throw new Error('LTX video API key is not configured (LTX_VIDEO_API_KEY / LTX_API_KEY / LTX2_API_KEY)');
    }

    const options = request.selectedOptions || {};
    const promptHash = this.hashPrompt(request.userPrompt);

    // PHASE 40 §2 — Cognitive Prompt Deep-Exploitation. Mine the raw prompt for
    // camera/style/lighting/tone/audio intent, then (a) decide whether LTX must
    // generate a synchronized audio track and (b) fold the extracted directorial
    // traits back into the prompt so none of the user's nuance is truncated.
    // @Film / cinematic video defaults to audio-on (defaultAudio) — a muted
    // cinematic clip is exactly the failure mode we are eliminating.
    const traits = extractPromptTraits(request.userPrompt, { defaultAudio: true });
    const explicitAudio = this.getOption(options, ['generate_audio', 'generateAudio', 'audio']);
    const wantAudio = explicitAudio != null
      ? !/^(false|0|off|no|mute|silent)$/i.test(explicitAudio)
      : traits.wantsAudio;
    const enrichedPrompt = enrichVideoPrompt(request.userPrompt, traits, 1500);

    // PHASE 42 §1 — continuity controls. A film-pipeline clip carries a fixed
    // seed (shared across the 5 consecutive clips) and, when the user supplies a
    // custom avatar, a character reference — so the protagonist stays identical.
    const seedRaw = this.getOption(options, ['seed', 'consistencySeed']);
    const seedParsed = seedRaw != null ? Number.parseInt(seedRaw, 10) : NaN;
    const seedOpt = Number.isFinite(seedParsed) && seedParsed >= 0 ? seedParsed : undefined;
    const charRefOpt = this.getOption(options, ['characterReference', 'character_reference', 'avatarReference']) || undefined;
    // PHASE 45 §2 — multimodal IP-Adapter array: 1–3 reference images locking the
    // protagonist's identity across the clip. Arrives JSON-encoded from the film
    // pipeline; falls back silently to the single-ref path when absent/invalid.
    const charRefsOpt = this.getOption(options, ['characterReferences', 'character_references']);
    let characterReferences: string[] = [];
    if (charRefsOpt) {
      try {
        const parsedRefs: unknown = JSON.parse(charRefsOpt);
        if (Array.isArray(parsedRefs)) {
          characterReferences = parsedRefs
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .slice(0, 3);
        }
      } catch { /* not JSON — the single characterReference path already covers it */ }
    }

    // PHASE 50 §3 — image-to-video anchor resolution. "Turn this into a video"
    // from an existing image card binds the prior asset URL as a HARD first-frame
    // reference. Accepted under several aliases from the orchestrate selectedOptions,
    // and falls back to request.imageUrl if a single-image edit context flows in.
    const imageReferenceOpt =
      this.getOption(options, [
        'image_reference', 'imageReference',
        'frame_input', 'frameInput',
        'first_frame', 'firstFrame',
        'sourceImage', 'source_image', 'image_url',
      ]) || request.imageUrl || undefined;

    // CRITICAL IDENTITY FIX — the film studio uploads the protagonist's selfie as
    // `characterReference` (NOT as an explicit image_reference). Previously that
    // only ever reached the /v2/text-to-video endpoint, where LTX does NOT lock to
    // the face — so the uploaded photo never appeared in the rendered film (the
    // live "my image isn't in the video" report). When there is no explicit anchor
    // but a usable HOSTED (https) character reference exists, promote THAT selfie to
    // the image-to-video first-frame anchor so every clip animates FROM the real
    // subject. https-only: the film pipeline hosts the selfie to a signed https URL
    // (well under the imageReference schema bound), and the provider rejects raw
    // data: URIs; an unhosted data: ref still rides as `character_reference` below
    // and the Replicate fallback path attempts it image-first.
    const charRefIsHostedImage =
      typeof charRefOpt === 'string' && /^https?:\/\//i.test(charRefOpt) && charRefOpt.length <= 4096;
    const effectiveImageRef =
      imageReferenceOpt || (charRefIsHostedImage ? charRefOpt : undefined);

    // When an anchor is present, the Video Agent is FORBIDDEN from inventing a
    // fresh scene: it must ingest and expand upon the active visual. We prepend a
    // hard continuity directive so the prompt enriches the existing frame rather
    // than describing something new, then re-clamp to the 1500-char schema bound.
    const anchoredPrompt = imageReferenceOpt
      ? enrichVideoPrompt(
          `Animate the supplied source image as the opening frame. Preserve its exact subject, composition, colour palette and identity, then add natural cinematic motion. ${request.userPrompt}`.trim(),
          traits,
          1500,
        )
      : enrichedPrompt;

    // PHASE 52 TASK 5 — strict prompt mirroring for framing. If the user TYPED an
    // explicit orientation ("vertical reel", "anamorphic", "widescreen"), that
    // directive OVERRIDES the UI/default aspect so an anamorphic ask never ships
    // as a portrait clip (and vice-versa). When the prompt says nothing about
    // framing, the selected/default aspect stands.
    const selectedAspect = this.normalizeAspectRatio(this.getOption(options, ['aspect', 'aspectRatio', 'ratio'])) || '16:9';
    const promptAspect = extractAspectDirective(request.userPrompt);
    const aspectRatio = promptAspect
      ? (promptAspect === '9:16' || promptAspect === '4:5' || promptAspect === '3:4' ? '9:16' : '16:9')
      : selectedAspect;
    const requestedModel = this.getOption(options, ['model', 'videoModel']) === 'ltx-2-3-pro' ? 'ltx-2-3-pro' : 'ltx-2-3-fast';
    // PHASE 22 (VECTOR 1) — LTX-2 has NO native negative_prompt field (ltxRequestSchema omits it), so
    // the only safe lever is an IN-PROMPT drift clause — the same idiom the film prompts already use
    // ("No on-screen text, titles..."). Applied ONLY when the film pipeline threaded a negative (i.e.
    // selectedOptions.negativePrompt is set), so standalone video generation stays byte-identical.
    // Clamped so the appended clause keeps the total within the schema's 1500-char bound.
    const LTX_DRIFT_CLAUSE = ' Natural true-to-life colour, neutral white balance. No yellow or sepia tint, no facial distortion, no deformed hands, no cartoon or illustration look.';
    const hasFilmNegative = !!this.getOption(options, ['negativePrompt', 'negative_prompt', 'negative']);
    const ltxPrompt = hasFilmNegative
      ? (anchoredPrompt.slice(0, 1500 - LTX_DRIFT_CLAUSE.length) + LTX_DRIFT_CLAUSE)
      : anchoredPrompt;
    const parsed = ltxRequestSchema.parse({
      prompt: ltxPrompt,
      model: requestedModel,
      resolution: this.mapLtxResolution(this.getOption(options, ['resolution', 'size']), aspectRatio, requestedModel),
      duration: this.toNumber(this.getOption(options, ['duration', 'durationSec', 'seconds']), 6),
      fps: this.clampLtxFps(this.toNumber(this.getOption(options, ['fps']), 24)),
      generateAudio: wantAudio,
      ...(seedOpt != null ? { seed: seedOpt } : {}),
      ...(charRefOpt ? { characterReference: charRefOpt } : {}),
      ...(effectiveImageRef ? { imageReference: effectiveImageRef } : {}),
    });

    // PHASE 51 §1 — When an image anchor is present we MUST call the dedicated
    // image-to-video endpoint and pass the parent asset as the documented
    // `image_uri` first-frame field, else the endpoint generates an unrelated
    // scene from prompt text alone (the live "ignored the image" failure).
    //
    // PHASE 59 — CRITICAL VERSION FIX. The live API is /v2/, not /v1/. Probing
    // api.ltx.video confirmed POST /v1/text-to-video still 401s (a lingering
    // legacy route) BUT the async STATUS endpoint only exists on /v2/
    // (GET /v1/text-to-video/{id} → 404, GET /v2/text-to-video/{id} → 401). So a
    // /v1 dispatch could never be polled to completion — every status read 404'd
    // and the clip span "processing" until the deadline (the 0/5 stall). Per
    // docs.ltx.video the contract is: POST /v2/{text,image}-to-video → { id },
    // then poll GET /v2/{...}/{id} until status==completed → result.video_url.
    const isImageToVideo = !!parsed.imageReference;
    const ltxEndpoint = isImageToVideo
      ? `${LTX_BASE_URL}/v2/image-to-video`
      : `${LTX_BASE_URL}/v2/text-to-video`;

    // Runtime trace — make the LTX create boundary explicit (no secret values):
    // which endpoint, whether the identity image actually rode along, model + dur.
    // This is the line that proves an uploaded photo reached the render engine.
    // eslint-disable-next-line no-console
    console.log('[ltx:create]', {
      endpoint: ltxEndpoint.replace(LTX_BASE_URL, ''),
      model: parsed.model,
      durationSec: parsed.duration,
      characterRef: parsed.characterReference ? (/^https?:\/\//i.test(parsed.characterReference) ? 'https' : 'inline') : 'none',
      characterRefs: characterReferences.length,
      // 'explicit' = a "turn this into a video" anchor; 'character' = the film
      // selfie promoted to the first-frame anchor (the identity fix); 'no' = pure
      // text-to-video. This line PROVES the uploaded face reached the engine.
      imageAnchor: parsed.imageReference ? (imageReferenceOpt ? 'explicit' : 'character') : 'no',
    });
    // PHASE 47 §3 — dispatch through the bounded exponential-backoff retry so a
    // transient provider blip (the exact failure that dropped clips 3 & 4 in the
    // PHASE 46 live-fire) self-heals before the master agent gives up.
    const response = await this.dispatchLtxWithRetry(ltxEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: parsed.prompt,
        model: parsed.model,
        resolution: parsed.resolution,
        duration: parsed.duration,
        fps: parsed.fps,
        generate_audio: parsed.generateAudio,
        ...(parsed.seed != null ? { seed: parsed.seed } : {}),
        ...(parsed.characterReference ? { character_reference: parsed.characterReference } : {}),
        ...(characterReferences.length ? { character_references: characterReferences } : {}),
        // PHASE 51 §1 — bind the parent image as the hard first-frame anchor on
        // the image-to-video endpoint. `image_uri` is the authoritative field
        // name (docs.ltx.video). This is the line that makes LTX animate the
        // ACTUAL image instead of hallucinating a fresh scene from text.
        ...(parsed.imageReference ? { image_uri: parsed.imageReference } : {}),
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const err = await response.text();
      // PHASE 57 — a billing/auth failure from LTX (e.g. 402 insufficient_funds)
      // must NOT be a dead end: transparently fail over to the funded Replicate
      // (Zeroscope) text-to-video path so the user still receives a clip. Only
      // genuine credit/auth failures fall over; a deterministic 4xx bad-request
      // still surfaces so we never mask our own bugs.
      if (this.isProviderCreditError(response.status, err)) {
        const fallback = await this.runReplicateVideo(request).catch(() => null);
        if (fallback && fallback.success) {
          return {
            ...fallback,
            metadata: {
              ...fallback.metadata,
              videoFallback: 'ltx->replicate',
              primaryProvider: 'ltx',
              primaryProviderError: `LTX request failed (${response.status})`,
            },
          };
        }
      }
      throw new Error(`LTX request failed (${response.status}): ${err || 'unknown error'}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => ({}));
      const outputUrl = this.extractUrl(payload);
      const providerTaskId = this.extractTaskId(payload);

      if (outputUrl) {
        return {
          success: true,
          provider: 'ltx',
          operation: 'video-avatar',
          responseType: 'video',
          message: 'Video generation completed successfully.',
          assetUrl: outputUrl,
          assetType: 'video',
          predictionStatus: 'succeeded',
          metadata: {
            provider: 'ltx',
            model: parsed.model,
            operation: 'video-avatar',
            outputType: 'video',
            audioEnabled: parsed.generateAudio,
            imageAnchored: !!parsed.imageReference,
            sessionId: request.sessionId,
            promptHash,
            confidence: request.confidence,
            raw: payload,
          },
        };
      }

      if (providerTaskId) {
        const taskRef = this.encodeTaskRef({
          provider: 'ltx',
          providerTaskId,
          sessionId: request.sessionId,
          serviceContext: request.serviceContext,
          intent: request.intent,
          operation: 'video-avatar',
          responseType: 'video',
          promptHash,
          createdAt: Date.now(),
        });

        return {
          success: true,
          provider: 'ltx',
          operation: 'video-avatar',
          responseType: 'video',
          message: this.extractText(payload) || 'LTX accepted request. Polling for completion.',
          predictionId: taskRef,
          predictionStatus: 'processing',
          metadata: {
            provider: 'ltx',
            model: parsed.model,
            operation: 'video-avatar',
            outputType: 'video',
            audioEnabled: parsed.generateAudio,
            sessionId: request.sessionId,
            taskRef,
            providerTaskId,
            promptHash,
            confidence: request.confidence,
            raw: payload,
          },
        };
      }

      throw new Error(this.extractText(payload) || 'LTX returned no output URL or task ID');
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) {
      throw new Error('LTX returned oversized video payload for inline transport');
    }

    // PHASE 51 §2 — re-host the binary MP4 to CSP-allowed *.supabase.co storage
    // and serve a real https URL. A multi-MB inline `data:` video is the known
    // iOS / standalone-PWA infinite-spinner failure — the <video> element never
    // fires loadedmetadata for a giant data: source, so PreviewWorkspace hangs
    // on "assembling" forever even though the render succeeded. Fail-safe: the
    // helper falls back to the data: URL when storage is unconfigured.
    const hostedUrl = await this.rehostLtxVideo(bytes, contentType, request.sessionId, promptHash);

    return {
      success: true,
      provider: 'ltx',
      operation: 'video-avatar',
      responseType: 'video',
      message: 'Video generation completed successfully.',
      assetUrl: hostedUrl,
      assetType: 'video',
      predictionStatus: 'succeeded',
      metadata: {
        provider: 'ltx',
        model: parsed.model,
        operation: 'video-avatar',
        outputType: 'video',
        audioEnabled: parsed.generateAudio,
        imageAnchored: !!parsed.imageReference,
        rehosted: /^https:\/\//i.test(hostedUrl),
        sessionId: request.sessionId,
        promptHash,
        confidence: request.confidence,
      },
    };
  }

  // PHASE 51 §2 — Re-host an LTX binary MP4 to our Supabase storage and return a
  // CSP-allowed *.supabase.co signed URL the browser can stream natively. The
  // sync LTX API returns the MP4 *binary* directly; turning that into a
  // multi-megabyte `data:` URL is what froze PreviewWorkspace on the live DOM.
  // Fail-safe by contract: any storage failure returns the data: URL so a
  // successful render is never lost — we degrade transport, never the result.
  private async rehostLtxVideo(
    bytes: Buffer,
    contentType: string,
    sessionId: string,
    promptHash: string,
  ): Promise<string> {
    const ct = contentType && contentType.includes('/') ? contentType.split(';')[0] || 'video/mp4' : 'video/mp4';
    const ext = ct.includes('webm') ? 'webm' : 'mp4';
    const base64 = bytes.toString('base64');
    const dataUrl = `data:${ct};base64,${base64}`;
    try {
      const safeSession = (sessionId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'anon';
      const path = `ltx/${safeSession}/${promptHash}-${Date.now()}.${ext}`;
      const hosted = await uploadAndSign('renders', path, base64, ct, LTX_REHOST_TTL_SEC);
      return hosted || dataUrl;
    } catch {
      return dataUrl;
    }
  }

  private async runHeygenAvatarVideo(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const apiKey = process.env.HEYGEN_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('HEYGEN_API_KEY is not configured');
    }

    const options = request.selectedOptions || {};
    const promptHash = this.hashPrompt(request.userPrompt);

    const parsed = heygenRequestSchema.parse({
      script: request.userPrompt,
      aspectRatio: this.normalizeHeygenAspect(this.getOption(options, ['aspect', 'aspectRatio', 'ratio'])),
      voiceGender: this.normalizeVoiceGender(this.getOption(options, ['voice_gender', 'voiceGender'])),
      voiceLanguage: this.getOption(options, ['voice_language', 'voiceLanguage']) || (request.locale || 'en'),
    });

    const voiceId = this.getOption(options, ['voice_id', 'voiceId'])
      || await this.getHeygenVoiceId(apiKey, parsed.voiceGender, parsed.voiceLanguage);

    const avatarId = this.getOption(options, ['avatar_id', 'avatarId']) || await this.getHeygenFirstAvatar(apiKey);
    const avatarStyle = this.normalizeHeygenAvatarStyle(this.getOption(options, ['avatar_style', 'avatarStyle', 'style']));
    const dimension = this.mapHeygenDimension(parsed.aspectRatio);

    const response = await fetch(`${HEYGEN_BASE_URL}/v2/video/generate`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_inputs: [{
          character: {
            type: 'avatar',
            avatar_id: avatarId,
            avatar_style: avatarStyle,
          },
          voice: {
            type: 'text',
            input_text: parsed.script,
            voice_id: voiceId,
          },
        }],
        dimension,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HeyGen video generation failed (${response.status}): ${err || 'unknown error'}`);
    }

    const payload = await response.json().catch(() => ({}));
    const providerTaskId = this.extractTaskId(payload);
    if (!providerTaskId) {
      throw new Error('HeyGen returned no video task ID');
    }

    const taskRef = this.encodeTaskRef({
      provider: 'heygen',
      providerTaskId,
      sessionId: request.sessionId,
      serviceContext: request.serviceContext,
      intent: request.intent,
      operation: 'video-avatar',
      responseType: 'video',
      promptHash,
      createdAt: Date.now(),
    });

    return {
      success: true,
      provider: 'heygen',
      operation: 'video-avatar',
      responseType: 'video',
      message: 'Avatar generation started. Waiting for HeyGen completion.',
      predictionId: taskRef,
      predictionStatus: 'processing',
      metadata: {
        provider: 'heygen',
        model: 'heygen-v2-video',
        operation: 'video-avatar',
        outputType: 'video',
        sessionId: request.sessionId,
        taskRef,
        providerTaskId,
        promptHash,
        confidence: request.confidence,
        raw: payload,
      },
    };
  }

  private async pollReplicateTask(decoded: EncodedTaskRef, taskRef: string): Promise<ServiceManagerResponse> {
    const prediction = await pollPrediction(decoded.providerTaskId);

    if (prediction.status === 'succeeded') {
      const normalized = normalizeOutput(
        decoded.responseType === 'video' ? 'video' : 'image',
        decoded.responseType === 'video' ? 'Replicate Video' : 'Replicate SDXL',
        decoded.responseType === 'video' ? 'video' : 'image',
        prediction.id,
        prediction.status,
        prediction.output,
        prediction.error,
        prediction.metrics as unknown as Record<string, unknown> | undefined,
      );

      if (!normalized.url && !normalized.text) {
        return {
          success: false,
          provider: 'replicate',
          operation: decoded.operation,
          responseType: decoded.responseType,
          message: 'Replicate completed without output URL.',
          predictionId: taskRef,
          predictionStatus: 'failed',
          metadata: {
            provider: 'replicate',
            operation: decoded.operation,
            sessionId: decoded.sessionId,
            taskRef,
            providerTaskId: decoded.providerTaskId,
            promptHash: decoded.promptHash,
          },
        };
      }

      return {
        success: true,
        provider: 'replicate',
        operation: decoded.operation,
        responseType: decoded.responseType,
        message: normalized.text || 'Generation completed successfully.',
        assetUrl: normalized.url,
        assetType: decoded.responseType,
        predictionId: taskRef,
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'replicate',
          operation: decoded.operation,
          outputType: decoded.responseType,
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
          metrics: prediction.metrics,
        },
      };
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return {
        success: false,
        provider: 'replicate',
        operation: decoded.operation,
        responseType: decoded.responseType,
        message: prediction.error || 'Replicate generation failed.',
        predictionId: taskRef,
        predictionStatus: prediction.status,
        metadata: {
          provider: 'replicate',
          operation: decoded.operation,
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
        },
      };
    }

    return {
      success: true,
      provider: 'replicate',
      operation: decoded.operation,
      responseType: decoded.responseType,
      message: 'Still processing…',
      predictionId: taskRef,
      predictionStatus: prediction.status,
      metadata: {
        provider: 'replicate',
        operation: decoded.operation,
        sessionId: decoded.sessionId,
        taskRef,
        providerTaskId: decoded.providerTaskId,
        promptHash: decoded.promptHash,
      },
    };
  }

  private async pollHeygenTask(decoded: EncodedTaskRef, taskRef: string): Promise<ServiceManagerResponse> {
    const apiKey = process.env.HEYGEN_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('HEYGEN_API_KEY is not configured');
    }

    const res = await fetch(`${HEYGEN_BASE_URL}/v1/video_status.get?video_id=${encodeURIComponent(decoded.providerTaskId)}`, {
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HeyGen status check failed (${res.status}): ${err || 'unknown error'}`);
    }

    const payload = await res.json().catch(() => ({}));
    const data = payload && typeof payload === 'object' && 'data' in payload
      ? (payload.data as Record<string, unknown>)
      : (payload as Record<string, unknown>);

    const status = String(data.status || '').toLowerCase();
    const outputUrl = typeof data.video_url === 'string' ? data.video_url : this.extractUrl(payload);

    if (status === 'completed' && outputUrl) {
      return {
        success: true,
        provider: 'heygen',
        operation: decoded.operation,
        responseType: 'video',
        message: 'Avatar generation completed successfully.',
        assetUrl: outputUrl,
        assetType: 'video',
        predictionId: taskRef,
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'heygen',
          operation: decoded.operation,
          outputType: 'video',
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
        },
      };
    }

    if (status === 'failed') {
      const errorMessage = typeof data.error === 'string' ? data.error : 'HeyGen generation failed.';
      return {
        success: false,
        provider: 'heygen',
        operation: decoded.operation,
        responseType: 'video',
        message: errorMessage,
        predictionId: taskRef,
        predictionStatus: 'failed',
        metadata: {
          provider: 'heygen',
          operation: decoded.operation,
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
        },
      };
    }

    return {
      success: true,
      provider: 'heygen',
      operation: decoded.operation,
      responseType: 'video',
      message: 'Still processing…',
      predictionId: taskRef,
      predictionStatus: 'processing',
      metadata: {
        provider: 'heygen',
        operation: decoded.operation,
        sessionId: decoded.sessionId,
        taskRef,
        providerTaskId: decoded.providerTaskId,
        promptHash: decoded.promptHash,
      },
    };
  }

  private async pollLtxTask(decoded: EncodedTaskRef, taskRef: string): Promise<ServiceManagerResponse> {
    // PHASE 45 §1 — accept the key under any provisioned alias.
    const apiKey = resolveLtxApiKey();
    if (!apiKey) {
      throw new Error('LTX video API key is not configured (LTX_VIDEO_API_KEY / LTX_API_KEY / LTX2_API_KEY)');
    }

    // PHASE 59 — Poll the DOCUMENTED /v2 status endpoints. GET /v2/{kind}-to-video/{id}
    // is the only status route that actually exists (the old /v1/{id} guesses all
    // 404'd, which is what wedged every clip on "processing"). A text job 404s on
    // the image path and vice-versa, so we try both and use whichever resolves.
    const candidateUrls = [
      `${LTX_BASE_URL}/v2/text-to-video/${encodeURIComponent(decoded.providerTaskId)}`,
      `${LTX_BASE_URL}/v2/image-to-video/${encodeURIComponent(decoded.providerTaskId)}`,
    ];

    // A deterministic auth/billing rejection (401 unauthorized / 402 payment
    // required / 403 forbidden) is NEVER transient — masking it as "processing"
    // is what wedges a clip on the 0/5 spinner until the client deadline. Track
    // it across candidates and surface a terminal failure below. (404 stays
    // transient: a freshly-dispatched job legitimately 404s before it registers,
    // and 429 is a rate-limit, not a dead job — both keep polling as 'processing'.)
    let authBillingRejected = false;

    for (const url of candidateUrls) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          authBillingRejected = true;
        }
        continue;
      }

      const contentType = res.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        const bytes = Buffer.from(await res.arrayBuffer());
        // PHASE 51 §2 — same re-host as the sync path: never hand the client a
        // multi-MB data: video (the iOS infinite-spinner failure). Re-host to
        // *.supabase.co, fail-safe to the data: URL when storage is down.
        const hostedUrl = await this.rehostLtxVideo(bytes, contentType, decoded.sessionId, decoded.promptHash);
        return {
          success: true,
          provider: 'ltx',
          operation: decoded.operation,
          responseType: 'video',
          message: 'Video generation completed successfully.',
          assetUrl: hostedUrl,
          assetType: 'video',
          predictionId: taskRef,
          predictionStatus: 'succeeded',
          metadata: {
            provider: 'ltx',
            operation: decoded.operation,
            outputType: 'video',
            rehosted: /^https:\/\//i.test(hostedUrl),
            sessionId: decoded.sessionId,
            taskRef,
            providerTaskId: decoded.providerTaskId,
            promptHash: decoded.promptHash,
          },
        };
      }

      const payload = await res.json().catch(() => ({}));
      const outputUrl = this.extractUrl(payload);
      const status = this.extractStatus(payload);

      if (outputUrl && (!status || status === 'completed' || status === 'succeeded' || status === 'success')) {
        return {
          success: true,
          provider: 'ltx',
          operation: decoded.operation,
          responseType: 'video',
          message: 'Video generation completed successfully.',
          assetUrl: outputUrl,
          assetType: 'video',
          predictionId: taskRef,
          predictionStatus: 'succeeded',
          metadata: {
            provider: 'ltx',
            operation: decoded.operation,
            outputType: 'video',
            sessionId: decoded.sessionId,
            taskRef,
            providerTaskId: decoded.providerTaskId,
            promptHash: decoded.promptHash,
          },
        };
      }

      if (status && TERMINAL_LTX_STATUS.has(status)) {
        return {
          success: !FAILED_LTX_STATUS.has(status),
          provider: 'ltx',
          operation: decoded.operation,
          responseType: 'video',
          message: FAILED_LTX_STATUS.has(status)
            ? (this.extractText(payload) || 'LTX generation failed.')
            : 'Video generation completed.',
          assetUrl: outputUrl,
          assetType: outputUrl ? 'video' : undefined,
          predictionId: taskRef,
          predictionStatus: FAILED_LTX_STATUS.has(status) ? 'failed' : 'succeeded',
          metadata: {
            provider: 'ltx',
            operation: decoded.operation,
            outputType: 'video',
            sessionId: decoded.sessionId,
            taskRef,
            providerTaskId: decoded.providerTaskId,
            promptHash: decoded.promptHash,
            raw: payload,
          },
        };
      }

      return {
        success: true,
        provider: 'ltx',
        operation: decoded.operation,
        responseType: 'video',
        message: this.extractText(payload) || 'Still processing…',
        predictionId: taskRef,
        predictionStatus: 'processing',
        metadata: {
          provider: 'ltx',
          operation: decoded.operation,
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
          raw: payload,
        },
      };
    }

    // Every candidate status URL responded non-OK with a deterministic
    // auth/billing rejection — the provider key is invalid or out of funds. This
    // is terminal: reporting 'processing' here is exactly what stranded the clip
    // on a 0/5 spinner. Surface a clean 'failed' so the film union flips and the
    // client salvages/halts immediately instead of waiting out the poll window.
    if (authBillingRejected) {
      return {
        success: false,
        provider: 'ltx',
        operation: decoded.operation,
        responseType: 'video',
        message: 'LTX rejected the request (authentication or insufficient provider funds).',
        predictionId: taskRef,
        predictionStatus: 'failed',
        metadata: {
          provider: 'ltx',
          operation: decoded.operation,
          sessionId: decoded.sessionId,
          taskRef,
          providerTaskId: decoded.providerTaskId,
          promptHash: decoded.promptHash,
          providerRejection: 'auth-or-billing',
        },
      };
    }

    return {
      success: true,
      provider: 'ltx',
      operation: decoded.operation,
      responseType: 'video',
      message: 'Still processing…',
      predictionId: taskRef,
      predictionStatus: 'processing',
      metadata: {
        provider: 'ltx',
        operation: decoded.operation,
        sessionId: decoded.sessionId,
        taskRef,
        providerTaskId: decoded.providerTaskId,
        promptHash: decoded.promptHash,
      },
    };
  }

  private async pollLegacyReplicate(predictionId: string, sessionId: string): Promise<ServiceManagerResponse> {
    const prediction = await pollPrediction(predictionId);

    if (prediction.status === 'succeeded') {
      const normalized = normalizeOutput(
        'image',
        'Replicate',
        'image',
        prediction.id,
        prediction.status,
        prediction.output,
        prediction.error,
        prediction.metrics as unknown as Record<string, unknown> | undefined,
      );

      return {
        success: normalized.success,
        provider: 'replicate',
        operation: 'text-to-image',
        responseType: normalized.url ? 'image' : 'text',
        message: normalized.text || 'Generation completed.',
        assetUrl: normalized.url,
        assetType: normalized.url ? 'image' : undefined,
        predictionId,
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'replicate',
          operation: 'text-to-image',
          sessionId,
          providerTaskId: prediction.id,
          promptHash: this.hashPrompt(predictionId),
          legacyPredictionId: predictionId,
        },
      };
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return {
        success: false,
        provider: 'replicate',
        operation: 'text-to-image',
        responseType: 'text',
        message: prediction.error || 'Generation failed.',
        predictionId,
        predictionStatus: prediction.status,
        metadata: {
          provider: 'replicate',
          operation: 'text-to-image',
          sessionId,
          providerTaskId: prediction.id,
          promptHash: this.hashPrompt(predictionId),
          legacyPredictionId: predictionId,
        },
      };
    }

    return {
      success: true,
      provider: 'replicate',
      operation: 'text-to-image',
      responseType: 'text',
      message: 'Still processing…',
      predictionId,
      predictionStatus: prediction.status,
      metadata: {
        provider: 'replicate',
        operation: 'text-to-image',
        sessionId,
        providerTaskId: prediction.id,
        promptHash: this.hashPrompt(predictionId),
        legacyPredictionId: predictionId,
      },
    };
  }

  private resolveOperation(request: ServiceManagerRequest): DeterministicOperation {
    if (request.intent === 'video_generation') {
      return 'video-avatar';
    }

    if (request.intent === 'avatar_generation') {
      const preferred = this.getOption(request.selectedOptions || {}, ['provider', 'video_provider', 'providerMode']);
      if (preferred && ['replicate', 'nanobanana'].includes(preferred.toLowerCase())) {
        return 'text-to-image';
      }
      return 'video-avatar';
    }

    return 'text-to-image';
  }

  private resolveImageProvider(selectedOptions?: Record<string, string>): 'nanobanana' | 'replicate' {
    const preferred = this.getOption(selectedOptions || {}, ['provider', 'image_provider', 'providerMode'])?.toLowerCase();
    if (preferred === 'replicate') return 'replicate';
    if (preferred === 'nanobanana') return 'nanobanana';
    // P90 — the BASE image now defaults to FLUX 1.1 Pro (Replicate) for elite photoreal quality; the prior
    // NanoBanana default was a cost choice. Ops can revert per-deploy with IMAGE_PRIMARY_PROVIDER=nanobanana
    // (no code push). runTextToImage keeps NanoBanana as the fail-open, so a FLUX outage still yields a preview.
    return (process.env.IMAGE_PRIMARY_PROVIDER || '').trim().toLowerCase() === 'nanobanana' ? 'nanobanana' : 'replicate';
  }

  private resolveVideoProvider(request: ServiceManagerRequest): 'ltx' | 'heygen' {
    const preferred = this.getOption(request.selectedOptions || {}, ['provider', 'video_provider', 'providerMode']);
    if (preferred?.toLowerCase() === 'heygen') {
      return 'heygen';
    }

    if (preferred?.toLowerCase() === 'ltx') {
      return 'ltx';
    }

    if (request.intent === 'avatar_generation' || request.serviceContext === 'avatar') {
      return 'heygen';
    }

    return 'ltx';
  }

  private isHighQualityRequest(options: Record<string, string>): boolean {
    const endpoint = this.getOption(options, ['nanobanana_endpoint', 'nanobananaEndpoint', 'endpoint']);
    const quality = this.getOption(options, ['quality', 'img-quality', 'imgQuality']);
    const resolution = this.getOption(options, ['resolution', 'size']);

    return [endpoint, quality, resolution]
      .filter((item): item is string => Boolean(item))
      .some((item) => /pro-4k|4k|ultra|high|hd/i.test(item));
  }

  private normalizeAspectRatio(value?: string): '1:1' | '4:5' | '16:9' | '9:16' | '4:3' | '3:4' {
    if (!value) {
      return '1:1';
    }

    const normalized = value.trim().toLowerCase();
    const fromMap: Record<string, '1:1' | '4:5' | '16:9' | '9:16' | '4:3' | '3:4'> = {
      '1:1': '1:1',
      '4:5': '4:5',
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4',
      '1024x1024': '1:1',
      '1024x1792': '9:16',
      '1792x1024': '16:9',
      '1920x1080': '16:9',
      '1080x1920': '9:16',
      '1280x720': '16:9',
      '720x1280': '9:16',
    };

    return fromMap[normalized] || '1:1';
  }

  private mapLtxResolution(
    value: string | undefined,
    aspectRatio: string,
    model: 'ltx-2-3-fast' | 'ltx-2-3-pro' = 'ltx-2-3-fast',
  ): '1920x1080' | '1080x1920' | '2560x1440' | '3840x2160' {
    const supported = LTX_SUPPORTED_RESOLUTIONS[model];
    const normalized = (value || '').trim().toLowerCase().replace(/\s+/g, '');

    // Honor an explicit, supported resolution if the caller provided one.
    if (supported.includes(normalized)) {
      return normalized as '1920x1080' | '1080x1920' | '2560x1440' | '3840x2160';
    }

    // Otherwise derive from aspect ratio. Vertical → portrait HD, everything
    // else → landscape HD. (Square/4:3 have no native LTX size, so we land on
    // the safe 16:9 default the API always accepts.)
    if (aspectRatio === '9:16' || aspectRatio === '3:4') {
      return '1080x1920';
    }
    return '1920x1080';
  }

  private clampLtxFps(value: number): 24 | 25 | 30 {
    if (!Number.isFinite(value)) return 24;
    // Snap to the nearest LTX-accepted frame rate (24 / 25 / 30).
    let nearest: 24 | 25 | 30 = 24;
    let bestDelta = Infinity;
    for (const candidate of LTX_ALLOWED_FPS) {
      const delta = Math.abs(candidate - value);
      if (delta < bestDelta) {
        bestDelta = delta;
        nearest = candidate;
      }
    }
    return nearest;
  }

  private normalizeHeygenAspect(value?: string): '16:9' | '9:16' | '1:1' {
    const normalized = this.normalizeAspectRatio(value);
    if (normalized === '9:16') return '9:16';
    if (normalized === '1:1') return '1:1';
    return '16:9';
  }

  private normalizeVoiceGender(value?: string): 'female' | 'male' {
    return String(value || '').toLowerCase() === 'male' ? 'male' : 'female';
  }

  // PHASE 39 §2 — avatar_style is no longer hardcoded. The user's selected
  // framing flows through (normal / circle / closeUp), so the engine honors the
  // active prompt's face/body intent instead of a locked default.
  private normalizeHeygenAvatarStyle(value?: string): 'normal' | 'circle' | 'closeUp' {
    const v = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
    if (v === 'circle') return 'circle';
    if (v === 'closeup' || v === 'close') return 'closeUp';
    return 'normal';
  }

  private mapHeygenDimension(aspectRatio: '16:9' | '9:16' | '1:1'): { width: number; height: number } {
    if (aspectRatio === '9:16') {
      return { width: 720, height: 1280 };
    }

    if (aspectRatio === '1:1') {
      return { width: 720, height: 720 };
    }

    return { width: 1280, height: 720 };
  }

  private mapReplicateQuality(value?: string): 'standard' | 'high' | 'ultra' {
    if (!value) return 'high';
    if (/ultra|4k/i.test(value)) return 'ultra';
    if (/high|hd|pro/i.test(value)) return 'high';
    return 'standard';
  }

  private toNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private getOption(options: Record<string, string>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = options[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return undefined;
  }

  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
  }

  private encodeTaskRef(task: Omit<EncodedTaskRef, 'v'>): string {
    const payload: EncodedTaskRef = {
      v: TASK_REF_VERSION,
      ...task,
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private decodeTaskRef(taskRef: string): EncodedTaskRef | null {
    try {
      const raw = Buffer.from(taskRef, 'base64url').toString('utf8');
      const parsed = JSON.parse(raw) as Partial<EncodedTaskRef>;

      if (
        parsed.v !== TASK_REF_VERSION
        || (parsed.provider !== 'replicate' && parsed.provider !== 'ltx' && parsed.provider !== 'heygen' && parsed.provider !== 'video-cascade' && parsed.provider !== 'runway')
        || typeof parsed.providerTaskId !== 'string'
        || typeof parsed.sessionId !== 'string'
        || typeof parsed.serviceContext !== 'string'
        || typeof parsed.intent !== 'string'
        || (parsed.operation !== 'text-to-image' && parsed.operation !== 'video-avatar')
        || (parsed.responseType !== 'image' && parsed.responseType !== 'video')
        || typeof parsed.promptHash !== 'string'
        || typeof parsed.createdAt !== 'number'
      ) {
        return null;
      }

      return parsed as EncodedTaskRef;
    } catch {
      return null;
    }
  }

  private extractText(payload: unknown): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (typeof payload === 'string') {
      return payload.trim() ? payload : undefined;
    }

    if (Array.isArray(payload)) {
      const chunks = payload.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      return chunks.length > 0 ? chunks.join('\n') : undefined;
    }

    if (typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const directKeys = ['message', 'msg', 'text', 'detail', 'error', 'error_message'];
    for (const key of directKeys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    const nestedKeys = ['data', 'result', 'response'];
    for (const key of nestedKeys) {
      const nested = this.extractText(record[key]);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private extractUrl(payload: unknown): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (typeof payload === 'string') {
      if (/^https?:\/\//i.test(payload) || /^data:/i.test(payload)) {
        return payload;
      }
      return undefined;
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const maybe = this.extractUrl(item);
        if (maybe) {
          return maybe;
        }
      }
      return undefined;
    }

    if (typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    // Direct URL-bearing fields. Broadened beyond the original
    // url/video_url/output_url/result_url/asset_url set because a COMPLETED LTX-2
    // job that returns its mp4 under any other documented field name
    // (output, download_url, signed_url, …) would otherwise read as "no url" and
    // the poll would report `processing` forever — the exact 0-of-5 stall where
    // every clip renders but never flips to succeeded.
    const keys = [
      'url', 'video_url', 'videoUrl', 'output_url', 'outputUrl',
      'result_url', 'resultUrl', 'asset_url', 'assetUrl',
      'download_url', 'downloadUrl', 'signed_url', 'signedUrl',
      'file_url', 'fileUrl', 'mp4', 'mp4_url', 'src', 'href', 'uri',
    ];
    for (const key of keys) {
      const maybe = this.extractUrl(record[key]);
      if (maybe) {
        return maybe;
      }
    }

    // Containers that commonly wrap the finished asset. Recursing into these
    // (in addition to the legacy data/result/response) lets the extractor reach
    // a URL nested under output/outputs/assets/generations/video[s]/file[s].
    const nestedKeys = [
      'data', 'result', 'response',
      'output', 'outputs', 'assets', 'asset',
      'generations', 'generation', 'video', 'videos', 'files', 'file', 'media',
    ];
    for (const key of nestedKeys) {
      const nested = this.extractUrl(record[key]);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private extractTaskId(payload: unknown): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (typeof payload === 'string') {
      return payload.trim() || undefined;
    }

    if (typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const keys = ['taskId', 'task_id', 'video_id', 'generation_id', 'id'];
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    const nestedKeys = ['data', 'result', 'response'];
    for (const key of nestedKeys) {
      const nested = this.extractTaskId(record[key]);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private extractStatus(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const direct = record.status;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim().toLowerCase();
    }

    const nestedKeys = ['data', 'result', 'response'];
    for (const key of nestedKeys) {
      const nested = this.extractStatus(record[key]);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private async getHeygenVoiceId(apiKey: string, gender: 'female' | 'male', language: string): Promise<string> {
    try {
      const res = await fetch(`${HEYGEN_BASE_URL}/v2/voices`, {
        headers: { 'X-Api-Key': apiKey },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error('voices endpoint failed');
      }

      const payload = await res.json() as {
        data?: {
          voices?: Array<{ voice_id: string; language?: string; gender?: string }>;
        };
      };

      const voices = payload.data?.voices || [];
      const langCode = (language === 'ka' ? 'en' : language).toLowerCase();

      const exact = voices.find((voice) => (
        voice.gender?.toLowerCase() === gender
        && voice.language?.toLowerCase().startsWith(langCode)
      ));

      if (exact?.voice_id) {
        return exact.voice_id;
      }

      const byGender = voices.find((voice) => voice.gender?.toLowerCase() === gender);
      if (byGender?.voice_id) {
        return byGender.voice_id;
      }
    } catch {
      // Fallback to static IDs below.
    }

    const genderMap = HEYGEN_VOICE_MAP[gender];
    return genderMap[language] || genderMap.en || '1bd001e7e50f421d891986aad5158bc8';
  }

  private async getHeygenFirstAvatar(apiKey: string): Promise<string> {
    const res = await fetch(`${HEYGEN_BASE_URL}/v2/avatars`, {
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HeyGen avatars list failed (${res.status}): ${err || 'unknown error'}`);
    }

    const payload = await res.json() as {
      data?: {
        avatars?: Array<{ avatar_id: string }>;
      };
    };

    const avatarId = payload.data?.avatars?.[0]?.avatar_id;
    if (!avatarId) {
      throw new Error('No HeyGen avatar is available in this account');
    }

    return avatarId;
  }
}
