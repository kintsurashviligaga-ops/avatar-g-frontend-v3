/**
 * lib/chat/musicVideoComposite.ts
 * ===============================
 * Composite handler for music-video prompts (e.g. "30-second hip-hop music
 * video with my avatar"). The default orchestrator runs ONE worker per
 * request — the highest-confidence intent wins and everything else is
 * silently dropped. For composite prompts that genuinely need lyrics +
 * beat + cinematic video, that single-winner routing produces audio-only
 * output, which is what users observe today.
 *
 * This module fans the request out:
 *
 *   ┌─ Gemini (Director Agent)  → lyrics, synchronous, ~2–5s
 *   │
 *   ├─ Udio (Music Agent)       → beat / vocal track, async predictionId
 *   │
 *   └─ ServiceManager (Video)   → cinematic 30s clip via LTX or HeyGen,
 *                                 async taskRef
 *
 * Each leg is recorded into agent_evolution_traces with wholesale + retail
 * GEL costs so the Founder Audit RPC sees real data. Failures on any leg
 * degrade gracefully — a failed video leg still ships the music + lyrics.
 *
 * Polling note (intentional limitation, documented for follow-up):
 *   The chat shell currently follows ONE predictionId at a time. This
 *   handler returns the Udio music predictionId as the primary tracker
 *   and stashes the video taskRef in metadata.compositePlan. A future
 *   pollOrchestrationTask enhancement can decode the composite ref and
 *   poll both legs in lock-step. Until then, music lands first; video
 *   ref is consumable by a dedicated client poller.
 */

import 'server-only';
import type { OrchestratorInput, ChatResponse } from './providerRouter';
import { startUdioGeneration } from '@/lib/udio/client';
import { generateWithGemini } from '@/lib/gemini/client';
import { withTrace } from '@/lib/observability/agentTrace';
import { forecastMarginForAction } from '@/lib/monetization/audit-engine';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ServiceManager } from './ServiceManager';
import { encodeCompositeRef } from './compositeTaskRef';
import { hasVideoProvider } from './videoProvider';
import { hasUdioApiKey } from './mediaKeys';

const serviceManager = new ServiceManager();

// Recognise prompts that need BOTH music AND video. Loose — the false-positive
// cost is just running the composite path on a request that would have been
// audio-only anyway, which still ships a usable audio asset.
const MUSIC_VIDEO_PATTERNS = [
  /\bmusic\s+video\b/i,
  /\b(rap|hip[- ]?hop|trap|pop|edm|rock|punk|drill)\s+(video|clip|reel)/i,
  /\b(video|clip)\b.*\b(song|track|beat|lyric|chorus|hook|verse)/i,
  /\b(song|track|beat|lyric|chorus|hook|verse)\b.*\b(video|clip|reel|mv)/i,
  /\b(perform|sing|rap)\b.*\b(in\s+a\s+)?(video|clip|reel)/i,
];

export function isMusicVideoComposite(message: string): boolean {
  if (!message) return false;
  return MUSIC_VIDEO_PATTERNS.some((rx) => rx.test(message));
}

interface CompositePlan {
  lyrics: string | null;
  musicPredictionId: string | null;
  videoTaskRef: string | null;
  videoStatus: 'queued' | 'failed' | 'skipped';
  videoError?: string;
}

interface ForecastLeg { wholesale: number; retail: number }
interface ForecastResult {
  totalRetailGel: number;
  totalWholesaleGel: number;
  marginMultiplier: number | null;
  legs: { lyrics: ForecastLeg; music: ForecastLeg; video: ForecastLeg };
}

/** Compute total retail + wholesale GEL for the composite plan. */
function forecastComposite(): ForecastResult {
  // Lyrics (chat) is free-tier — 0/0.
  // Music — voice_tts wholesale matrix is the closest cost-class match.
  // Video — video_film matrix.
  const lyrics = forecastMarginForAction('chat');
  const music = forecastMarginForAction('voice_tts');
  const video = forecastMarginForAction('video_film');
  const totalRetail = lyrics.retailGel + music.retailGel + video.retailGel;
  const totalWholesale = lyrics.wholesaleGel + music.wholesaleGel + video.wholesaleGel;
  return {
    totalRetailGel: totalRetail,
    totalWholesaleGel: totalWholesale,
    marginMultiplier: totalWholesale > 0 ? totalRetail / totalWholesale : null,
    legs: {
      lyrics: { wholesale: lyrics.wholesaleGel, retail: lyrics.retailGel },
      music: { wholesale: music.wholesaleGel, retail: music.retailGel },
      video: { wholesale: video.wholesaleGel, retail: video.retailGel },
    },
  };
}

