import { createHash } from 'crypto';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { budgetRefusalMessage } from '@/lib/services/billing/budgetMessage';
import type { ServiceType as BillingServiceType } from '@/lib/services/billing/costModel';

import { generateGeminiImage } from '@/lib/ai/geminiImage';
import { googleTransportBlocker } from '@/lib/ai/google/transport';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { pollPrediction } from '@/lib/replicate/client';
import { normalizeOutput } from '@/lib/replicate/normalizer';
import type { IntentCategory } from '@/lib/chat/intentDetector';
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
import { GOOGLE_ONLY_CODE, googleOnlyMessage } from '@/lib/providers/mediaPolicy';
import type { CameraMove, OutputFormat, VeoFailureReason, VeoMedia, VeoTier, VeoTransport, VeoVideo } from '@/lib/veo/types';
import { createSignedAssetUrl, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { withColorScience } from '@/lib/video/colorScience';
import { promptToEnglish } from '@/lib/ai/promptToEnglish';

export type DeterministicProvider = 'nanobanana' | 'replicate' | 'ltx' | 'heygen' | 'xai';
export type DeterministicOperation = 'text-to-image' | 'video-avatar';

// PHASE 24 — 'runway' is an async provider tier (Runway Gen-3 Alpha primary i2v). It surfaces on the
// wire as provider:'replicate' (DeterministicProvider has no 'runway'); the real engine lives in
// metadata.videoProvider — same pattern as 'video-cascade'.
type AsyncProvider = 'replicate' | 'ltx' | 'video-cascade' | 'runway' | 'gemini-veo';
type ResponseType = 'text' | 'image' | 'video' | 'audio' | 'analysis' | 'action_suggestions';

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

    if (decoded.provider === 'runway') {
      return this.pollRunwayTaskRef(decoded, taskRefOrPredictionId);
    }

    if (decoded.provider === 'gemini-veo') {
      return this.pollVeoTaskRef(decoded, taskRefOrPredictionId);
    }

    // An LTX task ref (decoded.provider === 'ltx'). LTX is retired (v5.1 M-14): /api/ltx-video refuses every call, so
    // no new one exists and an old one is answered honestly instead of calling LTX.
    return {
      success: false,
      provider: 'ltx',
      operation: decoded.operation,
      responseType: decoded.responseType,
      message: 'This render used an engine that is no longer available.',
      predictionId: taskRefOrPredictionId,
      predictionStatus: 'failed',
      metadata: {
        provider: 'ltx',
        operation: decoded.operation,
        sessionId: decoded.sessionId,
        taskRef: taskRefOrPredictionId,
        providerTaskId: decoded.providerTaskId,
        promptHash: decoded.promptHash,
      },
    };
  }

  private async runTextToImage(rawRequest: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    // ⚠️ ONE TRANSLATION FOR EVERY LEG. The Gemini image model reads `request.userPrompt` verbatim and are
    // trained overwhelmingly on English — so a Georgian brief was noise and each fell back to its priors, returning a
    // competent image unrelated to the request. Rebinding the request here fixes it at the single entry point. Only the
    // DESCRIPTION passes through — this path carries no lyrics, dialogue or on-screen copy. Fail-open:
    // any error/missing key/timeout returns the ORIGINAL text, so this can never break generation.
    const { promptToEnglish } = await import('@/lib/ai/promptToEnglish');
    const request: ServiceManagerRequest = { ...rawRequest, userPrompt: await promptToEnglish(rawRequest.userPrompt, 'image') };

    // ⚠️ GOOGLE ONLY (MASTER TASK v3.1, audit F-04): no outside engine runs, whatever was configured or picked and
    // whatever MEDIA_GOOGLE_ONLY says. Google's own image model (lib/ai/geminiImage, the model the NanoBanana reseller
    // sold, called directly) → an honest failure. The FLUX, NanoBanana and Grok legs are gone, and no miss moves to
    // another vendor. The Imagen 4 leg is gone too (v5.1 M-14): Google retired the model and it was 404 on Vertex.
    return (await this.tryGeminiImage(request, 'google-only')) ?? this.imageFailure(request, 'nanobanana', 'Image generation failed. Please try again.');
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

  private async runVideoAvatar(request: ServiceManagerRequest): Promise<ServiceManagerResponse> {
    const provider = this.resolveVideoProvider(request);
    if (provider === 'heygen') {
      // The presenter (HeyGen) has no Google engine, so it is refused before HeyGen is called, whatever
      // MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). The chat hold is given back on any failed answer.
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
        || (parsed.provider !== 'replicate' && parsed.provider !== 'ltx' && parsed.provider !== 'video-cascade' && parsed.provider !== 'runway' && parsed.provider !== 'gemini-veo')
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

}
