/**
 * lib/chat/providerRouter.ts
 * ==========================
 * Routes requests to the correct backend provider:
 *   - text-llm  → Gemini (1.5 Pro / Flash) — OpenAI deprecated, not in runtime path
 *   - replicate → internal Replicate API routes
 *
 * Returns a normalized ChatResponse in both cases.
 */

import { detectIntent, intentToReplicateService, type DetectedIntent, type IntentCategory } from './intentDetector';
import { validateInput, buildModelInput, type GenerateInput } from '@/lib/replicate/schemas';
import { resolveModel } from '@/lib/replicate/models';
import { createPrediction, pollUntilDone } from '@/lib/replicate/client';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { getNanoBananaCreditCost, resolveNanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { ServiceManager, type ServiceManagerResponse } from './ServiceManager';
import { getUdioGenerationStatus, startUdioGeneration } from '@/lib/udio/client';
import { hasUdioApiKey } from './mediaKeys';
import { buildInteriorDesignBrief } from '@/lib/interior/smart-intake';
import { generateWorldLabsInterior } from '@/lib/worldlabs/client';
import { buildIterativePrompt } from './iteration-store';
import { buildEnforcedMusicStyle } from './outputEnforcement';
import Anthropic from '@anthropic-ai/sdk';
import { generateWithGemini } from '@/lib/gemini/client';
import { getGeminiSystemPrompt, type GeminiServiceContext } from '@/lib/gemini/prompts';
import { extractMediaArtifact, type MediaKind } from '@/lib/media/extractArtifact';
import { isMusicVideoComposite, handleMusicVideoComposite } from './musicVideoComposite';
import { isThirtySecondFilm, handleFilmComposite } from './filmComposite';
import { isCompositeRef, decodeCompositeRef } from './compositeTaskRef';
import { isFilmRef, decodeFilmRef, computeFilmUnion, type FilmTaskRef, type FilmLegRuntimeStatus } from './filmTaskRef';
import { deriveFilmTokenId, buildFilmSnapshot, putFilmStatus } from './filmStatusStore';
import { isFounderAuditCommand, isFounder, runFounderAudit, renderAuditAsMarkdown } from '@/lib/monetization/audit-engine';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  message: string;
  serviceContext: string;
  agentId: string;
  userId: string;
  sessionId: string;
  locale: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  selectedOptions?: Record<string, string>;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
  /**
   * Optional user "Custom Instructions" (Settings → personalization). Appended
   * to the agent's system prompt so it biases tone/behaviour without polluting
   * the visible conversation. Bounded by the caller (see orchestrate route).
   */
  customInstructions?: string;
}

/**
 * PHASE 49 §1 — Strict hybrid cognitive routing.
 *
 * Gemini is the PRIMARY foundational core for all default interactions: the
 * conversational agent, standard UI responses, prompt execution and Georgian
 * linguistic processing. Claude is a SECONDARY SPECIALIST — invoked first only
 * for complex programming, deep science/math parsing, or large technical
 * blueprints, where its long-form reasoning is worth the latency. Everything
 * else stays Gemini-led (Claude remains the silent fallback so chat never dark).
 *
 * Pure + exported so the routing decision is unit-tested in isolation.
 */
// The routing decision lives in a dependency-free module so it can be
// unit-tested in isolation (providerRouter itself pulls in heavy provider SDKs).
export { prefersClaudeSpecialist } from './specialistRouting';
import { prefersClaudeSpecialist } from './specialistRouting';

/** Append the user's custom instructions to a base system prompt (if any). */
function withCustomInstructions(base: string, customInstructions?: string): string {
  const trimmed = (customInstructions || '').trim().slice(0, 2000);
  if (!trimmed) return base;
  return `${base}\n\n[User custom instructions]\nThe user has set the following persistent preferences. Honour them unless they conflict with safety:\n${trimmed}`;
}

export interface ChatResponse {
  success: boolean;
  intent: IntentCategory;
  responseType: 'text' | 'image' | 'video' | 'audio' | 'analysis' | 'action_suggestions';
  message: string;
  assetUrl?: string | null;
  assetType?: string;
  predictionId?: string;
  predictionStatus?: string;
  metadata: {
    provider: string;
    model?: string;
    agentId?: string;
    tokensIn?: number;
    tokensOut?: number;
    durationMs?: number;
    confidence?: number;
    [key: string]: unknown;
  };
}

// ─── Agent selection ─────────────────────────────────────────────────────────

const CONTEXT_TO_AGENT: Record<string, string> = {
  global: 'main-assistant',
  music: 'music-agent',
  video: 'video-agent',
  avatar: 'avatar-agent',
  image: 'image-agent',
  photo: 'thumbnail-agent',
  voice: 'music-agent',
  business: 'business-agent',
  'visual-ai': 'qa-agent',
  'visual-intel': 'qa-agent',
  workflow: 'workflow-agent',
  shop: 'store-agent',
  text: 'content-agent',
  media: 'social-agent',
  prompt: 'main-assistant',
  'content-writer': 'main-assistant',
  podcast: 'main-assistant',
  character: 'main-assistant',
  event: 'main-assistant',
  tourism: 'main-assistant',
  'voice-studio': 'audio-agent',
};

const DETERMINISTIC_INTENTS = new Set<IntentCategory>([
  'avatar_generation',
  'image_generation',
  'photo_edit',
  'video_generation',
]);

const serviceManager = new ServiceManager();
const UDIO_PREDICTION_PREFIX = 'udio:';

// ─── Gemini multimodal handler ────────────────────────────────────────────────

function toGeminiServiceContext(serviceContext: string): GeminiServiceContext {
  const normalized = String(serviceContext || '').toLowerCase();
  switch (normalized) {
    case 'interior':
    case 'interior-design':
      return 'interior';
    case 'image':
    case 'photo':
      return 'image';
    case 'video':
      return 'video';
    case 'music':
      return 'music';
    case 'voice':
      return 'voice';
    case 'avatar':
      return 'avatar';
    case 'business':
      return 'business';
    case 'game':
      return 'game';
    case 'text':
    case 'prompt':
    case 'content':
      return 'text';
    default:
      return 'general';
  }
}

/** Split a `data:<mime>;base64,<payload>` URL into the inline-data pair Gemini
 *  expects. Returns null for a non-data / malformed URL. */
function dataUrlToInlinePart(dataUrl: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  return { mimeType: m[1] || 'image/jpeg', data: m[2] ?? '' };
}

