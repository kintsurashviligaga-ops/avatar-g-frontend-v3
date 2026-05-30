/**
 * lib/chat/filmComposite.ts
 * =========================
 * PHASE 42 §1 — The "30-Second Film" Master Agent fan-out (server side).
 *
 * Where `musicVideoComposite` fans a brief into lyrics + one 30s clip, the film
 * pipeline runs a full production studio:
 *
 *   1. Storyboard Agent   → `planFilmScenes` splits the brief into 5 sequential
 *                           6-second scenes (deterministic, continuity-locked).
 *   2. Continuity + Video → 5 LTX clips rendered with the SAME seed + character
 *                           reference so the protagonist never mutates.
 *   3. Editor Agent       → concatenate the 5 clips into one 30s stream.
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
import type { OrchestratorInput, ChatResponse } from './providerRouter';
import { withTrace } from '@/lib/observability/agentTrace';
import { forecastMarginForAction } from '@/lib/monetization/audit-engine';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { startUdioGeneration } from '@/lib/udio/client';
import { ServiceManager } from './ServiceManager';
import {
  planFilmScenes,
  buildFilmClipRequest,
  FILM_SCENE_COUNT,
  type FilmScene,
  type FilmShared,
} from './filmPipeline';

const serviceManager = new ServiceManager();

export { isThirtySecondFilm } from './filmPipeline';

type LegStatus = 'succeeded' | 'queued' | 'failed' | 'skipped' | 'pending';

interface FilmClipResult {
  ordinal: number;
  taskRef: string | null;
  status: LegStatus;
}

interface FilmPlanSummary {
  sceneCount: number;
  seed: number;
  storyboard: LegStatus;
  clips: FilmClipResult[];
  stitch: LegStatus;
  audio: LegStatus;
  musicWorkId: string | null;
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

/** Read the user's wallet balance; null when missing or DB unconfigured. */
async function readWalletBalanceGel(userId: string): Promise<number | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('credits')
      .select('balance_gel, balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return null;
    const num = Number(data.balance_gel ?? data.balance ?? 0);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

/** Dispatch a single film clip through ServiceManager/LTX, traced for cost. */
async function renderClip(
  input: OrchestratorInput,
  scene: FilmScene,
  shared: FilmShared,
  compositeId: string,
  forecastClipWholesale: number,
  forecastClipRetail: number,
): Promise<FilmClipResult> {
  if (!process.env.LTX_VIDEO_API_KEY) {
    return { ordinal: scene.ordinal, taskRef: null, status: 'skipped' };
  }
  const clipReq = buildFilmClipRequest(scene, shared);
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
        metadata: { composite: true, leg: 'film-clip', ordinal: scene.ordinal, seed: scene.seed },
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
        }),
      (r) => r.predictionId || r.assetUrl || null,
    ).then((r) => r.predictionId || r.assetUrl || null);
    return { ordinal: scene.ordinal, taskRef, status: taskRef ? 'queued' : 'failed' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[film] clip ${scene.ordinal} failed:`, err instanceof Error ? err.message : err);
    return { ordinal: scene.ordinal, taskRef: null, status: 'failed' };
  }
}

/**
 * Run the 30-second film pipeline. Returns a single ChatResponse to fit the
 * existing chat-shell contract; the full production matrix lives in
 * `metadata.film` for the progressive agent timeline.
 */
export async function handleFilmComposite(input: OrchestratorInput): Promise<ChatResponse> {
  const opts = input.selectedOptions || {};
  const avatarReference =
    opts.avatarReference ||
    opts.characterReference ||
    (typeof input.metadata?.avatarUrl === 'string' ? input.metadata.avatarUrl : undefined) ||
    null;
  const style = opts.style || null;

  const plan = planFilmScenes(input.message, { avatarReference, style });
  const sceneCount = plan.shared.sceneCount || FILM_SCENE_COUNT;
  const forecast = forecastFilm(sceneCount);
  const clipForecast = forecastMarginForAction('video_film');

  // Stable per-request id; namespaces per-leg debit refs for idempotent retries.
  const compositeId = `film:${input.sessionId}:${Date.now()}`;

  // ── Pre-flight: balance gate (skips anonymous; downstream gate covers them) ─
  if (input.userId && input.userId !== 'anonymous') {
    const balance = await readWalletBalanceGel(input.userId);
    if (balance !== null && balance < forecast.totalRetailGel) {
      return {
        success: false,
        intent: 'video_generation',
        responseType: 'text',
        message: `Insufficient balance for the 30-second film pipeline. Required: ${forecast.totalRetailGel.toFixed(2)} ₾. Current: ${balance.toFixed(2)} ₾.`,
        metadata: {
          provider: 'composite',
          composite: true,
          insufficientBalance: true,
          requiredGel: forecast.totalRetailGel,
          balanceGel: balance,
        },
      };
    }
  }

  // ── Legs 2 + 3: render the 5 continuity-locked clips in parallel ───────────
  const clips = await Promise.all(
    plan.scenes.map((scene) =>
      renderClip(input, scene, plan.shared, compositeId, clipForecast.wholesaleGel, clipForecast.retailGel),
    ),
  );
  const anyClip = clips.some((c) => c.status === 'queued');
  const firstClipRef = clips.find((c) => c.taskRef)?.taskRef ?? null;

  // ── Leg 4: bind one cohesive audio track across the timeline (Udio) ────────
  let musicWorkId: string | null = null;
  if (anyClip && process.env.UDIO_API_KEY) {
    try {
      const audioForecast = forecastMarginForAction('voice_tts');
      musicWorkId = await withTrace(
        {
          userId: input.userId || null,
          agentId: 'music-agent',
          workerKind: 'udio',
          action: 'generate_track',
          promptSummary: input.message,
          costWholesaleGel: audioForecast.wholesaleGel,
          costRetailGel: audioForecast.retailGel,
          metadata: { composite: true, leg: 'film-audio', durationSec: plan.shared.totalSec },
          deduct: true,
          deductRef: `${compositeId}:audio`,
        },
        () =>
          startUdioGeneration({
            prompt: `Cohesive ${plan.shared.totalSec}-second cinematic score for a short film about: ${input.message}`,
            style: style || 'cinematic',
            genre: style || 'cinematic',
            makeInstrumental: true,
          }),
      ).then((r) => r.workId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[film] audio leg failed:', err instanceof Error ? err.message : err);
      musicWorkId = null;
    }
  }

  // The Editor (stitch) and Audio legs depend on the clips finishing first, so
  // they are reported as queued (the async assembler picks them up) — never
  // claimed done before the clips land.
  const filmSummary: FilmPlanSummary = {
    sceneCount,
    seed: plan.shared.seed,
    storyboard: 'succeeded',
    clips,
    stitch: anyClip ? 'queued' : 'skipped',
    audio: musicWorkId ? 'queued' : anyClip ? 'pending' : 'skipped',
    musicWorkId,
  };

  const renderedCount = clips.filter((c) => c.status === 'queued').length;
  const summary = [
    '🎬 30-Second Film pipeline started',
    `📝 Storyboard: ${sceneCount} scenes planned`,
    `🎥 Clips dispatched: ${renderedCount}/${sceneCount} (shared seed ${plan.shared.seed})`,
    anyClip ? '✂️ Editor will stitch the final cut' : '⚠️ Video skipped (no provider)',
    musicWorkId ? '🎵 Score generation started' : '⚠️ Score skipped',
  ].join('\n');

  return {
    success: anyClip,
    intent: 'video_generation',
    responseType: 'video',
    message: summary,
    predictionId: firstClipRef ?? undefined,
    predictionStatus: anyClip ? 'processing' : 'failed',
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