/**
 * Read the user's wallet balance. Returns null when the row is missing or
 * the service-role client isn't configured (e.g. local dev with no DB).
 */
async function readWalletBalanceGel(userId: string): Promise<number | null> {
  try {
    const supabase = createServiceRoleClient();
    // BALANCE OF RECORD = profiles.credits_balance (what top-ups credit + the header shows +
    // the per-leg deduct charges). The legacy credits.balance_gel was backfilled once and never
    // resynced → a funded user with no `credits` row read 0 and got blocked. Read the real wallet.
    const { data, error } = await supabase
      .from('profiles')
      .select('credits_balance')
      .eq('id', userId)
      .maybeSingle();
    // null = UNKNOWN (DB error → gate fails open); 0 = confirmed no-row balance,
    // so the gate blocks an unpayable render instead of stranding the user.
    if (error) return null;
    if (!data) return 0;
    const num = Number(data.credits_balance ?? 0);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

/**
 * Run the composite pipeline. Returns a single ChatResponse to fit the
 * existing chat shell contract; the multi-asset payload lives in
 * metadata.compositePlan.
 */
export async function handleMusicVideoComposite(input: OrchestratorInput): Promise<ChatResponse> {
  const forecast = forecastComposite();

  // Stable per-request id; used to namespace per-leg debit refs so a retry
  // is idempotent and concurrent users never collide on the same ref.
  const compositeId = `composite:${input.sessionId}:${Date.now()}`;

  // ── Pre-flight: do we have enough balance? ─────────────────────────────
  // For anonymous users (userId === 'anonymous'), skip the check — the
  // existing per-action billing gate handles them downstream.
  if (input.userId && input.userId !== 'anonymous') {
    const balance = await readWalletBalanceGel(input.userId);
    if (balance !== null && balance < forecast.totalRetailGel) {
      return {
        success: false,
        intent: 'music_generation',
        responseType: 'text',
        message: `Insufficient balance for the music-video pipeline. Required: ${forecast.totalRetailGel.toFixed(2)} ₾. Current: ${balance.toFixed(2)} ₾.`,
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

  const plan: CompositePlan = {
    lyrics: null,
    musicPredictionId: null,
    videoTaskRef: null,
    videoStatus: 'queued',
  };

  // ── Leg 1: lyrics from Gemini (synchronous) ────────────────────────────
  // Don't fail the whole pipeline if lyrics fail — caller can iterate.
  try {
    if (process.env.GEMINI_API_KEY) {
      const lyricsPrompt = [
        'You are a hip-hop lyricist. Write a tight 30-second verse-chorus-verse',
        'song based on this brief. Output ONLY the lyrics. Keep each line short',
        'enough to fit on screen. End each line with a line break.',
        '',
        `Brief: ${input.message}`,
      ].join('\n');

      const lyricsResult = await withTrace(
        {
          userId: input.userId || null,
          agentId: 'content-agent',
          workerKind: 'gemini',
          action: 'compose_lyrics',
          promptSummary: input.message,
          costWholesaleGel: forecast.legs.lyrics.wholesale,
          costRetailGel: forecast.legs.lyrics.retail,
          metadata: { composite: true, leg: 'lyrics' },
          deduct: true,
          deductRef: `${compositeId}:lyrics`,
        },
        () => generateWithGemini({ prompt: lyricsPrompt, tier: 'flash' }),
        (r) => r.text?.slice(0, 200) ?? null,
      );
      plan.lyrics = lyricsResult.text ?? null;
    }
  } catch (err) {
    // Lyrics are nice-to-have. Continue.
    // eslint-disable-next-line no-console
    console.warn('[composite] lyrics leg failed:', err instanceof Error ? err.message : err);
  }

  // ── Legs 2 + 3: music + video in parallel ──────────────────────────────
  const opts = input.selectedOptions || {};
  const baseStyle = opts.style?.toLowerCase() || 'hip-hop';

  // Music leg — Udio.
  const musicPromise: Promise<string | null> = hasUdioApiKey()
    ? withTrace(
        {
          userId: input.userId || null,
          agentId: 'music-agent',
          workerKind: 'udio',
          action: 'generate_track',
          promptSummary: input.message,
          costWholesaleGel: forecast.legs.music.wholesale,
          costRetailGel: forecast.legs.music.retail,
          metadata: { composite: true, leg: 'music', style: baseStyle },
          deduct: true,
          deductRef: `${compositeId}:music`,
        },
        () =>
          startUdioGeneration({
            prompt: `${baseStyle} 30 second instrumental with vocal hook based on: ${input.message}`,
            lyrics: plan.lyrics ?? undefined,
            style: baseStyle,
            genre: baseStyle,
            makeInstrumental: false,
          }),
      )
        .then((r) => r.workId)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[composite] music leg failed:', err instanceof Error ? err.message : err);
          return null;
        })
    : Promise.resolve(null);

  // Video leg — LTX via ServiceManager. The lyrics text (when available)
  // flows into the video brief so the cinematic clip lines up with the
  // song's narrative beats.
  const videoBrief = plan.lyrics
    ? `${baseStyle} music video, 30 seconds, cinematic, performer lip-syncing the following lyrics: ${plan.lyrics.slice(0, 600)}`
    : `${baseStyle} music video, 30 seconds, cinematic, based on: ${input.message}`;

  const videoPromise: Promise<string | null> = hasVideoProvider()
    ? withTrace(
        {
          userId: input.userId || null,
          agentId: 'video-agent',
          workerKind: 'ltx',
          action: 'generate_clip',
          promptSummary: videoBrief,
          costWholesaleGel: forecast.legs.video.wholesale,
          costRetailGel: forecast.legs.video.retail,
          metadata: { composite: true, leg: 'video', style: baseStyle, durationSec: 30 },
          deduct: true,
          deductRef: `${compositeId}:video`,
        },
        () =>
          serviceManager.execute({
            sessionId: input.sessionId,
            serviceContext: 'video',
            intent: 'video_generation',
            userPrompt: videoBrief,
            selectedOptions: {
              ...opts,
              duration: '30',
              aspectRatio: opts.aspectRatio || opts.ratio || '9:16',
            },
            locale: input.locale,
          }),
        (r) => r.assetUrl || r.predictionId || null,
      )
        .then((r) => r.predictionId || r.assetUrl || null)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[composite] video leg failed:', err instanceof Error ? err.message : err);
          return null;
        })
    : Promise.resolve(null);

  const [musicWorkId, videoTaskRef] = await Promise.all([musicPromise, videoPromise]);

  plan.musicPredictionId = musicWorkId;
  plan.videoTaskRef = videoTaskRef;
  plan.videoStatus = videoTaskRef ? 'queued' : 'skipped';

  // ── Build composite response ───────────────────────────────────────────
  // The chat shell follows ONE predictionId. We encode BOTH leg refs into
  // a `composite:` token so pollOrchestrationTask can decode and poll
  // each leg in a single tick.
  const compositePredictionId = (musicWorkId || videoTaskRef)
    ? encodeCompositeRef({
        sessionId: input.sessionId,
        createdAt: Date.now(),
        musicWorkId: musicWorkId ?? undefined,
        videoTaskRef: videoTaskRef ?? undefined,
        lyrics: plan.lyrics,
      })
    : undefined;

  const summary = [
    plan.lyrics ? '✅ Lyrics composed' : '⚠️ Lyrics skipped',
    musicWorkId ? '🎵 Music generation started' : '⚠️ Music skipped (no provider)',
    videoTaskRef ? '🎬 Cinematic video clip started' : '⚠️ Video skipped (no provider)',
  ].join('\n');

  return {
    success: true,
    intent: 'music_generation',
    responseType: 'audio',
    message: summary,
    predictionId: compositePredictionId,
    predictionStatus: compositePredictionId ? 'processing' : 'failed',
    assetType: 'composite-music-video',
    metadata: {
      provider: 'composite',
      composite: true,
      compositePlan: plan,
      forecast: {
        retailGel: forecast.totalRetailGel,
        wholesaleGel: forecast.totalWholesaleGel,
        marginMultiplier: forecast.marginMultiplier,
        legs: forecast.legs,
      },
    },
  };
}