async function handleGeminiMultimodal(input: OrchestratorInput): Promise<ChatResponse | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const metadataAttachments = Array.isArray(input.metadata?.attachments)
    ? input.metadata.attachments as Array<{ type?: string; mimeType?: string; data?: string }>
    : [];
  const supportedMetadataAttachments = metadataAttachments.filter((item) => {
    const type = String(item.type || '').toLowerCase();
    return type === 'image' || type === 'pdf' || type === 'video';
  });

  // PHASE 56 — full multimodal VISION. The attachments handed to Gemini are
  // assembled from every channel the surfaces can use, in priority order:
  //   (1) an explicit base64 blob in metadata (legacy MCP / server callers),
  //   (2) the `imageUrl` the chat composer actually sends — a data: URL for a
  //       fresh upload or an https: URL for a prior asset; this was previously
  //       IGNORED here, so Gemini "couldn't see" composer uploads at all,
  //   (3) any extra typed attachments forwarded via metadata.attachments.
  const attachments: { type: 'image' | 'pdf' | 'video'; mimeType: string; data: string }[] = [];

  const imageBase64 = input.metadata?.imageBase64 as string | undefined;
  const metaMime = (input.metadata?.mimeType as string) ?? 'image/jpeg';
  if (imageBase64) attachments.push({ type: 'image', mimeType: metaMime, data: imageBase64 });

  if (input.imageUrl) {
    try {
      const part = dataUrlToInlinePart(await loadImageAsDataUrl(input.imageUrl));
      if (part?.data) attachments.push({ type: 'image', mimeType: part.mimeType, data: part.data });
    } catch {
      // Unreadable reference (CORS / 404) — degrade to whatever else we have.
    }
  }

  for (const item of supportedMetadataAttachments) {
    attachments.push({
      type: String(item.type).toLowerCase() as 'image' | 'pdf' | 'video',
      mimeType: String(item.mimeType || 'application/octet-stream'),
      data: String(item.data || ''),
    });
  }

  const usable = attachments.filter((a) => a.data.length > 0);
  if (usable.length === 0) return null;

  const ctx = toGeminiServiceContext(input.serviceContext);
  const systemPrompt = withCustomInstructions(getGeminiSystemPrompt(ctx, input.locale ?? 'ka'), input.customInstructions);

  const startMs = Date.now();
  const response = await generateWithGemini({
    prompt: input.message,
    systemPrompt,
    tier: 'pro',
    attachments: usable,
    history: input.history?.map((h) => ({
      role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: h.content }],
    })),
  });

  return {
    success: true,
    intent: 'analysis' as IntentCategory,
    responseType: 'analysis',
    message: response.text,
    metadata: {
      provider: 'gemini',
      model: response.model,
      durationMs: Date.now() - startMs,
      attachment_count: usable.length,
    },
  };
}

// ─── Main orchestrate function ───────────────────────────────────────────────

export async function orchestrate(
  input: OrchestratorInput,
  _baseUrl?: string,
): Promise<ChatResponse> {
  // PHASE 56 — Interior REDESIGN (depth-locked FLUX ControlNet) takes priority
  // over the WorldLabs 3D-world route: when a room photo is attached in the
  // Interior service and the user hasn't explicitly asked for a 3D world /
  // walkthrough, re-render the SAME room with new materials, furniture and
  // lighting. Explicit 3D/world asks still fall through to WorldLabs below.
  if (shouldRedesignInterior(input)) {
    return handleInteriorRedesign(input);
  }

  if (shouldRouteInteriorToWorldLabs(input)) {
    return handleInteriorIntent(input);
  }

  // PHASE 56 — Gemini multimodal VISION, unleashed across EVERY conversational
  // context. Previously gated to the image/avatar/video/photo service set, so an
  // asset attached in general chat was silently dropped and Gemini appeared
  // "unable to read" it. Now ANY attached asset (image / PDF / video; data: or
  // https:) is read by Gemini Pro — UNLESS the turn is an explicit media-
  // generation command, which still falls through to the deterministic
  // NanoBanana / LTX / HeyGen path that threads the asset in as a reference.
  const hasAttachedAsset = !!input.imageUrl
    || !!input.metadata?.imageBase64
    || (Array.isArray(input.metadata?.attachments) && input.metadata.attachments.length > 0);
  if (hasAttachedAsset) {
    const probe = detectIntent(input.message, input.serviceContext);
    const isGenerationCommand = DETERMINISTIC_INTENTS.has(probe.intent) || probe.intent === 'music_generation';
    if (!isGenerationCommand) {
      const geminiResponse = await handleGeminiMultimodal(input);
      if (geminiResponse) return geminiResponse;
    }
  }

  // Founder Audit short-circuit. Bypasses normal routing for an allowlisted
  // user_id (FOUNDER_USER_IDS env). Returns the canonical wholesale-vs-retail
  // aggregate as a markdown block in the chat feed.
  if (isFounderAuditCommand(input.message) && isFounder(input.userId)) {
    try {
      const audit = await runFounderAudit();
      return {
        success: true,
        intent: 'business_help',
        responseType: 'analysis',
        message: renderAuditAsMarkdown(audit, input.locale),
        metadata: {
          provider: 'founder-audit',
          audit,
        },
      };
    } catch (err) {
      return {
        success: false,
        intent: 'business_help',
        responseType: 'text',
        message: `Founder audit failed: ${err instanceof Error ? err.message : String(err)}`,
        metadata: { provider: 'founder-audit' },
      };
    }
  }

  // P1-B — MUSIC-VIDEO MODE is an EXPLICIT user choice (the studio panel's flag),
  // so honour it REGARDLESS of the message language or keywords. Without this an
  // English brief like "30 second R&B music video with a female singer in Tbilisi"
  // gets keyword-routed to a Udio AUDIO-only job instead of the FILM pipeline. The
  // flag rides in metadata from driveFilmStudio (and the orchestrate dispatch), so
  // the film/music-video pipeline activates whenever musicVideoMode === true.
  if (input.metadata?.musicVideoMode === true) {
    return handleFilmComposite(input);
  }

  // PHASE 42 §1 — The flagship "30-Second Film" pipeline is the most specific
  // composite, so it is checked FIRST. `isThirtySecondFilm` is deliberately
  // conservative (explicit "30-second film / short film / mini-movie" phrasing),
  // so a plain "music video" request still falls through to the music-video
  // composite below. See lib/chat/filmComposite.ts.
  if (isThirtySecondFilm(input.message)) {
    return handleFilmComposite(input);
  }

  // Composite check runs BEFORE single-intent detection. Music-video prompts
  // would otherwise be matched by music_generation OR video_generation
  // (whichever pattern hits the higher confidence weight) and only ONE
  // worker would fire — see lib/chat/musicVideoComposite.ts for the trace.
  if (isMusicVideoComposite(input.message)) {
    return handleMusicVideoComposite(input);
  }

  // 1. Detect intent
  const detected = detectIntent(input.message, input.serviceContext);

  if (detected.intent === 'music_generation') {
    return handleMusicIntent(input, detected);
  }

  if (DETERMINISTIC_INTENTS.has(detected.intent)) {
    return handleDeterministicIntent(input, detected);
  }

  // 2. Route to the right provider
  if (detected.provider === 'replicate') {
    return handleReplicateIntent(input, detected);
  }

  return handleTextIntent(input, detected);
}

export async function pollOrchestrationTask(predictionId: string, sessionId?: string): Promise<ChatResponse> {
  // Film union poll (5 clips + audio + editor) — decode and poll the whole
  // matrix in lock-step. Checked FIRST: a `film:` token must never fall through
  // to the composite/udio single-leg pollers.
  if (isFilmRef(predictionId)) {
    return pollFilmTask(predictionId, sessionId);
  }

  // Composite (music + video + lyrics) — decode and poll each leg.
  if (isCompositeRef(predictionId)) {
    return pollCompositeTask(predictionId, sessionId);
  }

  const udioWorkId = extractUdioWorkId(predictionId);
  if (udioWorkId) {
    return pollUdioTask(udioWorkId, predictionId);
  }

  const response = await serviceManager.poll(predictionId, sessionId);
  return toChatResponse(response, 'text_chat');
}

