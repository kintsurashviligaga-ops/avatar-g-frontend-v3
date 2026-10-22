import { createHash } from 'crypto';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { budgetRefusalMessage } from '@/lib/services/billing/budgetMessage';
import { generateImagenImages, hasGeminiImagenProvider, geminiImagenModel } from '@/lib/ai/geminiImagen';
import type { ServiceType as BillingServiceType } from '@/lib/services/billing/costModel';
import { z } from 'zod';

import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { getNanoBananaCreditCost, resolveNanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { generateGeminiImage } from '@/lib/ai/geminiImage';
import { googleTransportBlocker } from '@/lib/ai/google/transport';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { createPrediction, pollPrediction } from '@/lib/replicate/client';
import { resolveModel } from '@/lib/replicate/models';
import { buildModelInput, validateInput } from '@/lib/replicate/schemas';
import { normalizeOutput } from '@/lib/replicate/normalizer';
import type { IntentCategory } from '@/lib/chat/intentDetector';
import { resolveLtxApiKey } from '@/lib/chat/ltxKey';
import { pollVideoProvider } from '@/lib/video/videoProviderCascade';
import { expandCinematicPrompt } from '@/lib/video/cinematicPrompt';
import { llmText } from '@/lib/ai/llmText';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { runwayModel, pollRunwayTask } from '@/lib/ai/runway';
import { createVeoClip, pollVeoClip, transportOf, veoTransport } from '@/lib/veo/engine';
import { hostGcsVideo } from '@/lib/veo/deliver';
import { veoSafetyCategory } from '@/lib/veo/safetyCodes';
import { nativeCameraControl } from '@/lib/veo/cinematography';
import { costPerSecondUsd, resolutionFor, resolveModel as resolveVeoModel } from '@/lib/veo/capabilities';
import { STUDIO_DEFAULT_VEO_TIER } from '@/lib/credits/videoPricing';
import { GOOGLE_ONLY_CODE, googleOnlyMessage, isMediaGoogleOnly } from '@/lib/providers/mediaPolicy';
import type { CameraMove, OutputFormat, VeoFailureReason, VeoMedia, VeoTier, VeoTransport, VeoVideo } from '@/lib/veo/types';
import { createSignedAssetUrl, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { withColorScience } from '@/lib/video/colorScience';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';

export type DeterministicProvider = 'nanobanana' | 'replicate' | 'ltx' | 'heygen' | 'xai';
export type DeterministicOperation = 'text-to-image' | 'video-avatar';

// PHASE 24 — 'runway' is an async provider tier (Runway Gen-3 Alpha primary i2v). It surfaces on the
// wire as provider:'replicate' (DeterministicProvider has no 'runway'); the real engine lives in
// metadata.videoProvider — same pattern as 'video-cascade'.
type AsyncProvider = 'replicate' | 'ltx' | 'heygen' | 'video-cascade' | 'runway' | 'gemini-veo';
type ResponseType = 'text' | 'image' | 'video' | 'audio' | 'analysis' | 'action_suggestions';

const LTX_BASE_URL = 'https://api.ltx.video';
const HEYGEN_BASE_URL = 'https://api.heygen.com';
const TASK_REF_VERSION = 1;

// Veo refusals already written to the log, per warm instance. Bounded: past the cap it starts over, which at worst
// repeats a line.
const loggedVeoDeclines = new Set<string>();
function firstVeoDecline(key: string): boolean {
  if (loggedVeoDeclines.has(key)) return false;
  if (loggedVeoDeclines.size >= 500) loggedVeoDeclines.clear();
  loggedVeoDeclines.add(key);
  return true;
}

// PHASE 51 §2 — Re-hosted LTX render URLs live for 7 days. A sync LTX call
// returns the MP4 *binary*; turning that into a multi-MB `data:` URL is the
// known iOS / standalone-PWA infinite-spinner failure (the <video> element
// never fires loadedmetadata for a giant inline source). We re-host the bytes
// to our CSP-allowed *.supabase.co storage and hand the browser a real https
// URL it can stream natively — with a 7-day signed lifetime so the asset
// survives well past the render session.
const LTX_REHOST_TTL_SEC = 7 * 24 * 60 * 60;

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

/** One Veo submit, as the render path sees it: a task-ref response, or the engine's reason for the miss. */
type VeoSubmit =
  | { ok: true; response: ServiceManagerResponse }
  | { ok: false; reason: VeoFailureReason; retryable: boolean };

/**
 * What the user reads when a Google-only clip could not be submitted. Deliberately free of provider detail (the
 * engine logs that): a billing or auth fault is OUR outage, never something the user can fix by retrying.
 */
const VEO_FAILURE_MESSAGE: Record<VeoFailureReason, string> = {
  not_configured: 'Video rendering is not available right now. Please try again later.',
  invalid_request: 'This scene could not be rendered with these settings.',
  auth: 'Video rendering is temporarily unavailable. Please try again later.',
  quota: 'Video rendering is temporarily unavailable. Please try again later.',
  rate_limited: 'The video engine is busy. Please try again in a minute.',
  unavailable: 'The video engine is busy. Please try again in a minute.',
  ambiguous: 'The video engine did not confirm this scene in time. It was not re-sent, so you are not charged twice.',
  safety: "This scene was declined under Google's safety rules. Rephrase it and render again.",
};

/** "Veo on Vertex AI (veo-3.1-generate-001)" / "Gemini Veo (…)" — rides into metadata.film.clips[].note. */
function veoEngineLabel(transport: VeoTransport | null, model: string | null): string {
  const name = transport === 'vertex' ? 'Veo on Vertex AI' : 'Gemini Veo';
  return model ? `${name} (${model})` : name;
}

export class ServiceManager {
  /**
   * Master Task §2.1.1 — EVERY provider call goes through the budget guard, and this is the chokepoint for
   * image, video and avatar (all three resolve here). Guarding at the entry point rather than at each of the
   * ~8 provider methods below is deliberate: a new engine added to the cascade tomorrow is guarded by
   * construction instead of by remembering.
   *
   * A refusal surfaces as a normal failed response, not a throw — the callers here are render pipelines that
   * already know how to report "this leg didn't run", and a raised exception would read to them as a crash
   * and trigger the retry/failover machinery against a budget that will refuse the retry too.
   */
  async execute(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const operation = this.resolveOperation(request);
    const service: BillingServiceType = operation === 'text-to-image' ? 'image'
      : request.intent === 'avatar_generation' ? 'avatar'
      : 'video';
    // A clip renders on Veo and nothing else, so the guard can price it exactly (tier × resolution ×
    // audio) instead of the flat video line — which under-reserves a Standard clip ~3×.
    // Any request that will RENDER on Veo is priced as a Veo clip — including an "avatar" request whose provider
    // option routes it past HeyGen (it would otherwise be booked at the $0.05 avatar line for a $0.40/s render).
    const rendersOnVeo = operation !== 'text-to-image' && this.resolveVideoProvider(request) !== 'heygen';
    const veoPrice = rendersOnVeo ? this.veoGuardPrice(request) : null;
    // Seconds for video (the guard prices video per second), one artefact otherwise. ⚠️ NEVER the raw option: the
    // duration is caller-supplied, and `duration: '0.001'` booked a whole clip at a fraction of a cent — the budget
    // guard is the last line against a drain, so it counts the seconds the engine will actually render.
    const units = veoPrice ? veoPrice.seconds : service === 'video' ? this.guardVideoSeconds(request) : 1;

    try {
      return await guardedCall(
        {
          service: veoPrice ? 'video' : service,
          model: veoPrice?.model ?? (request.videoModel || (service === 'image' ? 'imagen-4' : 'veo-3.1')),
          units,
          promptSummary: request.userPrompt,
          ...(veoPrice
            ? {
                unitCostUsd: veoPrice.perSecondUsd,
                // A definitive Veo refusal created no job and bills nothing. An `ambiguous` submit MAY have created a
                // billed job, so it keeps the estimate — the budget errs toward counting money that may be spent.
                actualCost: (result: unknown) => {
                  const r = result as ServiceManagerResponse | null;
                  const f = r?.metadata?.veoFailure as { reason?: string } | undefined;
                  return r?.success === false && f && f.reason !== 'ambiguous' ? 0 : undefined;
                },
              }
            : {}),
        },
        async () => (operation === 'text-to-image' ? this.runTextToImage(request) : this.runVideoAvatar(request)),
      );
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        // eslint-disable-next-line no-console
        console.warn(`[ServiceManager] ${service} refused by the budget guard (${err.reason})`);
        return {
          success: false,
          provider: 'replicate',
          operation,
          responseType: operation === 'text-to-image' ? 'image' : 'video',
          message: budgetRefusalMessage(request.locale, err.reason),
          predictionStatus: 'failed',
          metadata: {
            provider: 'replicate' as const,
            operation,
            sessionId: request.sessionId,
            promptHash: this.hashPrompt(request.userPrompt),
            budgetExceeded: true,
            budgetReason: err.reason,
          },
        };
      }
      throw err;
    }
  }

  async poll(taskRefOrPredictionId: string, sessionId?: string): Promise<ServiceManagerResponse> {
    const decoded = this.decodeTaskRef(taskRefOrPredictionId);

    if (!decoded) {
      return this.pollLegacyReplicate(taskRefOrPredictionId, sessionId || 'legacy');
    }

    if (!sessionId || decoded.sessionId !== sessionId) {
      // 'video-cascade' / 'runway' / 'gemini-veo' are async tiers with no DeterministicProvider surface → 'replicate'.
      const surfaceProvider: DeterministicProvider =
        decoded.provider === 'video-cascade' || decoded.provider === 'runway' || decoded.provider === 'gemini-veo' ? 'replicate' : decoded.provider;
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

    if (decoded.provider === 'gemini-veo') {
      return this.pollVeoTaskRef(decoded, taskRefOrPredictionId);
    }

    return this.pollLtxTask(decoded, taskRefOrPredictionId);
  }

  private async runTextToImage(rawRequest: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    // ⚠️ ONE TRANSLATION FOR ALL FOUR LEGS. Imagen, NanoBanana, Grok and FLUX each read
    // `request.userPrompt` verbatim, and every one of them is trained overwhelmingly on English — so a
    // Georgian brief was noise to all four and each fell back to its priors, returning a competent
    // image unrelated to the request. Rebinding the request here fixes the whole cascade at its single
    // entry point rather than at four call sites (and at the fifth engine added tomorrow). Only the
    // DESCRIPTION passes through — this path carries no lyrics, dialogue or on-screen copy. Fail-open:
    // any error/missing key/timeout returns the ORIGINAL text, so this can never break generation.
    const { promptToEnglish } = await import('@/lib/ai/promptToEnglish');
    const request: ServiceManagerRequest = { ...rawRequest, userPrompt: await promptToEnglish(rawRequest.userPrompt, 'image') };

    // ⚠️ NO SILENT FALLBACK TO ANOTHER OUTSIDE PROVIDER (the owner, 2026-10-09: "აკრძალული პროვაიდერის ჩუმი fallback არ
    // დაუშვა"). The cascade was Imagen → FLUX → NanoBanana → FLUX → Grok: a miss of one outside engine started a render on
    // another one nobody chose. A job now runs ONE outside engine at most, and a miss may move only to Google's own image
    // model (lib/ai/geminiImage — the model the NanoBanana reseller sold, called directly):
    //   · Imagen (opt-in, GEMINI_IMAGEN_ENABLED) → Gemini image → an honest failure;
    //   · otherwise the configured engine (FLUX, or NanoBanana when picked / IMAGE_PRIMARY_PROVIDER=nanobanana)
    //     → Gemini image → that engine's honest failure.
    //
    // MEDIA_GOOGLE_ONLY (lib/providers/mediaPolicy, opt-in, default off): no outside engine runs at all, whatever was
    // configured or picked: Imagen (prompt-only, when enabled) → Gemini image → an honest failure.
    if (isMediaGoogleOnly()) {
      if (hasGeminiImagenProvider() && !request.imageUrl) {
        const imagen = await this.tryImagenImage(request);
        if (imagen) return imagen;
      }
      return (await this.tryGeminiImage(request, 'google-only')) ?? this.imageFailure(request, 'nanobanana', 'Image generation failed. Please try again.');
    }
    if (this.imagenApplies(request)) {
      const imagen = await this.tryImagenImage(request);
      if (imagen) return imagen;
      return (await this.tryGeminiImage(request, 'imagen')) ?? this.imageFailure(request, 'nanobanana', 'Image generation failed. Please try again.');
    }

    const provider = this.resolveImageProvider(request.selectedOptions);
    let primary: ServiceManagerResponse;
    try {
      // createPrediction is `Prefer: respond-async`, so FLUX's NORMAL success carries a `predictionId` (the client polls
      // it) and no `assetUrl`: an in-flight prediction counts as landed.
      primary = provider === 'replicate' ? await this.runReplicateImage(request) : await this.runNanoBananaImage(request);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[image] ${provider} threw:`, err instanceof Error ? err.message : err);
      primary = this.imageFailure(request, provider, 'Image generation failed. Please try again.');
    }
    if (primary.success && (primary.assetUrl || primary.predictionId) && primary.predictionStatus !== 'failed') return primary;
    return (await this.tryGeminiImage(request, provider)) ?? primary;
  }

  /** A failed image leg in the shape every caller already reports ("this leg didn't run"). */
  private imageFailure(request: ServiceManagerRequest, provider: 'nanobanana' | 'replicate', message: string): ServiceManagerResponse {
    return {
      success: false,
      provider,
      operation: 'text-to-image',
      responseType: 'text',
      message,
      predictionStatus: 'failed',
      metadata: {
        provider,
        operation: 'text-to-image',
        sessionId: request.sessionId,
        outputType: 'text',
        promptHash: this.hashPrompt(request.userPrompt),
        confidence: request.confidence,
        error: message,
      },
    };
  }

  /**
   * GOOGLE'S IMAGE MODEL, called directly — the only engine an image miss may move to. A source photo goes in as a
   * reference and MUST load (requireReferences), so an edit is never quietly answered with an unrelated new image.
   * Returns null on any miss (no Google transport, refusal, storage miss). NEVER throws.
   */
  private async tryGeminiImage(request: ServiceManagerRequest, after: string): Promise<ServiceManagerResponse | null> {
    if (googleTransportBlocker(resolveGeminiKey())) return null;
    const aspect = this.normalizeAspectRatio(this.getOption(request.selectedOptions || {}, ['aspect', 'aspectRatio', 'ratio', 'img-size'])) || undefined;
    try {
      const img = await generateGeminiImage({
        prompt: request.userPrompt,
        referenceImages: request.imageUrl ? [request.imageUrl] : [],
        requireReferences: true,
        ...(aspect ? { aspectRatio: aspect } : {}),
      });
      if (!img) return null;
      const ext = img.mimeType.includes('png') ? 'png' : img.mimeType.includes('webp') ? 'webp' : 'jpg';
      const url = await uploadAndSign('renders', `gemini-image/${request.sessionId}/${Date.now()}.${ext}`, img.base64, img.mimeType, 604_800).catch(() => null);
      if (!url) return null;
      return {
        success: true,
        provider: 'nanobanana', // the surface provider union has no 'gemini' member; the real engine is in metadata
        operation: 'text-to-image',
        responseType: 'image',
        message: 'Image generation completed successfully.',
        assetUrl: url,
        assetType: 'image',
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'nanobanana' as const,
          imageProvider: 'gemini-image',
          model: img.model,
          imageFallback: `${after}->gemini-image`,
          operation: 'text-to-image',
          outputType: 'image',
          sessionId: request.sessionId,
          promptHash: this.hashPrompt(request.userPrompt),
          confidence: request.confidence,
        },
      };
    } catch {
      return null;
    }
  }

  /** Imagen runs only for a prompt-only request with no outside engine named (see the EDIT GUARD below). */
  private imagenApplies(request: ServiceManagerRequest): boolean {
    if (!hasGeminiImagenProvider()) return false;
    // ⚠️ EDIT GUARD — the reason an attached photo used to be thrown away.
    //
    // Imagen's :predict surface is PROMPT-ONLY; there is nowhere to put a source image. Imagen runs FIRST
    // for every text-to-image, so "make this a watercolour" WITH a photo attached silently discarded the
    // photo, generated an unrelated image from the words alone, returned it as
    // predictionStatus:'succeeded' — and charged for it. No error, and nothing anywhere said the reference
    // had been dropped. The sibling surface (/api/nanobanana/image) skips its own prompt-only legs for
    // exactly this reason; this leg is the one that never got the guard.
    //
    // A reference request goes to the configured engine, which accepts one.
    if (request.imageUrl) return false;
    // An explicit engine pick opts OUT of Imagen, mirroring the Kling/Hailuo opt-out on the video side.
    const picked = (this.getOption(request.selectedOptions || {}, ['imageModel', 'image_model', 'provider']) || '').toLowerCase();
    return !(picked === 'nanobanana' || picked === 'replicate' || picked === 'flux');
  }

  /**
   * IMAGEN 4 (§1.6.2 / §3.2.2). Imagen returns base64 bytes inline — no operation to poll — so the image is
   * hosted here and the caller receives a normal signed https URL, identical in shape to the other engines.
   * Returns null on ANY miss so `runTextToImage` moves on to Gemini image (Google). NEVER throws. Callers check
   * imagenApplies first.
   */
  private async tryImagenImage(request: ServiceManagerRequest): Promise<ServiceManagerResponse | null> {
    const opts = request.selectedOptions || {};
    const count = Number(this.getOption(opts, ['numberOfImages', 'imageCount', 'n'])) || 1;
    const negativePrompt = this.getOption(opts, ['negativePrompt', 'negative_prompt', 'negative']) || undefined;
    const aspect = this.normalizeAspectRatio(this.getOption(opts, ['aspect', 'aspectRatio', 'ratio'])) || undefined;

    try {
      const images = await generateImagenImages({
        prompt: request.userPrompt,
        ...(aspect ? { aspectRatio: aspect } : {}),
        numberOfImages: count,
        ...(negativePrompt ? { negativePrompt } : {}),
      });
      if (!images?.length) return null;

      const stamp = Date.now();
      const hosted = await Promise.all(
        images.map((img, i) => {
          const ext = img.mimeType.includes('jpeg') || img.mimeType.includes('jpg') ? 'jpg' : 'png';
          return uploadBufferAndSign('renders', `imagen/${request.sessionId}/${stamp}-${i}.${ext}`, img.buffer, img.mimeType, 604_800)
            .catch(() => null);
        }),
      );
      const urls = hosted.filter((u): u is string => typeof u === 'string' && !!u);
      // Generated but undeliverable (storage miss) → a miss rather than a broken success.
      if (!urls.length) return null;

      const model = geminiImagenModel();
      // eslint-disable-next-line no-console
      console.log(`[imagen] ${model} produced ${urls.length}/${images.length} hosted image(s)`);
      return {
        success: true,
        provider: 'nanobanana', // surface provider union has no 'gemini' member; the real engine is in metadata
        operation: 'text-to-image',
        responseType: 'image',
        message: 'Image generation completed successfully.',
        assetUrl: urls[0] as string,
        assetType: 'image',
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'nanobanana' as const,
          imageProvider: 'gemini-imagen',
          model,
          operation: 'text-to-image',
          outputType: 'image',
          sessionId: request.sessionId,
          promptHash: this.hashPrompt(request.userPrompt),
          confidence: request.confidence,
          images: urls,
        },
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[imagen] threw → trying Gemini image:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  private async runVideoAvatar(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const provider = this.resolveVideoProvider(request);
    if (provider === 'heygen') {
      // MEDIA_GOOGLE_ONLY: the presenter has no Google engine yet, so it is refused before HeyGen is called (the chat
      // hold is given back on any failed answer). The branch ran before the video switch below, so it was never covered.
      if (isMediaGoogleOnly()) {
        const message = googleOnlyMessage(request.locale);
        return {
          success: false,
          provider: 'heygen',
          operation: 'video-avatar',
          responseType: 'text',
          message,
          predictionStatus: 'failed',
          metadata: {
            provider: 'heygen', operation: 'video-avatar', sessionId: request.sessionId, outputType: 'text',
            promptHash: this.hashPrompt(request.userPrompt), confidence: request.confidence, code: GOOGLE_ONLY_CODE, error: message,
          },
        };
      }
      return this.runHeygenAvatarVideo(request);
    }

    // ⚠️ ENGLISH FOR THE ENGINE. Veo is trained overwhelmingly on English, and the Veo leg below reads
    // `request.userPrompt`. expandCinematicPrompt does not rescue this — its deterministic fallback merely
    // APPENDS an English suffix to the untouched base. So a Georgian chat brief reached the engine as noise,
    // the model fell back to its priors, and the clip came back competent and unrelated. On video that failure
    // is invisible: it plays fine, it just is not the video that was asked for.
    //
    // ⚠️ TWO EXEMPTIONS, BOTH BECAUSE THE PROMPT CARRIES WORDS THAT MUST BE REPRODUCED VERBATIM:
    //   · `spokenLine` is set by buildFilmClipRequest on exactly the film clips whose prompt EMBEDS the
    //     character's line for Veo to speak aloud. Translating that prompt would swap the user's own words for
    //     a translation of them — and filmComposite has already dropped the ElevenLabs dialogue leg on the
    //     promise that Veo says them verbatim, so nobody would ever speak them. Those clips already had their
    //     VISUAL text translated upstream in filmComposite, BEFORE the line was spliced in, so this is not a
    //     gap: it is the same fix applied at the only point where the two can still be told apart.
    //   · an avatar request, whose prompt is a SCRIPT to be spoken. It normally leaves via the heygen branch
    //     above; this covers the explicit `provider=ltx` override, which would otherwise route a to-be-spoken
    //     script through here (it renders on Veo too).
    //
    // FAIL-OPEN, and free for Latin-script text (promptToEnglish returns immediately, no network call).
    const carriesVerbatimSpeech =
      !!this.getOption(request.selectedOptions || {}, ['spokenLine'])
      || request.intent === 'avatar_generation'
      || request.serviceContext === 'avatar';
    const videoRequest: ServiceManagerRequest = carriesVerbatimSpeech
      ? request
      : { ...request, userPrompt: await promptToEnglish(request.userPrompt, 'video') };

    // GOOGLE-ONLY, always (MASTER TASK v3.1 · lib/veo/policy · docs/VEO_ENGINE.md §3) — Veo is the ONLY engine. No
    // Runway / Kling / LTX leg, no engine down-shift, and the Cinema panel's Kling/Hailuo pick does not apply: a Veo
    // miss comes back as a failed leg carrying metadata.veoFailure, never as a clip quietly rendered by another vendor.
    return this.runVeoOnly(videoRequest);
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

  /** Seconds a non-Veo clip is booked at: the requested length, bounded to what the engines render (4–10 s). */
  private guardVideoSeconds(request: ServiceManagerRequest): number {
    const raw = Number(this.getOption(request.selectedOptions || {}, ['duration', 'durationSec', 'duration_seconds']));
    return Number.isFinite(raw) && raw > 0 ? Math.min(10, Math.max(4, Math.ceil(raw))) : 8;
  }

  /**
   * What the Veo clip for this request bills: the model it renders on, the exact $/s (tier × resolution × audio), and
   * the seconds Veo will actually render — its 4 / 6 / 8 s grid, rounded UP (never under-count), 8 s in reference mode.
   */
  private veoGuardPrice(request: ServiceManagerRequest): { model: string; perSecondUsd: number; seconds: number } {
    const opts = request.selectedOptions || {};
    // Priced as Vertex AI renders it, the only Veo transport (v3.1); with no route nothing is submitted anyway.
    const transport = veoTransport() ?? 'vertex';
    const tierRaw = this.getOption(opts, ['veoTier']);
    const tier: VeoTier = tierRaw === 'fast' || tierRaw === 'lite' || tierRaw === 'standard' ? tierRaw : STUDIO_DEFAULT_VEO_TIER;
    const model = resolveVeoModel(transport, tier);
    const raw = Number(this.getOption(opts, ['duration', 'durationSec', 'duration_seconds']));
    const asked = Number.isFinite(raw) && raw > 0 ? raw : 8;
    // Reference mode pins the clip to 8 s (→ 1080p); otherwise the clip's own length decides the resolution.
    const seconds = this.getOption(opts, ['veoReferenceMode']) === 'reference' ? 8 : asked <= 4 ? 4 : asked <= 6 ? 6 : 8;
    const audio = this.getOption(opts, ['veoGenerateAudio']) !== '0';
    return { model, perSecondUsd: costPerSecondUsd(model, resolutionFor(seconds), audio, transport), seconds };
  }

  /** The Google-only render: Veo or a reported miss. Prompt enrichment runs on Gemini only, like everything else here. */
  private async runVeoOnly(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const startImage = this.resolveClipImage(request);
    const enrichedPrompt = await expandCinematicPrompt(request.userPrompt, (o) => llmText({ ...o, googleOnly: true }), { timeoutMs: 9_000 });
    const veo = await this.submitVeoClip(request, startImage, enrichedPrompt);
    return veo.ok ? veo.response : this.veoFailureResponse(request, veo);
  }

  /** A Veo submit that did not produce a job, as a failed leg carrying the engine's reason. */
  private veoFailureResponse(request: ServiceManagerRequest, veo: Extract<VeoSubmit, { ok: false }>): ServiceManagerResponse {
    return {
      success: false, provider: 'replicate', operation: 'video-avatar', responseType: 'video',
      message: VEO_FAILURE_MESSAGE[veo.reason],
      predictionStatus: 'failed',
      metadata: {
        provider: 'replicate' as const, videoProvider: 'gemini-veo', operation: 'video-avatar', outputType: 'video',
        sessionId: request.sessionId, promptHash: this.hashPrompt(request.userPrompt),
        // filmComposite reads this to decide whether a re-POST is safe (docs/VEO_ENGINE.md §4: only a PROVABLE
        // rejection — 429 / 503 — is retried; a timeout or 5xx may already have created a billed job).
        veoFailure: { reason: veo.reason, retryable: veo.retryable },
      },
    };
  }

  /** The user's upload(s) as Veo asset references (reference mode): https or bounded data: images, at most 3. */
  private resolveReferenceImages(request: ServiceManagerRequest): string[] {
    const usable = (v: unknown): v is string =>
      typeof v === 'string' && (/^https?:\/\//i.test(v) || (/^data:image\//i.test(v) && v.length <= 2_000_000));
    const opts = request.selectedOptions || {};
    const out: string[] = [];
    const refsJson = this.getOption(opts, ['characterReferences', 'referenceImages']);
    if (refsJson) {
      try {
        const arr = JSON.parse(refsJson) as unknown;
        if (Array.isArray(arr)) for (const v of arr) if (usable(v) && !out.includes(v)) out.push(v);
      } catch {
        /* not JSON → the single reference below */
      }
    }
    const single = this.getOption(opts, ['characterReference']);
    if (out.length === 0 && usable(single)) out.push(single);
    return out.slice(0, 3);
  }

  /**
   * Submit ONE Veo clip through lib/veo/engine (Vertex AI once configured, else the Gemini API) and wrap the
   * operation in a 'gemini-veo' task-ref — the engine string stays 'gemini-veo' on both transports because the
   * double-voice guard, the task-ref allowlist and the engine badge all key on it. The operation name alone says
   * which transport polls it (engine.transportOf), so a transport switch mid-render cannot strand a clip.
   *
   * The studio's Veo plan arrives as veo* options (buildFilmClipRequest); a caller without them (chat video,
   * a pre-plan film token) renders with the engine defaults exactly as before. Submits AT MOST ONCE and never
   * throws: a miss is returned with the engine's reason so the caller decides (fall through, or report it).
   */
  private async submitVeoClip(request: ServiceManagerRequest, startImage: string | undefined, prompt: string): Promise<VeoSubmit> {
    const opts = request.selectedOptions || {};
    const flag = (key: string): boolean | undefined => {
      const v = this.getOption(opts, [key]);
      return v === '1' ? true : v === '0' ? false : undefined;
    };
    const tierRaw = this.getOption(opts, ['veoTier']);
    // No tier asked → the STUDIO default (Fast, the price anchor), not the engine's Standard — see STUDIO_DEFAULT_VEO_TIER.
    const tier: VeoTier = tierRaw === 'standard' || tierRaw === 'fast' || tierRaw === 'lite' ? tierRaw : STUDIO_DEFAULT_VEO_TIER;
    // The OUTPUT format (1:1 / 4:5 render at 9:16 and are cropped by the assembler); else the clip's own aspect.
    const formatRaw = this.getOption(opts, ['veoFormat']);
    const format: OutputFormat = formatRaw === '9:16' || formatRaw === '16:9' || formatRaw === '1:1' || formatRaw === '4:5'
      ? formatRaw
      : this.toI2vAspect(this.normalizeAspectRatio(this.getOption(opts, ['aspect', 'aspectRatio', 'ratio'])) || undefined);
    // Reference mode: the uploads become Veo asset references (identity kept, composition free) instead of a
    // first frame. The engine drops a first frame that would collide with them and pins the clip to 8 s.
    const references = this.getOption(opts, ['veoReferenceMode']) === 'reference' ? this.resolveReferenceImages(request) : [];
    // Seed lock OFF → no seed at all (each scene samples freely). Absent (a caller without the plan) → as before.
    const seedRaw = flag('veoSeedLock') === false ? undefined : this.getOption(opts, ['seed', 'consistencySeed']);
    const seed = seedRaw != null ? Number.parseInt(seedRaw, 10) : NaN;
    const durRaw = Number(this.getOption(opts, ['duration', 'durationSec', 'duration_seconds']));
    const negativePrompt = this.getOption(opts, ['negativePrompt', 'negative_prompt', 'negative']);
    const move = this.getOption(opts, ['veoCameraMove']);
    const cameraControl = move ? nativeCameraControl(move as CameraMove) : undefined; // unknown move → undefined
    const ordinal = Number.parseInt(this.getOption(opts, ['sceneOrdinal']) ?? '', 10);
    const media = (url: string): VeoMedia => ({ kind: 'url', url });
    // Film frame chaining: the clip ENDS on the next scene's first frame (Veo first→last interpolation), so the
    // cut to the next clip is a match cut instead of a jump in framing, light and pose. Only with a first frame.
    const endFrame = !references.length && startImage ? this.getOption(opts, ['veoEndFrame']) : undefined;

    const result = await createVeoClip({
      request: {
        // 2000: the character-lock + continuity tail must survive — withColorScience trims from the MIDDLE.
        prompt: withColorScience(prompt || request.userPrompt, 2000),
        aspect: format,
        ...(Number.isFinite(durRaw) && durRaw > 0 ? { durationSec: durRaw } : {}),
        ...(Number.isFinite(seed) && seed >= 0 ? { seed } : {}),
        // Vertex honours it (video-only renders are cheaper); the Gemini API always renders audio.
        generateAudio: flag('veoGenerateAudio') ?? true,
        ...(flag('veoEnhancePrompt') ? { enhancePrompt: true } : {}),
        ...(negativePrompt ? { negativePrompt } : {}),
        ...(references.length ? { referenceImages: references.map(media) } : startImage ? { startImage: media(startImage), ...(endFrame ? { lastFrame: media(endFrame) } : {}) } : {}),
        // The two frames already define the move; a native camera move on top would fight the interpolation.
        ...(cameraControl && !endFrame ? { cameraControl } : {}),
      },
      ...(tier ? { tier } : {}),
      sessionId: request.sessionId,
      ordinal: Number.isFinite(ordinal) && ordinal >= 0 ? ordinal : 0,
    });
    const outcome = result.outcome;
    if (!outcome.ok) return { ok: false, reason: outcome.reason, retryable: outcome.retryable };

    const promptHash = this.hashPrompt(request.userPrompt);
    // `::<native aspect>` keeps the task ref's historical shape; the poll reads only the operation (Vertex stamps no
    // visible watermark, so nothing is cropped at that size any more).
    const providerTaskId = `${outcome.operation.name}::${result.request.aspect}`;
    const taskRef = this.encodeTaskRef({
      provider: 'gemini-veo', providerTaskId, sessionId: request.sessionId,
      serviceContext: request.serviceContext, intent: request.intent, operation: 'video-avatar',
      responseType: 'video', promptHash, createdAt: Date.now(),
    });
    const engine = veoEngineLabel(result.transport, result.model);
    return {
      ok: true,
      response: {
        success: true, provider: 'replicate', operation: 'video-avatar', responseType: 'video',
        message: `${engine} accepted the request. Polling for completion.`,
        predictionId: taskRef, predictionStatus: 'processing',
        metadata: {
          provider: 'replicate' as const, videoProvider: 'gemini-veo', model: result.model, veoTransport: result.transport,
          // What normalisation changed to fit the model (e.g. 1:1 → 9:16, 6 s → 8 s for references) — field names only.
          ...(result.adjustments.length ? { veoAdjustments: result.adjustments.map((a) => a.field) } : {}),
          operation: 'video-avatar', outputType: 'video', sessionId: request.sessionId, taskRef, providerTaskId, promptHash,
        },
      },
    };
  }

  /**
   * Resolve a 'gemini-veo' task-ref: poll the operation, then deliver the clip. Vertex writes to our GCS bucket (or
   * returns inline bytes); either is hosted at a path fixed per operation, so the film poll — which re-polls finished
   * clips every tick until the whole film is done — re-signs one object instead of re-uploading it each time. An
   * operation made on the Gemini Developer API (`models/…`, before v3.1) is answered `failed` by pollVeoClip with no
   * call. A transient miss keeps polling; only a definitive verdict (filtered / failed / undeliverable) is terminal.
   */
  private async pollVeoTaskRef(decoded: EncodedTaskRef, taskRef: string): Promise<ServiceManagerResponse> {
    const sep = decoded.providerTaskId.indexOf('::');
    const operation = sep > 0 ? decoded.providerTaskId.slice(0, sep) : decoded.providerTaskId;
    const transport = transportOf(operation);
    const engine = veoEngineLabel(transport, null);
    const baseMeta = {
      provider: 'replicate' as const, videoProvider: 'gemini-veo', veoTransport: transport, operation: decoded.operation,
      sessionId: decoded.sessionId, taskRef, providerTaskId: decoded.providerTaskId, promptHash: decoded.promptHash,
    };
    const failed = (message: string, extra: Record<string, unknown> = {}): ServiceManagerResponse => ({
      success: false, provider: 'replicate', operation: decoded.operation, responseType: decoded.responseType,
      message, predictionId: taskRef, predictionStatus: 'failed', metadata: { ...baseMeta, ...extra },
    });

    const r = await pollVeoClip(operation);
    if (r.state === 'succeeded') {
      const url = await this.deliverVeoVideo(r.videos[0], operation, decoded.sessionId);
      if (url) {
        return {
          success: true, provider: 'replicate', operation: decoded.operation, responseType: decoded.responseType,
          message: `${engine} rendered the scene.`, assetUrl: url, assetType: decoded.responseType,
          predictionId: taskRef, predictionStatus: 'succeeded', metadata: { ...baseMeta, outputType: decoded.responseType },
        };
      }
      // Generated but not deliverable (hosting / signing miss). Failing the leg lets the film report it; the raw
      // Veo object is IAM-gated, so it can never be handed to the browser as-is.
      return failed(`${engine} post-processing failed.`);
    }
    // ⚠️ GOOGLE'S REASON WAS THROWN AWAY HERE. Both branches returned a fixed sentence and logged nothing, so the ad film's
    // scene 2 (2026-10-15) left only "generation failed" behind; the why (a likeness refusal, support code 15236754) had to
    // be read back from Google by hand. The reason goes to the server log; the category (never the raw text, which can
    // echo the prompt) goes to the film, which names the scene and the rule to the person who asked for it.
    if (r.state === 'filtered') {
      const category = veoSafetyCategory(r.supportCodes);
      // Once per operation: the film polls a finished operation on every tick, so the same refusal was written six times.
      if (firstVeoDecline(`${operation}|${r.supportCodes.join(',')}`)) {
        console.warn(`[veo] scene declined by Google (${category ?? 'unlisted code'}) op=${operation.slice(-40)} codes=${r.supportCodes.join(',') || 'none'}: ${r.reason}`);
      }
      const why = category === 'celebrity' ? ': Google judged the person to look like a well-known public figure' : category ? ` (${category.replace('_', ' ')})` : '';
      return failed(`${engine} declined this scene under Google's safety rules${why}.`, {
        veoFiltered: true,
        veoSafetyCategory: category,
        veoSupportCodes: r.supportCodes.slice(0, 4),
      });
    }
    if (r.state === 'failed') {
      console.warn(`[veo] scene failed op=${operation.slice(-40)}${r.code !== undefined ? ` code=${r.code}` : ''}${r.finished ? ' (done)' : ''}: ${r.reason}`);
      return failed(`${engine} generation failed.`);
    }
    return {
      success: true, provider: 'replicate', operation: decoded.operation, responseType: decoded.responseType,
      message: `${engine} rendering…`, predictionId: taskRef, predictionStatus: 'processing', metadata: baseMeta,
    };
  }

  /** A playable URL for a finished Veo video, or null when it cannot be delivered. Never throws. */
  private async deliverVeoVideo(video: VeoVideo | undefined, operation: string, sessionId: string): Promise<string | null> {
    if (!video) return null;
    const opKey = createHash('sha256').update(operation).digest('hex').slice(0, 24);
    const session = sessionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'session';
    const path = `veo/${session}/${opKey}.mp4`;
    // Vertex: our own bucket, no visible watermark — copied once into Supabase so the Library can keep re-signing it
    // (a GCS V4 signature dies after 7 days). Idempotent on the same fixed path.
    if (video.kind === 'gcs') return hostGcsVideo(video, path);
    // A Developer API file (`gemini-file`) is never fetched under v3.1: that would need the AI Studio key.
    if (video.kind !== 'bytes') return null;

    const existing = await createSignedAssetUrl('renders', path, 604_800);
    if (existing) return existing;
    const buf = Buffer.from(video.base64, 'base64');
    if (buf.byteLength < 1_024) return null;
    // Inline bytes come from Vertex, which stamps no visible mark: hosted as-is at the fixed path.
    return uploadBufferAndSign('renders', path, buf, 'video/mp4', 604_800);
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

    // PHASE 56 (root-cause) — a no-URL result that carries a provider error (402 insufficient credits, quota, auth)
    // means NanoBanana produced NOTHING: report it as a failed leg with the provider's own message. It used to fail
    // over to FLUX and then Grok here; runTextToImage now decides what a miss may move to (Google's image model only —
    // the owner, 2026-10-09: no silent fallback to another outside provider).
    const providerError = detectNanoProviderError(result);
    if (providerError) {
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
      message: 'Image generation started.',
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
    // (no code push). A FLUX miss moves only to Google's image model (runTextToImage), never to NanoBanana.
    return (process.env.IMAGE_PRIMARY_PROVIDER || '').trim().toLowerCase() === 'nanobanana' ? 'nanobanana' : 'replicate';
  }

  private resolveVideoProvider(request: ServiceManagerRequest): 'ltx' | 'heygen' {
    const preferred = this.getOption(request.selectedOptions || {}, ['provider', 'video_provider', 'providerMode']);
    const avatar = request.intent === 'avatar_generation' || request.serviceContext === 'avatar';
    // ⚠️ HeyGen is the AVATAR engine, billed as an avatar. A client-supplied `provider: 'heygen'` on a VIDEO request
    // used to reroute it there — past the Google-only gate and priced as a video (0 credits in chat): a free HeyGen
    // render for anyone who set one option. The option now chooses between engines only for an avatar request.
    if (preferred?.toLowerCase() === 'heygen') {
      return avatar ? 'heygen' : 'ltx';
    }

    if (preferred?.toLowerCase() === 'ltx') {
      return 'ltx';
    }

    if (avatar) {
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
        || (parsed.provider !== 'replicate' && parsed.provider !== 'ltx' && parsed.provider !== 'heygen' && parsed.provider !== 'video-cascade' && parsed.provider !== 'runway' && parsed.provider !== 'gemini-veo')
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