/**
 * Polls the music + video legs of a composite ref in a single tick.
 * Returns a merged ChatResponse:
 *   - `predictionStatus` is `succeeded` only when ALL non-skipped legs land
 *   - `assetUrl` is the music URL when ready (most-distinctive deliverable
 *     for music-video prompts; the video URL rides in metadata.video.url)
 *   - failures degrade gracefully — a failed leg doesn't kill the others.
 */
async function pollCompositeTask(predictionId: string, sessionId?: string): Promise<ChatResponse> {
  const ref = decodeCompositeRef(predictionId);
  if (!ref) {
    return {
      success: false,
      intent: 'music_generation',
      responseType: 'text',
      message: 'Composite task token is malformed.',
      predictionId,
      predictionStatus: 'error',
      metadata: { provider: 'composite', composite: true },
    };
  }

  type LegState = { status: 'pending' | 'succeeded' | 'failed' | 'skipped'; url: string | null; error?: string };

  const music: LegState = { status: ref.musicWorkId ? 'pending' : 'skipped', url: null };
  const video: LegState = { status: ref.videoTaskRef ? 'pending' : 'skipped', url: null };

  // Music leg via Udio.
  if (ref.musicWorkId) {
    try {
      const udio = await pollUdioTask(ref.musicWorkId, `udio:${ref.musicWorkId}`);
      if (udio.predictionStatus === 'succeeded') {
        music.status = 'succeeded';
        music.url = udio.assetUrl ?? null;
      } else if (udio.predictionStatus === 'failed') {
        music.status = 'failed';
        music.error = udio.message;
      }
    } catch (err) {
      music.status = 'failed';
      music.error = err instanceof Error ? err.message : String(err);
    }
  }

  // Video leg via ServiceManager.
  if (ref.videoTaskRef) {
    try {
      const sm = await serviceManager.poll(ref.videoTaskRef, sessionId || ref.sessionId);
      if (sm.predictionStatus === 'succeeded') {
        video.status = 'succeeded';
        video.url = sm.assetUrl ?? null;
      } else if (sm.predictionStatus === 'failed' || sm.predictionStatus === 'error' || sm.predictionStatus === 'canceled') {
        video.status = 'failed';
        video.error = sm.message;
      }
    } catch (err) {
      video.status = 'failed';
      video.error = err instanceof Error ? err.message : String(err);
    }
  }

  const legs = [music, video].filter((leg) => leg.status !== 'skipped');
  const anyPending = legs.some((leg) => leg.status === 'pending');
  const allSucceeded = legs.length > 0 && legs.every((leg) => leg.status === 'succeeded');
  const anyFailed = legs.some((leg) => leg.status === 'failed');

  const compositeStatus: 'processing' | 'succeeded' | 'failed' =
    anyPending ? 'processing' : allSucceeded ? 'succeeded' : anyFailed ? 'failed' : 'processing';

  const summaryLines: string[] = [];
  if (ref.lyrics) summaryLines.push('✅ Lyrics composed');
  summaryLines.push(`🎵 Music: ${music.status}${music.error ? ` (${music.error})` : ''}`);
  summaryLines.push(`🎬 Video: ${video.status}${video.error ? ` (${video.error})` : ''}`);

  return {
    success: compositeStatus !== 'failed',
    intent: 'music_generation',
    responseType: 'audio',
    message: summaryLines.join('\n'),
    assetUrl: music.url ?? video.url ?? null,
    assetType: 'composite-music-video',
    predictionId,
    predictionStatus: compositeStatus,
    metadata: {
      provider: 'composite',
      composite: true,
      compositePlan: {
        lyrics: ref.lyrics ?? null,
        musicPredictionId: ref.musicWorkId ?? null,
        videoTaskRef: ref.videoTaskRef ?? null,
        videoStatus: video.status,
      },
      music: { status: music.status, url: music.url, error: music.error },
      video: { status: video.status, url: video.url, error: video.error },
    },
  };
}

/**
 * PHASE 43 §1 — The "Union Poll Codec" tick for the 30-second film.
 *
 * Decodes the `film:` token and polls EVERY clip + the audio leg in a single
 * lock-step pass, then computes a union status. Unlike the legacy behaviour
 * (which tracked only the first clip), this reports the collective progress of
 * all sub-agents so the client's per-agent telemetry strip + storyboard skeleton
 * reflect the true matrix.
 *
 * Resolution contract:
 *   - Per-clip status + resolved URL ride in `metadata.film.clips[]`.
 *   - The render phase resolves to `succeeded` only when every non-skipped clip
 *     has landed AND the audio leg is terminal. At that moment `readyToStitch`
 *     flips true and `metadata.film.clips[].url` + `metadata.film.audioUrl` carry
 *     everything the authenticated client needs to fire `/api/video/assemble`
 *     and mount the fully stitched + audio-synced master (the editor leg).
 *   - A single failed leg degrades gracefully: surviving clips still finish; the
 *     union reports `failed` without discarding the clips that did land.
 */
type FilmLegPollStatus = FilmLegRuntimeStatus;

async function pollFilmTask(predictionId: string, sessionId?: string): Promise<ChatResponse> {
  const ref = decodeFilmRef(predictionId);
  if (!ref) {
    return {
      success: false,
      intent: 'video_generation',
      responseType: 'text',
      message: 'Film task token is malformed.',
      predictionId,
      predictionStatus: 'error',
      metadata: { provider: 'composite', composite: true, film: true },
    };
  }

  const effectiveSession = sessionId || ref.sessionId;

  // ── Poll all clip legs in lock-step ─────────────────────────────────────────
  const clipStates = await Promise.all(
    ref.clips.map(async (clip) => pollFilmClip(clip, effectiveSession)),
  );

  // ── Poll the audio leg (Udio) ───────────────────────────────────────────────
  let audioStatus: FilmLegPollStatus = ref.musicWorkId ? 'pending' : 'skipped';
  let audioUrl: string | null = null;
  if (ref.musicWorkId) {
    try {
      const udio = await pollUdioTask(ref.musicWorkId, `${UDIO_PREDICTION_PREFIX}${ref.musicWorkId}`);
      if (udio.predictionStatus === 'succeeded') {
        audioStatus = 'succeeded';
        audioUrl = udio.assetUrl ?? null;
      } else if (udio.predictionStatus === 'failed') {
        audioStatus = 'failed';
      }
    } catch {
      audioStatus = 'failed';
    }
  }

  // ── Union computation across the render legs (clips + audio) ─────────────────
  // The editor (stitch) leg becomes ready only when every clip has landed and
  // the score is terminal. We never claim the stitch "done" here — the authed
  // client owns the real /api/video/assemble dispatch (it holds the session and
  // the 20-credit charge), then mounts the resulting master.
  const union = computeFilmUnion(clipStates.map((c) => c.status), audioStatus);
  const { readyToStitch, anyClipPending, filmStatus, stitchStatus } = union;

  // PHASE 47 §1 — persist a compact snapshot to the storage-backed status tracker
  // so a reload / second device can recover the unified state (and the final
  // master, once the assemble route stamps it) via /api/video/status/[tokenId].
  // Best-effort + fail-open: a tracking write must never break the poll.
  const statusTokenId = deriveFilmTokenId({ sessionId: ref.sessionId, createdAt: ref.createdAt, seed: ref.seed });
  try {
    await putFilmStatus(
      buildFilmSnapshot({
        tokenId: statusTokenId,
        clips: clipStates.map((c) => ({ ordinal: c.ordinal, status: filmLegToClientStatus(c.status), url: c.url })),
        audioStatus,
        readyToStitch,
        filmStatus,
      }),
    );
  } catch {
    /* fail-open — tracking is best-effort, the render is the source of truth */
  }

  // Ordered clip URLs the client hands to the assembler (only the ready ones).
  const orderedClips = [...clipStates].sort((a, b) => a.ordinal - b.ordinal);
  const succeededClips = clipStates.filter((c) => c.status === 'succeeded').length;
  const activeClips = clipStates.filter((c) => c.status !== 'skipped').length;

  const summaryLines = [
    `🎬 Film render: ${succeededClips}/${activeClips} clips ready`,
    // PARTIAL SALVAGE — surface that the film stitches with fewer scenes (1+ skipped).
    ...(union.salvaged ? [`⚠️ ${activeClips - succeededClips}/${activeClips} სცენა გამოტოვდა — ნაწილობრივი მონტაჟი`] : []),
    `🎵 Score: ${audioStatus}`,
    readyToStitch
      ? (union.salvaged ? `✂️ Editor ready — stitching ${succeededClips} survivors` : '✂️ Editor ready — stitching final cut')
      : filmStatus === 'failed'
        ? '⚠️ ვერ აეწყო — ძალიან ცოტა კლიპი დარჩა'
        : '⏳ Awaiting clips',
  ];

  return {
    success: filmStatus !== 'failed',
    intent: 'video_generation',
    responseType: 'video',
    message: summaryLines.join('\n'),
    // Preview the first ready clip while the editor assembles the master; the
    // client swaps in the stitched mp4 once /api/video/assemble returns.
    assetUrl: orderedClips.find((c) => c.url)?.url ?? null,
    assetType: 'composite-film',
    predictionId,
    predictionStatus: filmStatus,
    metadata: {
      provider: 'composite',
      composite: true,
      film: {
        sceneCount: ref.sceneCount,
        seed: ref.seed,
        storyboard: 'succeeded',
        clips: orderedClips.map((c) => ({
          ordinal: c.ordinal,
          status: filmLegToClientStatus(c.status),
          url: c.url,
          attempts: c.attempts ?? 1,
          // Diagnostics (harmless extra fields; the client reads status/url only).
          ...(c.providerStatus ? { providerStatus: c.providerStatus } : {}),
          ...(c.note ? { note: c.note } : {}),
        })),
        stitch: filmStitchToClientStatus(stitchStatus, anyClipPending),
        audio: filmLegToClientStatus(audioStatus),
        audioUrl,
        // PHASE 48 §2 — commentator/narration track (already a resolved signed
        // URL in the token; no polling). The client hands it to the assembler as
        // `voiceoverUrl` and the FFmpeg master ducks the score under it.
        voiceUrl: ref.voiceUrl ?? null,
        // PHASE 49 §7 — cinematic SFX / sound-design track; mixed under the score.
        sfxUrl: ref.sfxUrl ?? null,
        // DAY-6 multi-voice — per-speaker dialogue stems (already resolved signed URLs in
        // the token; no polling). The authed client forwards them to /api/video/assemble,
        // which spatial-premixes ≥2 with the -12dB duck. Null → single-voice.
        dialogueStems: ref.dialogueStems ?? null,
        readyToStitch,
        // PHASE 47 §1 — the unified status-tracker key for /api/video/status.
        statusTokenId,
      },
    },
  };
}

type FilmLegStitchStatus = 'pending' | 'ready' | 'blocked';

interface FilmClipPollState {
  ordinal: number;
  status: FilmLegPollStatus;
  url: string | null;
  attempts?: number;
  /** Diagnostics: the RAW provider poll verdict + a short note, surfaced into
   *  metadata.film.clips so a stuck render is self-explanatory in the network
   *  response (no server-log access needed to see why a clip sits pending). */
  providerStatus?: string;
  note?: string;
}

/** Poll one clip leg; null taskRef short-circuits to its dispatch-time verdict. */
async function pollFilmClip(clip: FilmTaskRef['clips'][number], sessionId?: string): Promise<FilmClipPollState> {
  if (!clip.taskRef) {
    // No provider job was ever queued — carry the dispatch verdict through.
    const status: FilmLegPollStatus = clip.status === 'failed' ? 'failed' : 'skipped';
    return { ordinal: clip.ordinal, status, url: null, attempts: clip.attempts };
  }
  try {
    const sm = await serviceManager.poll(clip.taskRef, sessionId);
    const providerStatus = sm.predictionStatus;
    const note = (sm.message || '').slice(0, 140) || undefined;
    if (sm.predictionStatus === 'succeeded') {
      return { ordinal: clip.ordinal, status: 'succeeded', url: sm.assetUrl ?? null, attempts: clip.attempts, providerStatus };
    }
    if (sm.predictionStatus === 'failed' || sm.predictionStatus === 'error' || sm.predictionStatus === 'canceled') {
      return { ordinal: clip.ordinal, status: 'failed', url: null, attempts: clip.attempts, providerStatus, note };
    }
    return { ordinal: clip.ordinal, status: 'pending', url: null, attempts: clip.attempts, providerStatus, note };
  } catch (err) {
    return {
      ordinal: clip.ordinal,
      status: 'failed',
      url: null,
      attempts: clip.attempts,
      providerStatus: 'threw',
      note: (err instanceof Error ? err.message : String(err)).slice(0, 140),
    };
  }
}

/** Map an internal poll status to the client FilmMeta leg vocabulary. */
function filmLegToClientStatus(s: FilmLegPollStatus): 'pending' | 'queued' | 'succeeded' | 'failed' | 'skipped' {
  if (s === 'pending') return 'queued';
  return s;
}

/** Map the stitch state to the client FilmMeta leg vocabulary. */
function filmStitchToClientStatus(
  s: FilmLegStitchStatus,
  anyClipPending: boolean,
): 'pending' | 'queued' | 'succeeded' | 'failed' | 'skipped' {
  if (s === 'blocked') return 'failed';
  if (s === 'ready') return 'queued'; // ready-to-assemble; client owns final stitch
  return anyClipPending ? 'queued' : 'pending';
}

// PHASE 56 — Interior REDESIGN engine model. Black Forest Labs' official
// FLUX.1 [Dev] depth-ControlNet: it derives a depth map from the uploaded room
// photo (locking walls, windows, proportions and camera perspective) and
// re-renders photorealistic materials, furniture, decor and lighting from the
// user's brief onto that exact geometry. Env-overridable for a later pin/swap.
const INTERIOR_REDESIGN_MODEL = process.env.REPLICATE_INTERIOR_MODEL || 'black-forest-labs/flux-depth-dev';

// The pure redesign-vs-WorldLabs decision lives in a dependency-free module so
// it can be unit-tested in isolation (providerRouter pulls in heavy SDKs).
export { shouldRedesignInterior } from './interiorRouting';
import { shouldRedesignInterior } from './interiorRouting';

/** Normalize the many shapes a Replicate image output can take into a URL. */
function extractReplicateImageUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const first = output.find((o) => typeof o === 'string');
    return typeof first === 'string' ? first : null;
  }
  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (Array.isArray(obj.output)) {
      const first = obj.output.find((o) => typeof o === 'string');
      return typeof first === 'string' ? first : null;
    }
  }
  return null;
}

/**
 * PHASE 56 — Interior REDESIGN handler (Replicate · FLUX.1 [Dev] + depth
 * ControlNet). Locks the room's spatial geometry from the uploaded photo and
 * re-renders photorealistic materials, furniture and lighting from the user's
 * restyle brief onto the SAME space. Returns a flat 2D "after" image.
 *
 * Synchronous create + poll: the orchestrate route's maxDuration=300 gives a
 * single depth render plenty of headroom. Failures degrade to an honest,
 * localized message — never a fabricated success.
 */
async function handleInteriorRedesign(input: OrchestratorInput): Promise<ChatResponse> {
  const iterative = buildIterativePrompt({
    sessionId: input.sessionId,
    serviceContext: 'interior',
    message: input.message,
    selectedOptions: input.selectedOptions,
    imageUrl: input.imageUrl,
  });

  const opts = input.selectedOptions || {};
  const controlImage = input.imageUrl || opts.image_url || opts.reference_image || '';

  // Compose a depth-locked restyle brief: the user's words lead, the UI design
  // answers follow, and a geometry-preservation guardrail anchors the depth
  // ControlNet so the room's walls/windows/proportions/perspective stay intact.
  const styleAnswers = [
    opts.primary_goal && `goal: ${opts.primary_goal.replace(/_/g, ' ')}`,
    opts.color_palette && `palette: ${opts.color_palette.replace(/_/g, ' ')}`,
    opts.materials && `materials: ${opts.materials.replace(/_/g, ' ')}`,
    opts.lighting_vibe && `lighting: ${opts.lighting_vibe.replace(/_/g, ' ')}`,
    opts.style && `style: ${opts.style}`,
  ]
    .filter(Boolean)
    .join(', ');

  const prompt = [
    iterative.prompt.trim(),
    styleAnswers,
    'photorealistic interior redesign of the same room, preserve the exact geometry, walls, windows, doorways, proportions and camera perspective, only re-render materials, furniture, decor and lighting, professional architectural visualization, natural light, high detail, 8k',
  ]
    .filter(Boolean)
    .join('. ');

  try {
    const created = await createPrediction(INTERIOR_REDESIGN_MODEL, {
      prompt,
      control_image: controlImage,
      guidance: 10,
      num_inference_steps: 28,
      megapixels: '1',
      num_outputs: 1,
      output_format: 'webp',
      output_quality: 90,
    });

    const done =
      created.status === 'succeeded' || created.status === 'failed' || created.status === 'canceled'
        ? created
        : await pollUntilDone(created.id, 90, 2000);

    if (done.status !== 'succeeded') {
      throw new Error(done.error || `redesign ${done.status}`);
    }

    const assetUrl = extractReplicateImageUrl(done.output);
    if (!assetUrl) {
      throw new Error('redesign produced no image');
    }

    const loc = input.locale || 'ka';
    const message =
      loc === 'en'
        ? 'Interior redesign ready — same room, restyled materials, furniture and lighting. Send a follow-up to iterate.'
        : loc === 'ru'
          ? 'Редизайн интерьера готов — та же комната, новые материалы, мебель и освещение. Напишите уточнение, и я доработаю.'
          : 'ინტერიერის რედიზაინი მზადაა — იგივე ოთახი, განახლებული მასალები, ავეჯი და განათება. მომწერეთ დამატება და დავხვეწავ.';

    return {
      success: true,
      intent: 'image_generation',
      responseType: 'image',
      message,
      assetUrl,
      assetType: 'image',
      metadata: {
        provider: 'replicate',
        model: INTERIOR_REDESIGN_MODEL,
        engine: 'flux-depth-controlnet',
        predictId: done.id,
        predictTime: done.metrics?.predict_time,
        iteration: iterative.iteration,
      },
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Interior redesign failed.';
    const loc = input.locale || 'ka';
    const friendly =
      loc === 'en'
        ? 'The Interior redesign engine hit a snag rendering your room — please try again shortly.'
        : loc === 'ru'
          ? 'Движок редизайна интерьера не смог отрисовать комнату — попробуйте чуть позже.'
          : 'ინტერიერის რედიზაინის ძრავმა ვერ დაარენდერა ოთახი — სცადეთ ცოტა ხანში.';
    return {
      success: false,
      intent: 'image_generation',
      responseType: 'text',
      message: friendly,
      metadata: {
        provider: 'replicate',
        model: INTERIOR_REDESIGN_MODEL,
        engine: 'flux-depth-controlnet',
        iteration: iterative.iteration,
        error: raw,
      },
    };
  }
}

function shouldRouteInteriorToWorldLabs(input: OrchestratorInput): boolean {
  const context = String(input.serviceContext || '').toLowerCase();
  if (context === 'interior' || context === 'interior-design') {
    return true;
  }

  const provider = String(
    input.selectedOptions?.provider
      || input.selectedOptions?.model_provider
      || input.selectedOptions?.interior_provider
      || '',
  ).toLowerCase();
  if (provider === 'worldlabs' || provider === 'marble') {
    return true;
  }

  return /\b(interior|room|space|marble|world\s*labs|3d\s*interior)\b/i.test(input.message);
}

function ensureImageDataUrl(raw: string, mimeType: string): string {
  const prefix = `data:${mimeType};base64,`;
  return raw.startsWith('data:') ? raw : `${prefix}${raw}`;
}

async function loadImageAsDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error('Interior generation requires a valid image URL or data URL.');
  }

  const response = await fetch(imageUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load reference image (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const bytes = Buffer.from(await response.arrayBuffer());
  return ensureImageDataUrl(bytes.toString('base64'), contentType);
}

function runOutputValidation(input: {
  requestedPrompt: string;
  selectedOptions?: Record<string, string>;
  spatialLink?: string | null;
  glbUrl?: string | null;
}): { status: 'pass' | 'review' | 'fail'; note: string } {
  if (!input.spatialLink && !input.glbUrl) {
    return { status: 'fail', note: 'Generated output missing both viewer and model links.' };
  }

  const values = Object.values(input.selectedOptions || {})
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 2)
    .slice(0, 8);
  const prompt = input.requestedPrompt.toLowerCase();
  const missing = values.filter((value) => !prompt.includes(value));

  if (missing.length > 0) {
    return {
      status: 'review',
      note: `Output generated, but prompt alignment needs review (${missing.join(', ')}).`,
    };
  }

  return { status: 'pass', note: 'Output passed alignment checks.' };
}

async function handleInteriorIntent(input: OrchestratorInput): Promise<ChatResponse> {
  const iterative = buildIterativePrompt({
    sessionId: input.sessionId,
    serviceContext: 'interior',
    message: input.message,
    selectedOptions: input.selectedOptions,
    imageUrl: input.imageUrl,
  });

  const selectedOptions = input.selectedOptions || {};
  const designBrief = buildInteriorDesignBrief({
    userPrompt: iterative.prompt,
    answers: {
      primaryGoal: String(selectedOptions.primary_goal || 'full_renovation'),
      colorPalette: String(selectedOptions.color_palette || 'neutral_scandi'),
      materials: String(selectedOptions.materials || 'natural_wood'),
      lightingVibe: String(selectedOptions.lighting_vibe || 'natural_sunlight'),
    },
  });

  const imageUrl = input.imageUrl || selectedOptions.image_url || selectedOptions.reference_image;
  if (!imageUrl) {
    return {
      success: false,
      intent: 'image_generation',
      responseType: 'action_suggestions',
      message: 'Upload a clear room photo first, then I will generate the 3D interior world.',
      metadata: {
        provider: 'worldlabs',
        model: 'marble',
        validation: 'blocked_missing_image',
        iteration: iterative.iteration,
      },
    };
  }

  try {
    const imageDataUrl = await loadImageAsDataUrl(imageUrl);
    const world = await generateWorldLabsInterior({
      imageDataUrl,
      prompt: designBrief,
      filename: 'interior-reference.jpg',
    });

    const validation = runOutputValidation({
      requestedPrompt: designBrief,
      selectedOptions,
      spatialLink: world.spatialLink,
      glbUrl: world.glbUrl,
    });

    if (validation.status === 'fail') {
      return {
        success: false,
        intent: 'image_generation',
        responseType: 'text',
        message: `Output validation failed: ${validation.note} Please retry with a clearer photo or refined brief.`,
        metadata: {
          provider: 'worldlabs',
          model: 'marble',
          validation: validation.status,
          iteration: iterative.iteration,
        },
      };
    }

    const completionNote = validation.status === 'review'
      ? `${validation.note} You can send follow-up refinements and I will iterate.`
      : 'Interior world ready. You can send follow-up refinements and I will regenerate.';

    return {
      success: true,
      intent: 'image_generation',
      responseType: 'image',
      message: completionNote,
      assetUrl: world.previewImageUrl || world.spatialLink,
      assetType: '3d-world',
      metadata: {
        provider: 'worldlabs',
        model: 'marble',
        spatial_link: world.spatialLink,
        model_url: world.glbUrl,
        credits_remaining: world.creditsRemaining,
        output_validation: validation.status,
        output_validation_note: validation.note,
        iteration: iterative.iteration,
      },
    };
  } catch (error) {
    // Graceful degradation: keep the raw provider error in metadata for
    // diagnostics, but show the user a premium, non-breaking message instead
    // of a raw "no Route matched" string. Honest wording — the service is
    // temporarily unavailable, not silently "succeeding".
    const raw = error instanceof Error ? error.message : 'Interior Design generation failed.';
    const loc = input.locale || 'ka';
    const friendly =
      loc === 'en' ? 'The Interior Design engine is reconnecting to the spatial agent — please try again shortly.'
      : loc === 'ru' ? 'Движок дизайна интерьера переподключается к пространственному агенту — попробуйте чуть позже.'
      : 'ინტერიერის დიზაინის ძრავი სინქრონიზდება სპატიალურ აგენტთან — სცადეთ ცოტა ხანში.';
    return {
      success: false,
      intent: 'image_generation',
      responseType: 'text',
      message: friendly,
      metadata: {
        provider: 'worldlabs',
        model: 'marble',
        iteration: iterative.iteration,
        error: raw,
      },
    };
  }
}

async function handleMusicIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
): Promise<ChatResponse> {
  const iterative = buildIterativePrompt({
    sessionId: input.sessionId,
    serviceContext: input.serviceContext || 'music',
    message: input.message,
    selectedOptions: input.selectedOptions,
    imageUrl: input.imageUrl,
  });
  const opts = input.selectedOptions || {};
  const provider = String(
    opts.provider
      || opts.music_provider
      || opts.musicProvider
      || (hasUdioApiKey() ? 'udio' : 'replicate'),
  ).toLowerCase();

  if (provider === 'replicate') {
    return handleReplicateIntent(input, detected);
  }

  const lyricsMode = String(opts.lyrics_mode || opts.lyricsMode || '').toLowerCase();
  const styleTags = parseOptionList(opts.style_tags || opts.styleTags || opts.tags);

  // PHASE 52 TASK 5 — strict prompt mirroring. Force the genre/tempo/mood/
  // instrumentation the user TYPED into the Udio style anchor (their words go
  // first so the provider weights them highest), and honor an explicit
  // "instrumental / no vocals" ask. This is what stops a "techno" prompt from
  // drifting into a generic ambient bed. Any UI-selected style/genre/mood and
  // tags are merged in AFTER the typed keywords, so nothing is lost.
  const enforced = buildEnforcedMusicStyle(
    iterative.prompt,
    [opts.style, opts.genre, opts.mood].filter(Boolean).join(', '),
    styleTags,
  );
  const requestedInstrumental =
    parseBooleanOption(opts.make_instrumental || opts.instrumental) || lyricsMode === 'instrumental';

  try {
    const started = await startUdioGeneration({
      prompt: iterative.prompt,
      lyrics: opts.lyrics,
      // `style` now carries the mirrored anchor (typed keywords ∪ UI tags); we
      // intentionally omit the separate genre/mood/styleTags fields so they are
      // not double-appended by the Udio body builder.
      style: enforced.style,
      title: opts.title,
      model: opts.model || opts.variant,
      makeInstrumental: requestedInstrumental || enforced.forceInstrumental,
      callbackUrl: typeof input.metadata?.callback_url === 'string'
        ? input.metadata.callback_url
        : typeof input.metadata?.callbackUrl === 'string'
          ? input.metadata.callbackUrl
          : undefined,
    });

    const predictionId = toUdioPredictionId(started.workId);

    return {
      success: true,
      intent: detected.intent,
      responseType: 'audio',
      message: startedMessage(detected.intent),
      predictionId,
      predictionStatus: 'processing',
      assetType: 'audio',
      metadata: {
        provider: 'udio',
        model: started.model,
        workId: started.workId,
        confidence: detected.confidence,
        iteration: iterative.iteration,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Udio generation failed';

    // PHASE 57 — a billing/credit failure from Udio (e.g. "No credit",
    // insufficient funds, quota) must NOT be a dead end: transparently fail
    // over to the funded Replicate (Meta MusicGen) music model so the user
    // still receives a track. Mirrors the image (NanoBanana→FLUX) and video
    // (LTX→Zeroscope) failovers. A non-billing error still surfaces honestly
    // so we never mask a real bug.
    if (isProviderCreditError(errorMsg)) {
      const fallback = await handleReplicateIntent(input, detected).catch(() => null);
      if (fallback && fallback.success) {
        return {
          ...fallback,
          metadata: {
            ...fallback.metadata,
            musicFallback: 'udio->replicate',
            primaryProvider: 'udio',
            primaryProviderError: errorMsg,
          },
        };
      }
    }

    return {
      success: false,
      intent: detected.intent,
      responseType: 'text',
      message: errorMsg,
      metadata: {
        provider: 'udio',
        confidence: detected.confidence,
        iteration: iterative.iteration,
      },
    };
  }
}

/**
 * PHASE 57 — true when a provider error message indicates a billing/credit/auth
 * failure (out of funds, quota, payment, unauthorized) rather than a
 * deterministic bad-request bug. Drives the music Udio→Replicate failover.
 */
function isProviderCreditError(message: string): boolean {
  return /no credit|insufficient|insufficient_funds|top.?up|quota|exceeded|payment|balance|out of credit|unauthor|forbidden|denied|\b402\b|\b429\b/i.test(message || '');
}

async function pollUdioTask(workId: string, predictionId: string): Promise<ChatResponse> {
  const status = await getUdioGenerationStatus(workId);

  if (status.status === 'failed') {
    return {
      success: false,
      intent: 'music_generation',
      responseType: 'text',
      message: status.message || 'Music generation failed.',
      predictionId,
      predictionStatus: 'failed',
      metadata: {
        provider: 'udio',
        workId,
      },
    };
  }

  if (status.status === 'succeeded') {
    return {
      success: true,
      intent: 'music_generation',
      responseType: 'audio',
      message: readyMessage('music_generation'),
      assetUrl: status.audioUrl,
      assetType: 'audio',
      predictionId,
      predictionStatus: 'succeeded',
      metadata: {
        provider: 'udio',
        workId,
        imageUrl: status.imageUrl,
        rawStatus: status.rawStatus,
      },
    };
  }

  return {
    success: true,
    intent: 'music_generation',
    responseType: 'audio',
    message: status.message || startedMessage('music_generation'),
    predictionId,
    predictionStatus: 'processing',
    metadata: {
      provider: 'udio',
      workId,
      rawStatus: status.rawStatus,
    },
  };
}

async function handleDeterministicIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
): Promise<ChatResponse> {
  const iterative = buildIterativePrompt({
    sessionId: input.sessionId,
    serviceContext: input.serviceContext || detected.intent,
    message: input.message,
    selectedOptions: input.selectedOptions,
    imageUrl: input.imageUrl,
  });

  const response = await serviceManager.execute({
    sessionId: input.sessionId,
    serviceContext: input.serviceContext,
    intent: detected.intent,
    userPrompt: iterative.prompt,
    selectedOptions: input.selectedOptions,
    imageUrl: input.imageUrl,
    locale: input.locale,
    confidence: detected.confidence,
  });

  const mapped = toChatResponse(response, detected.intent);
  mapped.metadata.iteration = iterative.iteration;
  return mapped;
}

function toChatResponse(
  response: ServiceManagerResponse,
  intent: IntentCategory,
): ChatResponse {
  return {
    success: response.success,
    intent,
    responseType: response.responseType,
    message: response.message,
    assetUrl: response.assetUrl,
    assetType: response.assetType,
    predictionId: response.predictionId,
    predictionStatus: response.predictionStatus,
    metadata: {
      ...response.metadata,
      provider: response.provider,
    },
  };
}

// ─── Text LLM path ──────────────────────────────────────────────────────────

/**
 * Claude (Anthropic) completion. Returns a normalized ChatResponse on success,
 * or null on failure so the caller can fall back. `routedAs` records WHY Claude
 * was chosen ('specialist' = §1 complex-task lead, 'fallback' = Gemini surrendered).
 */
async function tryClaudeCompletion(
  input: OrchestratorInput,
  detected: DetectedIntent,
  systemPrompt: string,
  opts: { routedAs: 'specialist' | 'fallback'; geminiError?: string | null } = { routedAs: 'fallback' },
): Promise<ChatResponse | null> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return null;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    // Specialist work (code/science/blueprints) earns the stronger Sonnet model
    // and a larger token budget; the fallback path keeps the fast/cheap default.
    const model = process.env.ANTHROPIC_MODEL
      || (opts.routedAs === 'specialist' ? 'claude-sonnet-4-5-20250929' : 'claude-haiku-4-5-20251001');
    const msg = await anthropic.messages.create({
      model,
      max_tokens: opts.routedAs === 'specialist' ? 4096 : 1024,
      system: systemPrompt,
      messages: [
        ...input.history.map((h) => ({
          role: h.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: h.content,
        })),
        { role: 'user' as const, content: input.message },
      ],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return {
      success: true,
      intent: detected.intent,
      responseType: 'text',
      message: text || '…',
      metadata: {
        provider: 'anthropic',
        model: msg.model,
        tokensIn: msg.usage?.input_tokens,
        tokensOut: msg.usage?.output_tokens,
        confidence: detected.confidence,
        routedAs: opts.routedAs,
        ...(opts.geminiError ? { geminiFallbackFrom: opts.geminiError } : {}),
      },
    };
  } catch (error) {
    console.error(`[providerRouter] Claude ${opts.routedAs} completion failed:`, error);
    return null;
  }
}

async function handleTextIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
): Promise<ChatResponse> {
  // PHASE 49 §1 — Strict hybrid core. Gemini is PRIMARY for every default,
  // conversational and Georgian interaction; Claude is the SECONDARY SPECIALIST.
  // OpenAI stays fully out of the runtime path.
  const ctx = toGeminiServiceContext(input.serviceContext);
  const systemPrompt = withCustomInstructions(getGeminiSystemPrompt(ctx, input.locale || 'ka'), input.customInstructions);
  let geminiError: string | null = null;

  // Specialist lead: complex programming / deep science-math / large technical
  // blueprints go to Claude FIRST. If Claude is unavailable we transparently
  // fall through to the Gemini-primary path below (chat never goes dark).
  if (prefersClaudeSpecialist(input.message) && process.env.ANTHROPIC_API_KEY) {
    const specialist = await tryClaudeCompletion(input, detected, systemPrompt, { routedAs: 'specialist' });
    if (specialist) return specialist;
  }

  if (process.env.GEMINI_API_KEY) {
    const prefersPro = input.message.length > 1200 || input.history.length > 12 || ctx === 'interior' || ctx === 'business';
    // Transient Gemini conditions (model overloaded / rate-limited) are worth a
    // fast retry before surrendering to Claude — the GA endpoints intermittently
    // return 503 UNAVAILABLE under load. We retry only these (never a hung call),
    // with short backoff, so Gemini stays the primary engine instead of bleeding
    // traffic to the fallback on momentary blips.
    const isTransient = (msg: string) =>
      /\b(429|503)\b|overloaded|unavailable|resource_exhausted|rate limit|try again/i.test(msg);
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let geminiTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Hard 9s cap per attempt so a hung Gemini call can't block up to
        // maxDuration. A timeout is NOT treated as transient (no retry) — it
        // drops to the Claude fallback to preserve "zero breakdown visibility".
        const gemini = await Promise.race([
          generateWithGemini({
            prompt: input.message,
            systemPrompt,
            tier: prefersPro ? 'pro' : 'flash',
            history: input.history?.map((h) => ({
              role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
              parts: [{ text: h.content }],
            })),
            temperature: 0.6,
          }),
          new Promise<never>((_, reject) => {
            geminiTimer = setTimeout(() => reject(new Error('Gemini timeout (9s)')), 9000);
          }),
        ]);
        if (geminiTimer) clearTimeout(geminiTimer);
        return {
          success: true,
          intent: detected.intent,
          responseType: 'text',
          message: gemini.text,
          metadata: {
            provider: 'gemini',
            model: gemini.model,
            tokensIn: gemini.tokensIn,
            tokensOut: gemini.tokensOut,
            confidence: detected.confidence,
            ...(attempt > 1 ? { geminiRetries: attempt - 1 } : {}),
          },
        };
      } catch (error) {
        if (geminiTimer) clearTimeout(geminiTimer);
        geminiError = error instanceof Error ? error.message : 'Gemini request failed';
        if (isTransient(geminiError) && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 350 * attempt)); // 350ms, 700ms
          continue;
        }
        console.warn(
          `[providerRouter] Gemini text path failed after ${attempt} attempt(s), falling back to Claude:`,
          geminiError,
        );
        break;
      }
    }
  }

  // ── Claude fallback (Anthropic) — keeps chat alive when Gemini surrenders ──
  if (process.env.ANTHROPIC_API_KEY) {
    const fallback = await tryClaudeCompletion(input, detected, systemPrompt, { routedAs: 'fallback', geminiError });
    if (fallback) return fallback;
    return {
      success: false,
      intent: detected.intent,
      responseType: 'text',
      message: 'Chat is temporarily unavailable. Please try again shortly.',
      metadata: { provider: 'anthropic', ...(geminiError ? { geminiError } : {}) },
    };
  }

  // Neither provider configured / Gemini failed with no Claude fallback.
  return {
    success: false,
    intent: detected.intent,
    responseType: 'text',
    message: 'Chat is temporarily unavailable (cognitive core not configured).',
    metadata: { provider: 'gemini', error: geminiError || 'GEMINI_API_KEY / ANTHROPIC_API_KEY not configured' },
  };
}

// ─── Replicate generation path (direct, no HTTP self-fetch) ──────────────────

async function handleReplicateIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
): Promise<ChatResponse> {
  const replicateService = intentToReplicateService(detected.intent);
  if (!replicateService) {
    // Fallback to text if intent mapping fails
    return handleTextIntent(input, { ...detected, provider: 'text-llm' });
  }

  const opts = input.selectedOptions || {};
  const selectedProvider = String(
    opts.provider || opts.image_provider || opts.imageProvider || '',
  ).toLowerCase();

  const canUseNanoBanana = selectedProvider === 'nanobanana'
    && (replicateService === 'image' || input.serviceContext === 'interior');

  if (canUseNanoBanana) {
    return handleNanoBananaIntent(input, detected, opts);
  }

  // Build and validate the generation input
  const raw: Record<string, unknown> = {
    service: replicateService,
    prompt: input.message,
    quality: opts.quality?.toLowerCase() || 'high',
    variant: opts.variant?.toLowerCase() || opts.model?.toLowerCase(),
    style: opts.style?.toLowerCase(),
    aspectRatio: opts.ratio || opts.aspectRatio || opts.aspectratio,
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
  };

  const validation = validateInput(raw);
  if (!validation.valid || !validation.sanitized) {
    return {
      success: false,
      intent: detected.intent,
      responseType: 'text',
      message: validation.error || 'Invalid input for generation.',
      metadata: { provider: 'replicate', confidence: detected.confidence },
    };
  }

  const sanitized: GenerateInput = validation.sanitized;

  // Resolve the model and build its specific input
  const model = resolveModel(sanitized.service, sanitized.variant);
  const modelInput = buildModelInput(sanitized);

  try {
    const prediction = await createPrediction(model.id, modelInput);

    const responseType = mapResponseType(detected.intent);

    // If output is immediately available (sync models like blip)
    if (prediction.output) {
      const artifact = extractMediaArtifact(prediction.output, intentToMediaKind(detected.intent));

      return {
        success: true,
        intent: detected.intent,
        responseType,
        message: artifact.text || readyMessage(detected.intent),
        assetUrl: artifact.url,
        assetType: replicateService,
        predictionId: prediction.id,
        predictionStatus: 'succeeded',
        metadata: {
          provider: 'replicate',
          model: model.label,
          confidence: detected.confidence,
        },
      };
    }

    // Async prediction — return predictionId for polling
    return {
      success: true,
      intent: detected.intent,
      responseType,
      message: startedMessage(detected.intent),
      predictionId: prediction.id,
      predictionStatus: prediction.status || 'starting',
      assetType: replicateService,
      metadata: {
        provider: 'replicate',
        model: model.label,
        outputType: model.outputType,
        confidence: detected.confidence,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Replicate generation failed';
    return {
      success: false,
      intent: detected.intent,
      responseType: 'text',
      message: errorMsg,
      metadata: { provider: 'replicate', confidence: detected.confidence },
    };
  }
}

async function handleNanoBananaIntent(
  input: OrchestratorInput,
  detected: DetectedIntent,
  opts: Record<string, string>,
): Promise<ChatResponse> {
  const endpoint = resolveNanoBananaEndpoint(
    opts.nanobanana_endpoint || opts.nanobananaEndpoint || opts.endpoint,
  );

  try {
    const result = await generateNanoBananaImage({
      prompt: input.message,
      endpoint,
      aspectRatio: opts.ratio || opts.aspectRatio || opts.aspectratio,
      style: opts.style || opts.imgStyle || opts.imgstyle,
      referenceImageDataUrl: input.imageUrl,
      service: input.serviceContext || 'image',
    });

    if (result.url) {
      return {
        success: true,
        intent: detected.intent,
        responseType: 'image',
        message: readyMessage(detected.intent),
        assetUrl: result.url,
        assetType: 'image',
        metadata: {
          provider: 'nanobanana',
          model: endpoint,
          creditCost: getNanoBananaCreditCost(endpoint),
          confidence: detected.confidence,
        },
      };
    }

    return {
      success: true,
      intent: detected.intent,
      responseType: 'text',
      message: result.text || 'Task details ready.',
      metadata: {
        provider: 'nanobanana',
        model: endpoint,
        creditCost: getNanoBananaCreditCost(endpoint),
        confidence: detected.confidence,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'NanoBanana generation failed';
    return {
      success: false,
      intent: detected.intent,
      responseType: 'text',
      message: errorMsg,
      metadata: {
        provider: 'nanobanana',
        model: endpoint,
        confidence: detected.confidence,
      },
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapResponseType(intent: IntentCategory): ChatResponse['responseType'] {
  switch (intent) {
    case 'avatar_generation':
    case 'image_generation':
    case 'photo_edit':
      return 'image';
    case 'video_generation':
      return 'video';
    case 'music_generation':
      return 'audio';
    case 'visual_analysis':
      return 'analysis';
    default:
      return 'text';
  }
}

function toUdioPredictionId(workId: string): string {
  return `${UDIO_PREDICTION_PREFIX}${workId}`;
}

function extractUdioWorkId(predictionId: string): string | null {
  if (!predictionId.startsWith(UDIO_PREDICTION_PREFIX)) {
    return null;
  }

  const workId = predictionId.slice(UDIO_PREDICTION_PREFIX.length).trim();
  return workId || null;
}

function parseOptionList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : undefined;
}

function parseBooleanOption(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function intentToMediaKind(intent: IntentCategory): MediaKind {
  switch (intent) {
    case 'avatar_generation':
    case 'image_generation':
    case 'photo_edit':
      return 'image';
    case 'video_generation':
      return 'video';
    case 'music_generation':
      return 'audio';
    case 'visual_analysis':
      return 'analysis';
    default:
      return 'text';
  }
}

function startedMessage(intent: IntentCategory): string {
  switch (intent) {
    case 'avatar_generation': return 'Generating your avatar…';
    case 'image_generation': return 'Creating your image…';
    case 'photo_edit': return 'Enhancing your photo…';
    case 'video_generation': return 'Rendering your video…';
    case 'music_generation': return 'Composing your music…';
    case 'visual_analysis': return 'Analyzing the image…';
    default: return 'Processing…';
  }
}

function readyMessage(intent: IntentCategory): string {
  switch (intent) {
    case 'avatar_generation': return 'Your avatar is ready.';
    case 'image_generation': return 'Your image is ready.';
    case 'photo_edit': return 'Your enhanced photo is ready.';
    case 'video_generation': return 'Your video is ready.';
    case 'music_generation': return 'Your soundtrack is ready.';
    case 'visual_analysis': return 'Analysis complete.';
    default: return 'Done.';
  }
}
