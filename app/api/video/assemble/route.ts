/**
 * POST /api/video/assemble — final video composition dispatcher.
 *
 * Receives the compiled composition (≤5 segment URLs + per-segment + global
 * RenderSettings + master audio handles) and bridges the heavy stitch to an
 * external GPU FFmpeg worker (RunPod) over a private webhook — serverless
 * functions cannot run CUDA FFmpeg themselves.
 *
 * Guarantees:
 *   - Idempotency: a payload hash is claimed in Redis for 60s so a
 *     double-click cannot launch two render jobs (fails-open w/o Redis).
 *   - Saga: reserve credits → dispatch → commit; any failure releases the
 *     credit lock and best-effort purges the partial render.
 *   - Honest degradation: when no GPU worker (RunPod) is provisioned the stitch
 *     falls back to the bundled on-node CPU FFmpeg assembler — never a 503.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { runSaga, type SagaStep } from '@/lib/orchestrator/saga';
import {
  lockTokens, commitTokenLock, releaseTokenLock, type TokenLock,
  claimIdempotencyKey, releaseIdempotencyKey, hashPayload,
} from '@/lib/orchestrator/idempotency';
import { readRunPodConfig, dispatchRunPod, type RunPodManifest } from '@/lib/orchestrator/runpod-adapter';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { isAdminUser } from '@/lib/chat/filmComposite';
import { consumeFreeFilm, restoreFreeFilm } from '@/lib/billing/wallet-ledger';
import { reSignIfInternal, uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { muxAudioOntoVideo } from '@/lib/video/remixOps';
import { assembleWithFfmpeg } from '@/lib/orchestrator/ffmpeg-assembly';
import { type ElevenAlignment } from '@/lib/pipeline/compositing/word-synced-captions';
import { overlayCaptionsOnUrl } from '@/lib/pipeline/compositing/caption-burn';
import { composeElevenLabsMusic, hasElevenLabsMusicKey, buildElevenMusicPrompt } from '@/lib/elevenlabs/music';
import { type QaReport } from '@/lib/orchestrator/masterQa';
import { recordFilmAssembling, recordFilmMaster, recordFilmFailed } from '@/lib/chat/filmStatusStore';
import { overlayMasterUrl, hasOverlayContent, type MarketingOverlay } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import { keepLiveClips } from '@/lib/pipeline/qaAgent';
import { deriveMarketingFromBrief } from '@/lib/pipeline/marketing-from-brief';
import { textToHostedSpeech, sanitizeSpokenText } from '@/lib/chat/filmVoiceover';
import { recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { estimateFilmCostUsd } from '@/lib/pipeline/cost';
import { saveClipCheckpoints } from '@/lib/pipeline/checkpoints';
import { generateMusic } from '@/lib/ai/replicate';
// ISSUE 5 — the VIDEO pipeline uses ElevenLabs Music ONLY (MusicGen as the silent-
// safety last resort). Udio is intentionally NOT imported here so it can never score a
// video; it stays confined to the standalone /api/ai/music surface.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// STEP 3 (v331) — raised 300→600s so a cold-CPU stitch of the full 30s master plus
// the synchronous score gen completes well inside the function budget (was timing out
// at ~197s). Requires the Vercel plan to allow >300s (Fluid Compute); if the build
// rejects it, fall back to 300 — the concurrent audio bed still recovers most of the gap.
export const maxDuration = 600; // CPU FFmpeg stitch of a 30s master needs headroom (Pro/Fluid)

const ASSEMBLE_COST = 20; // credits to stitch a composition

/** True when the brief reads as a music video — drives the branded lower-third. */
function isMusicVideoBrief(brief: string | null | undefined): boolean {
  const b = (brief ?? '').toLowerCase();
  if (!b) return false;
  return /\bmusic video\b/.test(b)
    || (/\bmusic\b|\bsong\b|\bbeat\b|\bvocal|\br&b\b|\brnb\b|\bpop\b|\bhip[- ]?hop\b/.test(b) && /\bsing|\bsinger\b|\bvocal|\blyric/.test(b))
    || /მუსიკალური ვიდეო|სიმღერ|მომღერ/.test(brief ?? '');
}

/** Derive MTV-style music-bug content (artist / track / theme) from the brief. */
function deriveMusicBug(
  brief: string,
  gender: 'male' | 'female' | 'duet' | undefined,
  lang: 'ka' | 'en' | 'ru',
): { artist: string; track: string; theme: string; producer: string; lang: 'ka' | 'en' | 'ru' } {
  const b = (brief || '').toLowerCase();
  const ka = lang === 'ka';
  // Contextual theme detection.
  let theme: string;
  if (/tbilisi|თბილის/.test(b)) theme = ka ? 'თბილისის ღამეები' : 'Tbilisi City Nights';
  else if (/\blove\b|სიყვარ/.test(b)) theme = ka ? 'სიყვარულზე' : 'About Love';
  else if (/\bnight\b|ღამ/.test(b)) theme = ka ? 'ღამის განწყობა' : 'Night Vibes';
  else if (/r&b|rnb/.test(b)) theme = 'R&B';
  else if (/folk|ფოლკ/.test(b)) theme = ka ? 'პოპ-ფოლკი' : 'Pop-Folk';
  else theme = ka ? 'ორიგინალური ტრეკი' : 'Original Track';
  // Track title — evocative, theme-anchored.
  const track = /tbilisi|თბილის/.test(b)
    ? (ka ? 'ჩემო თბილისო' : 'My Tbilisi')
    : (ka ? 'ცოცხალი შესრულება' : 'Live Session');
  // Artist — the platform avatar performer, gendered (duet = both).
  const artist = ka
    ? (gender === 'duet' ? 'ავატარი · დუეტი' : gender === 'female' ? 'ავატარი · ქალი ვოკალი' : 'ავატარი · მამრობითი ვოკალი')
    : `MyAvatar · ${gender === 'duet' ? 'Duet' : gender === 'female' ? 'Female' : 'Male'} Vocal`;
  return { artist, track, theme, producer: 'MyAvatar.ge Originals', lang };
}

// Atomic dispatch deadline. A render that stalls mid-stitch (a clip URL that
// never resolves, a render-node stream that hangs at ~38%) must NOT be allowed
// to pin the function until the platform hard-kills it at maxDuration — a hard
// kill skips the saga rollback entirely, stranding the user's reserved free
// slot / debited GEL with nothing to give it back. We give dispatch a deadline
// strictly below maxDuration (300s) so the timeout fires *inside* the function:
// it aborts the in-flight work and throws, which trips the saga compensate that
// releases the lock and hands the slot/credits back instantly. Override with
// ASSEMBLE_DISPATCH_TIMEOUT_MS; clamped to a sane [30s, 290s] window.
const DISPATCH_TIMEOUT_MS = (() => {
  const raw = Number(process.env.ASSEMBLE_DISPATCH_TIMEOUT_MS);
  const fallback = 540_000; // v331 — 60s headroom under the raised 600s maxDuration
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(580_000, Math.max(30_000, Math.round(raw)));
})();

interface SegmentInput {
  url?: string;
  durationSec?: number;
  cameraMotion?: string | null;
  render?: Record<string, string | number | boolean>;
}
interface AssembleBody {
  segments?: SegmentInput[];
  voiceoverUrl?: string | null;
  /** DAY-4/5 multi-voice — per-speaker TIMECODED dialogue stems. When ≥2 distinct speakers are all timecoded,
   *  the CPU assembler spatial-premixes them (each panned) + ducks music −12 dB under the dialogue; otherwise
   *  it FAILS OPEN to voiceoverUrl. URLs are re-signed if internal. Additive — absent → the single-voice path. */
  dialogueStems?: { url: string; speaker: string; startSec: number }[] | null;
  /** Product-Ad / commercial — a voiceover SCRIPT to speak (cloned KA voice) when no
   *  ready voiceoverUrl is supplied. TTS'd server-side via textToHostedSpeech; the
   *  master then ducks the music under it exactly like an uploaded voiceover. Fail-open. */
  voiceoverScript?: string | null;
  musicUrl?: string | null;
  /** Music OFF → skip score generation entirely (voice-only film). */
  noMusic?: boolean;
  sfxUrl?: string | null;
  globalRender?: Record<string, string | number | boolean>;
  /** 'vertical' → 9:16 (1080×1920) master for TikTok/Reels/Shorts; else 16:9. */
  orientation?: string;
  /** Aliases for `orientation` — some callers send `aspect:"9:16"` / `format:"9:16"`.
   *  Resolved into the canonical orientation so a vertical request actually renders
   *  1080×1920 (the assembler accepts these, but the route used to drop them). */
  aspect?: string;
  format?: string;
  /** PHASE 47 §1 — the film's unified status-tracker id. When present, the
   *  finished master is stamped onto the storage-backed record so any client /
   *  reload can recover it via GET /api/video/status/[tokenId]. */
  filmTokenId?: string | null;
  /** PHASE 55 §2 — the film brief, used to compose a cohesive fallback score
   *  on Replicate MusicGen when the upstream Udio track is missing. */
  scorePrompt?: string | null;
  /** B2B commercials only — the director's marketing copy. When present, the finished
   *  master gets animated lower-third / price / CTA overlays burned in (fail-open). */
  marketing?: MarketingOverlay | null;
  /** v330 — explicit MUSIC VIDEO MODE (vs documentary/commercial). When true the
   *  song rules the master stream (narrator omitted, SFX ducked −12 dB under the
   *  song) and the branded music-video lower-third is burned in. When false the
   *  narration-forward documentary mix is used. Overrides the legacy brief-keyword
   *  heuristic; omitted → fall back to isMusicVideoBrief(scorePrompt). */
  musicVideoMode?: boolean;
  /** v330 — a user-supplied soundtrack (uploaded beat/song). When present it BECOMES
   *  the master music bed, bypassing BOTH the Udio score and the MusicGen fallback,
   *  and the LTX/compositing pipeline anchors onto it. */
  customAudioUrl?: string | null;
  /** v330 — caption language for the burned-in lower-third (ka/en/ru). Drives the
   *  FiraGO script + casing. Omitted → auto-detected from the brief. */
  captionLang?: 'ka' | 'en' | 'ru';
  /** v330 — selected sung-vocal gender for ElevenLabs Music (steers the AI singer).
   *  'duet' → a male + female duet. */
  vocalGender?: 'male' | 'female' | 'duet';
  /** STEP 2.3 — ElevenLabs with-timestamps alignment → word-synced burned captions on
   *  the CPU-FFmpeg master (fail-open; absent → no captions, path unchanged). */
  captionAlignment?: ElevenAlignment | null;
  /** v357 — the structured film script (scriptSchema shape). Threaded to the assembler where
   *  (under FILM_AUDIO_MIX_ENABLED) its explicit muteWindows drive the hard-mute post-pass.
   *  Validated fail-open inside the assembler; absent/malformed → the master is unchanged. */
  script?: unknown;
}

// FIX 3/4 — HARD GUARANTEE: this route never surfaces an unhandled 500. The real
// work lives in `assembleImpl`; any throw that escapes it (auth, status-store,
// re-sign, upload — anything OUTSIDE the saga) is caught here and turned into a
// STRUCTURED error the client can read and show, instead of a bare 500 that left
// the composer silently idle. Audio-provider failures already degrade to silent
// inside the saga, so they can never reach this catch.
export async function POST(req: NextRequest) {
  try {
    return await assembleImpl(req);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[assemble] UNHANDLED error → degraded to a structured 502 (never a raw 500):', err instanceof Error ? (err.stack ?? err.message) : err);
    return NextResponse.json(
      {
        error: 'assemble_error',
        reason: 'unexpected',
        message: err instanceof Error ? err.message : 'Unexpected error while assembling the video.',
      },
      { status: 502 },
    );
  }
}

async function assembleImpl(req: NextRequest) {
  // v330 — function-entry timestamp so the synchronous audio legs + the dispatch
  // deadline stay collectively under maxDuration (300s). The dispatch timeout below is
  // made RELATIVE to time already consumed so it fires inside the function (→ saga
  // compensate releases credits) rather than letting the platform hard-kill the request.
  const fnT0 = Date.now();
  const MAX_FN_MS = 600_000; // v331 — matches the raised maxDuration (was 300_000)
  let body: AssembleBody;
  try {
    body = (await req.json()) as AssembleBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // PHASE 52 TASK 4 — defend the stitch order against the two failure modes that
  // produce "missing chunk indices": (a) a clip whose URL never resolved (kept a
  // placeholder) and (b) the same sub-clip submitted twice, which would double a
  // chunk and shift every index after it. We keep the caller's order, drop
  // url-less entries, and de-duplicate by URL so the timeline is contiguous.
  const seenUrls = new Set<string>();
  const dedupedSegments = (body.segments ?? []).filter((s): s is Required<Pick<SegmentInput, 'url'>> & SegmentInput => {
    if (typeof s.url !== 'string' || s.url.length === 0) return false;
    if (seenUrls.has(s.url)) return false;
    seenUrls.add(s.url);
    return true;
  });
  // QA pass: drop any clip whose URL is DEFINITIVELY dead (hard 403/404/410) so a single
  // expired/missing clip can't make ffmpeg fail the whole stitch — the survivors still
  // assemble (partial salvage). STRICTLY fail-open: keeps clips on 200/timeout/5xx/error
  // and never empties a non-empty list. (Auto-retry can't run here — clips are dispatched
  // async and only have URLs by assemble time; see lib/pipeline/qaAgent.ts.)
  const segments = await keepLiveClips(dedupedSegments);
  // ≥1 segment. A SINGLE segment (6s film, sceneCount=1) takes the lightweight
  // single-clip path below (mux music, no multi-clip xfade stitch); ≥2 keeps the
  // full filtergraph stitch. Zero segments is still a hard error.
  if (segments.length < 1) {
    return NextResponse.json({ error: 'at least 1 ready segment required' }, { status: 400 });
  }

  // Anonymous trial renders are allowed. The expensive part — rendering the 5
  // clips — already runs for anonymous callers (dispatch is open), so gating ONLY
  // the cheap final stitch left users with rendered-but-unusable clips and the
  // "could not host the final master" dead-end. Anonymous renders skip the credit
  // / free-film saga entirely (there is no wallet to charge); the full billing
  // saga still runs unchanged for signed-in users.
  const { user } = await authedClientFromRequest(req);
  const uid = user?.id ?? null;

  // PHASE 47 §1 — flip the unified tracker to 'assembling' so a polling client
  // (or a reload) sees the editor working, not a stalled 'ready'. Fail-open.
  const filmTokenId = typeof body.filmTokenId === 'string' && body.filmTokenId.trim() ? body.filmTokenId.trim() : null;
  if (filmTokenId) await recordFilmAssembling(filmTokenId);

  // Resolve the output orientation from the explicit key OR the aspect/format
  // aliases (the assembler accepts `orientation`; callers sometimes send
  // `aspect:"9:16"` / `format:"9:16"` — those were silently dropped, so a vertical
  // request rendered 16:9). Canonicalise once here so BOTH the idempotency key and
  // the render manifest agree. Empty string → assembler default (landscape).
  const resolvedOrientation = (() => {
    const direct = String(body.orientation || '').toLowerCase();
    if (['vertical', 'square', 'portrait', 'landscape'].includes(direct)) return direct;
    const a = String(body.orientation || body.aspect || body.format || '').replace(':', 'x');
    if (a === '9x16') return 'vertical';
    if (a === '1x1') return 'square';
    if (a === '4x5') return 'portrait';
    if (a === '16x9') return 'landscape';
    return direct;
  })();

  // Idempotency — block duplicate submissions of the same composition. Anonymous
  // callers key off the film token (or a constant) since there is no user id.
  // The key MUST include every input that changes the OUTPUT bytes — orientation
  // (canvas size), music-video mode (audio mix + brand overlay) and the brief
  // (drives the LUT grade) — otherwise re-submitting the SAME segments with a new
  // orientation returns the cached wrong-size master (the 9:16→16:9 bug).
  const idemOwner = uid ?? `anon:${filmTokenId ?? 'session'}`;
  const idemKey = await hashPayload({
    u: idemOwner,
    segs: segments.map(s => s.url),
    v: body.voiceoverUrl,
    m: body.musicUrl,
    o: resolvedOrientation,
    mv: body.musicVideoMode ?? null,
    b: typeof body.scorePrompt === 'string' ? body.scorePrompt : null,
    // audit MED — include EVERY other output-changing input so re-submitting the same segments
    // with a different soundtrack / voiceover / mix / captions inside the 60s window can't return
    // the cached wrong master.
    ca: body.customAudioUrl ?? null,
    vs: typeof body.voiceoverScript === 'string' ? body.voiceoverScript.slice(0, 200) : null,
    vg: body.vocalGender ?? null,
    nm: body.noMusic ?? null,
    mk: body.marketing && hasOverlayContent(body.marketing) ? 1 : 0,
    cap: body.captionAlignment ? 1 : 0,
  });
  const fresh = await claimIdempotencyKey(idemOwner, `assemble:${idemKey}`, 60);
  if (!fresh) {
    return NextResponse.json({ error: 'duplicate_request', message: 'This composition is already being assembled.' }, { status: 409 });
  }

  // Render-path selection: GPU RunPod worker when provisioned, otherwise the
  // bundled CPU FFmpeg assembler (Option B). Either way the request completes —
  // no 503. (RunPod is the quality upgrade: GPU encode + 60fps interpolation.)
  const cfg = readRunPodConfig();

  // v330 — resolve the master mode ONCE (used by both the audio layer and the
  // burned lower-third). The explicit Music Video Mode flag wins; the legacy
  // brief-keyword heuristic is the fallback. B2B marketing films are always
  // documentary-style (their own overlay), so they never take music-video mode.
  const musicVideoMode =
    (typeof body.musicVideoMode === 'boolean' ? body.musicVideoMode : isMusicVideoBrief(body.scorePrompt)) &&
    !body.marketing;
  // Caption language for the burned lower-third: explicit, else auto-detected from the brief.
  const captionLang: 'ka' | 'en' | 'ru' =
    body.captionLang ?? (/[Ⴀ-ჿᲐ-Ჿ]/.test(body.scorePrompt ?? '') ? 'ka' : 'en');
  const brandText =
    captionLang === 'ka' ? 'მუსიკალური ვიდეო' : captionLang === 'ru' ? 'Музыкальное видео' : 'AI Music Video';
  // v330 — MTV-style music info bug content, derived from the brief + vocal gender.
  const musicBugSpec = musicVideoMode ? deriveMusicBug(body.scorePrompt ?? '', body.vocalGender, captionLang) : null;

  // STEP 3 (v331) — AUDIO BED runs CONCURRENTLY with the segment re-signing rather
  // than strictly before it, so a slow score gen (EL Music / MusicGen) no longer
  // SERIALLY eats the stitch's window — the cause of the ~197s "dispatch stalled"
  // timeout. `audioTotalSec` is derived from the RAW segments (re-signing changes
  // URLs, not durations) so the score gen can start without waiting on the re-sign.
  // Combined with the raised function budget (maxDuration 600s) the full 30s master
  // stitches comfortably inside the deadline even on a cold CPU node.
  const audioTotalSec = Math.min(30, Math.max(8, Math.round(
    segments.reduce((sum, s) => sum + (Number(s.durationSec) || 6), 0),
  )));

  // AUDIO BED — VIDEO pipeline is ElevenLabs-ONLY (ISSUE 5). ElevenLabs is the MAIN
  // engine for instrumentals + sung vocals (and ElevenLabs sound-generation already
  // powers the SFX/effects leg upstream); Replicate MusicGen is the silent-safety last
  // resort. Udio is NOT used for video — it stays on the standalone /api/ai/music
  // surface only. Fail-open at every tier — never a 500.
  //   custom upload / upstream musicUrl  >  ElevenLabs Music  >  MusicGen  >  silent
  type AudioEngine = 'custom-upload' | 'upstream' | 'elevenlabs-music' | 'musicgen' | null;
  const resolveMusicBed = async (): Promise<{ url: string | null; fallback: AudioEngine }> => {
    // A user-uploaded soundtrack (or an upstream track) is the master bed and wins.
    if (body.customAudioUrl) {
      // eslint-disable-next-line no-console
      console.log('[assemble] custom soundtrack supplied → bypassing all generators, anchoring onto the upload');
      return { url: await reSignIfInternal(body.customAudioUrl), fallback: 'custom-upload' };
    }
    if (body.musicUrl) return { url: await reSignIfInternal(body.musicUrl), fallback: 'upstream' };
    if (body.noMusic) return { url: null, fallback: null };

    // ONE shared song spec, so ElevenLabs AND the Udio fallback render the SAME brief
    // (e.g. a sung Georgian R&B track for a music video, or an instrumental film score).
    const { prompt, instrumental } = buildElevenMusicPrompt({
      brief: typeof body.scorePrompt === 'string' ? body.scorePrompt : '',
      totalSec: audioTotalSec,
      musicVideoMode,
      vocalGender: body.vocalGender,
    });

    // PRIMARY — ElevenLabs Music (instrumentals + sung vocals). Time-boxed.
    if (hasElevenLabsMusicKey()) {
      try {
        const EL_MUSIC_BUDGET_MS = 90_000;
        const { audio, contentType } = await Promise.race([
          composeElevenLabsMusic({ prompt, lengthMs: audioTotalSec * 1000, instrumental }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('elevenlabs music timed out')), EL_MUSIC_BUDGET_MS)),
        ]);
        const path = `films/elmusic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
        const url = (await uploadAndSign('uploads', path, audio.toString('base64'), contentType, 604_800)) ?? null;
        // eslint-disable-next-line no-console
        console.log('[assemble] ElevenLabs Music track ready:', url ? `yes (${instrumental ? 'instrumental' : 'sung'})` : 'no');
        if (url) return { url, fallback: 'elevenlabs-music' };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[assemble] ElevenLabs Music failed → falling back to MusicGen:', err instanceof Error ? err.message : err);
      }
    }

    // ISSUE 5 — the Udio fallback that used to sit here has been REMOVED so the video
    // pipeline never scores a film with Udio. ElevenLabs Music is the only premium
    // engine for video; if it misses we drop straight to MusicGen below.

    // FALLBACK — Replicate MusicGen (last resort before silent). Budget-guarded.
    const STITCH_RESERVE_MS = 70_000; // CPU stitch + overlay + response headroom
    const SCORE_BUDGET_MS = 120_000;
    if ((MAX_FN_MS - (Date.now() - fnT0)) > SCORE_BUDGET_MS + STITCH_RESERVE_MS && process.env.REPLICATE_API_TOKEN) {
      const brief =
        typeof body.scorePrompt === 'string' && body.scorePrompt.trim()
          ? body.scorePrompt.trim()
          : 'emotional orchestral instrumental, cohesive cinematic film score';
      try {
        const score = await Promise.race([
          generateMusic(`${brief}, ${audioTotalSec}-second continuous film score, instrumental`, audioTotalSec),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('musicgen score timed out')), SCORE_BUDGET_MS)),
        ]);
        // eslint-disable-next-line no-console
        console.log('[assemble] MusicGen score ready:', score.audioUrl ? 'yes' : 'no');
        if (score.audioUrl) return { url: score.audioUrl, fallback: 'musicgen' };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[assemble] MusicGen score fallback failed (film stays silent):', err instanceof Error ? err.message : err);
      }
    }
    return { url: null, fallback: null };
  };

  // ── PHASE 2 — SINGLE-CLIP (6s) PATH ───────────────────────────────────────────
  // A 1-scene film has no multi-clip stitch: skip the xfade filtergraph entirely.
  // Resolve the music bed and mux it straight onto the single clip (ffmpeg -map
  // 0:v -map 1:a -c:a aac -shortest, via muxAudioOntoVideo), then host + return.
  // The graphics agent runs as the usual OmniStudio post-step on this master.
  // Strictly additive: the ≥2 path below is untouched.
  if (segments.length === 1) {
    // BILLING (audit HIGH): a 6s single-clip film costs the SAME as a multi-clip master, so it
    // must reserve/charge the wallet BEFORE the paid render — this path used to return with no
    // debit (a free-render bypass). Anonymous trials + founder/admin skip billing (same rule as
    // the multi-clip saga's reserve-credits step). Reserve up front → commit on success → roll
    // back on failure, so a failed render never strands the user's credits / free slot.
    const scSkipBilling = uid === null ? true : await isAdminUser(uid);
    let scFreeFilm = false;
    let scDebited = false;
    let scLock: TokenLock | null = null;
    if (!scSkipBilling && uid) {
      scLock = await lockTokens(uid, ASSEMBLE_COST, 900);
      const freeFilm = await consumeFreeFilm(uid);
      if (typeof freeFilm === 'number' && freeFilm >= 0) {
        scFreeFilm = true; // first free film waives the charge (fail-safe: only when the DB confirms)
      } else {
        const debit = await deductCredits(uid, ASSEMBLE_COST, `assemble-single:${idemKey}`);
        scDebited = debit.ok;
        // 'skipped' (ledger RPC absent) is the only non-fatal miss — charge best-effort like the saga.
        if (!debit.ok && (debit.reason === 'insufficient' || debit.reason === 'error')) {
          if (scLock) await releaseTokenLock(scLock);
          await releaseIdempotencyKey(idemOwner, `assemble:${idemKey}`);
          const message = debit.reason === 'insufficient'
            ? 'Not enough credits for this render. Top up to continue.'
            : 'Credit ledger unavailable — please retry.';
          if (filmTokenId) await recordFilmFailed(filmTokenId, message);
          return NextResponse.json({ error: 'insufficient_credits', reason: 'insufficient_credits', message }, { status: 402 });
        }
      }
    } else {
      scFreeFilm = true; // anon trial / founder — no charge (mirrors saga bag.freeFilm)
    }

    try {
      const clipUrl = await reSignIfInternal(segments[0]!.url);
      const { url: musicUrl, fallback } = await resolveMusicBed();
      let master = clipUrl;
      if (musicUrl) {
        const muxed = await muxAudioOntoVideo(clipUrl, musicUrl, 'replace').catch(() => null);
        if (muxed) master = muxed;
      }
      // PRODUCT-AD (6s) — a spoken voiceover (a ready URL, or a SCRIPT we TTS on the
      // cloned KA voice) is mixed ON TOP of the music bed (music ducked ~12 dB). When
      // there's no music yet, the VO is muxed straight on. Additive: with no voiceover
      // the master is exactly the music-muxed clip as before.
      const voUrl = body.voiceoverUrl
        ? await reSignIfInternal(body.voiceoverUrl)
        : (typeof body.voiceoverScript === 'string' && body.voiceoverScript.trim()
            ? await textToHostedSpeech(sanitizeSpokenText(body.voiceoverScript).slice(0, 800)).catch(() => null)
            : null);
      if (voUrl) {
        const dubbed = await muxAudioOntoVideo(master, voUrl, master === clipUrl ? 'replace' : 'mix', 12).catch(() => null);
        if (dubbed) master = dubbed;
      }
      // PRODUCT-AD overlays — price chip + CTA pill + brand lower-third burned onto the
      // master (the same SVG→PNG overlay the multi-clip B2B path uses below). Bounded +
      // fail-open: a miss keeps the clean master. Only fires when the caller passed copy.
      if (body.marketing && hasOverlayContent(body.marketing)) {
        try {
          const overlaid = await Promise.race([
            overlayMasterUrl(master, body.marketing),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 60_000)),
          ]);
          if (overlaid) master = overlaid;
        } catch { /* keep the clean master */ }
      }
      // STEP 2.6 fix — word-synced captions on the SINGLE-CLIP ad too. The multi-clip path
      // burns them inside ffmpeg-assembly; the 1-scene path is URL-based, so a real 1-scene ad
      // used to get NO captions. Burn via URL here (fail-open: a miss keeps the master).
      if (body.captionAlignment) {
        const captioned = await overlayCaptionsOnUrl(master, body.captionAlignment).catch(() => null);
        if (captioned) master = captioned;
      }
      // Master produced → COMMIT the credit reservation (the charge is now earned).
      if (scLock) await commitTokenLock(scLock).catch(() => {});
      // eslint-disable-next-line no-console
      console.log('[assemble] single-clip (6s) path →', JSON.stringify({ music: musicUrl ? (fallback ?? 'present') : 'SILENT', voiceover: voUrl ? 'present' : 'none', overlay: Boolean(body.marketing && hasOverlayContent(body.marketing)), captions: Boolean(body.captionAlignment), muxed: master !== clipUrl, billed: !scSkipBilling && !scFreeFilm }));
      if (filmTokenId) await recordFilmMaster(filmTokenId, master, null).catch(() => {});
      return NextResponse.json({ url: master, qa: null, sagaId: null, filmTokenId, scoreFallback: fallback, musicUrl, freeFilm: scFreeFilm, single: true });
    } catch (err) {
      // A failed 6s render must never strand the user's credits / free slot — roll the reservation back.
      if (!scSkipBilling && uid) {
        if (scLock) await releaseTokenLock(scLock).catch(() => {});
        if (scFreeFilm) await restoreFreeFilm(uid).catch(() => {});
        else if (scDebited) await refundCredits(uid, ASSEMBLE_COST, `assemble-single-rollback:${idemKey}`).catch(() => {});
      }
      await releaseIdempotencyKey(idemOwner, `assemble:${idemKey}`).catch(() => {});
      if (filmTokenId) await recordFilmFailed(filmTokenId, 'assemble failed').catch(() => {});
      return NextResponse.json({ error: 'assemble_failed', message: err instanceof Error ? err.message : 'assemble failed' }, { status: 500 });
    }
  }

  // Media-flow sanitization (Task 3): re-sign any internal Supabase Storage object so
  // only 15-minute signed URLs cross to the render node. STEP 3 (v331) — kick off the
  // audio bed AND the re-signing CONCURRENTLY, then await both, so the score gen
  // overlaps the prep instead of running strictly before the stitch.
  const musicBedPromise = resolveMusicBed();
  const signedSegments = await Promise.all(
    segments.map(async s => ({
      url: await reSignIfInternal(s.url),
      durationSec: s.durationSec ?? 6,
      cameraMotion: s.cameraMotion ?? null,
      render: s.render ?? {},
    })),
  );
  const { url: resolvedMusicUrl, fallback: scoreFallback } = await musicBedPromise;

  // FIX 3 — one consolidated, greppable line of the FINAL audio decision so a
  // silent/odd master is diagnosable from logs alone (which provider won, whether
  // a fallback fired, and whether a spoken voiceover is present). The film proceeds
  // to stitch regardless of this outcome — silent is the accepted last resort,
  // never a 500.
  // eslint-disable-next-line no-console
  console.log('[assemble] audio resolved →', JSON.stringify({
    music: resolvedMusicUrl ? (scoreFallback ?? (body.customAudioUrl ? 'user-upload' : body.musicUrl ? 'udio' : 'present')) : 'SILENT (all music providers missed — proceeding silent, not 500)',
    voiceover: body.voiceoverUrl ? 'present' : 'none',
    musicVideoMode,
  }));

  // Product-Ad voiceover: if no ready voiceoverUrl but a SCRIPT was supplied, speak it
  // on the cloned KA voice (textToHostedSpeech). Fail-open → null (master stays
  // music-only). The assembler then ducks the music under it like any voiceover.
  const resolvedVoiceoverUrl = body.voiceoverUrl
    ? await reSignIfInternal(body.voiceoverUrl)
    : (typeof body.voiceoverScript === 'string' && body.voiceoverScript.trim()
        ? await textToHostedSpeech(sanitizeSpokenText(body.voiceoverScript).slice(0, 800)).catch(() => null)
        : null);

  // DAY-4/5 multi-voice — validate + re-sign the per-speaker dialogue stems (bounded to 16). Only stems that
  // are well-formed (url + speaker + finite startSec) AND re-sign survive; a partial set falls open to the
  // single voiceoverUrl in the assembler's 1:1 guard.
  const resolvedDialogueStems = Array.isArray(body.dialogueStems) && body.dialogueStems.length
    ? (await Promise.all(
        body.dialogueStems.slice(0, 16).map(async (s) => {
          if (!s || typeof s.url !== 'string' || !s.url.trim() || typeof s.speaker !== 'string' || !s.speaker.trim() || typeof s.startSec !== 'number' || !Number.isFinite(s.startSec)) return null;
          const url = await reSignIfInternal(s.url).catch(() => null);
          return url ? { url, speaker: s.speaker, startSec: s.startSec } : null;
        }),
      )).filter((s): s is { url: string; speaker: string; startSec: number } => Boolean(s))
    : [];

  const manifest: RunPodManifest = {
    segments: signedSegments,
    voiceoverUrl: resolvedVoiceoverUrl,
    musicUrl: resolvedMusicUrl,
    sfxUrl: body.sfxUrl ? await reSignIfInternal(body.sfxUrl) : null,
    globalRender: {
      // A film hard-cuts between scenes so the stitched master is EXACTLY
      // N·clipSec (5·6 = 30s) — no xfade (N−1)s shortfall, no pad-freeze tail.
      // This is the honest "exactly 30 seconds" fix and the beat-synced grammar a
      // music video wants. An explicit caller transition still wins (spread after).
      ...(filmTokenId ? { transition: 'cut' } : {}),
      // The brief drives the cinematic 3D LUT look in the assembler (night/neon →
      // purple-gold, golden-hour → warm amber, else neutral teal-orange).
      ...(typeof body.scorePrompt === 'string' && body.scorePrompt.trim() ? { brief: body.scorePrompt.trim() } : {}),
      // MUSIC-VIDEO BRAND LOWER-THIRD — burned INTO the stitch (reliable, no
      // post-pass round-trip). Gated on the resolved Music Video Mode so narrative
      // films never get a music-video label; B2B marketing uses its own overlay.
      // Language-tagged so the FiraGO overlay renders Georgian/Russian, not tofu.
      ...(musicVideoMode
        ? { brandLowerThird: JSON.stringify({ overlayText: brandText, website: 'MyAvatar.ge', lang: captionLang }) }
        : {}),
      // MTV-style music info bug (artist / track / theme / MyAvatar.ge Originals) —
      // faded over the opening ~4s by the assembler.
      ...(musicBugSpec ? { musicBug: JSON.stringify(musicBugSpec) } : {}),
      ...(body.globalRender ?? {}),
      ...(resolvedOrientation ? { orientation: resolvedOrientation } : {}),
      // SONG-MASTER audio mix (narrator omitted, SFX ducked −12 dB) — asserted AFTER
      // the client globalRender spread so the resolved mode is authoritative. Gated on a
      // resolved song: if BOTH score providers failed (no music bed), don't claim
      // song-master — that would drop the narrator AND have no song, leaving the film
      // silent / promoting the narrator via fall-through. Fall back to the normal mix.
      musicVideo: musicVideoMode && Boolean(resolvedMusicUrl),
    },
    pipelineId: '',
    callbackUrl: new URL('/api/video/assemble/callback', req.url).toString(),
  };

  // Saga: reserve credits (Redis lock + durable ledger debit) → dispatch →
  // commit. Failure releases the lock AND refunds the durable debit, and
  // best-effort purges the partial render.
  // Founder/admin renders run on the platform's own provider budget, so the
  // personal credit charge is skipped (their wallet may legitimately be 0 while
  // the platform LTX balance funds the real render). Billed exactly like anon.
  const skipBilling = uid === null ? true : await isAdminUser(uid);

  const steps: SagaStep[] = [
    {
      name: 'reserve-credits',
      run: async (ctx) => {
        if (skipBilling) {
          // Anonymous trial OR founder/admin — nothing to reserve, no charge.
          ctx.bag.freeFilm = true;
          return null;
        }
        if (uid === null) return null; // unreachable past skipBilling — narrows uid to string
        const lock = await lockTokens(uid, ASSEMBLE_COST, 900);
        ctx.bag.lock = lock;

        // FOUNDER PROMO — the user's FIRST 30-second film is free. consume_free_film
        // atomically burns the one free slot: >= 0 means it was granted (waive the
        // charge entirely), while -1 (none left) or null (RPC/migration absent)
        // fall through to the normal paid debit. This is FAIL-SAFE by construction:
        // we only ever skip the charge when the DB POSITIVELY confirms and decrements
        // a free slot — a missing migration can never become an infinite free loop.
        const freeFilm = await consumeFreeFilm(uid);
        if (typeof freeFilm === 'number' && freeFilm >= 0) {
          ctx.bag.freeFilm = true;
          return lock;
        }

        const debit = await deductCredits(uid, ASSEMBLE_COST, `assemble:${ctx.sagaId}`);
        ctx.bag.debited = debit.ok;
        // Fail-fast on a real rejection so we never dispatch a paid render
        // the user can't afford or that the DB couldn't record. 'skipped'
        // (RPC not provisioned) is the only non-fatal miss.
        if (!debit.ok && debit.reason === 'insufficient') throw new Error('insufficient credits');
        if (!debit.ok && debit.reason === 'error') throw new Error('credit ledger unavailable');
        return lock;
      },
      compensate: async (_r, ctx) => {
        if (skipBilling || uid === null) return; // anon / founder reserved nothing to roll back
        const lock = ctx.bag.lock as TokenLock | null | undefined;
        if (lock) await releaseTokenLock(lock);
        // Hand the free slot back when a render that consumed it fails, so a
        // broken render never silently burns the user's one free film. Only ONE
        // of these branches runs — a free render never also debited credits.
        if (ctx.bag.freeFilm) await restoreFreeFilm(uid);
        else if (ctx.bag.debited) await refundCredits(uid, ASSEMBLE_COST, `assemble-rollback:${ctx.sagaId}`);
      },
    },
    {
      name: 'dispatch',
      run: async (ctx) => {
        // ATOMIC DISPATCH DEADLINE — race the stitch against a hard timer. We
        // chain a local AbortController off the request signal (Stop button /
        // disconnect) AND the deadline, so whichever trips first cancels the
        // in-flight render: the RunPod fetch and the CPU FFmpeg downloads/exec
        // both honor this signal. On timeout we reject, which fails the saga and
        // runs reserve-credits' compensate — the user's free slot / GEL is
        // returned instantly instead of being stranded by a silent hang.
        const ac = new AbortController();
        const abort = () => ac.abort();
        if (ctx.signal) {
          if (ctx.signal.aborted) ac.abort();
          else ctx.signal.addEventListener('abort', abort, { once: true });
        }
        let timer: ReturnType<typeof setTimeout> | null = null;
        // v330 — make the deadline RELATIVE to time already spent on the synchronous
        // audio legs (EL Music / MusicGen). A fixed 270s deadline could push total past
        // maxDuration (300s) → platform hard-kill BEFORE this timer fires → saga compensate
        // skipped → stranded credits. Cap it to the remaining budget (minus a response/
        // compensate reserve) so the timer always fires inside the function.
        const effectiveDeadlineMs = Math.max(30_000, Math.min(DISPATCH_TIMEOUT_MS, MAX_FN_MS - (Date.now() - fnT0) - 15_000));
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            ac.abort();
            reject(new Error(`dispatch stalled — aborted after ${effectiveDeadlineMs}ms (budget-aware)`));
          }, effectiveDeadlineMs);
        });
        try {
          // GPU worker when configured; else stitch on this node with CPU FFmpeg.
          const work = cfg
            ? dispatchRunPod(cfg, { ...manifest, pipelineId: ctx.sagaId }, { signal: ac.signal })
            : assembleWithFfmpeg({ ...manifest, pipelineId: ctx.sagaId, captionAlignment: body.captionAlignment ?? null, script: body.script ?? null, ...(resolvedDialogueStems.length ? { dialogueStems: resolvedDialogueStems } : {}) }, ac.signal);
          const res = await Promise.race([work, deadline]);
          ctx.bag.tempUrl = res.url;
          // Supervisor QA verdict (CPU path only; RunPod path returns no qa).
          ctx.bag.qa = (res as { qa?: QaReport }).qa ?? null;
          return res.url;
        } finally {
          if (timer) clearTimeout(timer);
          if (ctx.signal) ctx.signal.removeEventListener('abort', abort);
        }
      },
      compensate: async (_r, ctx) => {
        // Only the RunPod path leaves a remote temp render to purge.
        const tempUrl = ctx.bag.tempUrl;
        const purge = process.env.RUNPOD_PURGE_WEBHOOK_URL;
        if (cfg && typeof tempUrl === 'string' && purge) {
          try {
            await fetch(purge, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
              body: JSON.stringify({ url: tempUrl }),
            });
          } catch { /* best effort */ }
        }
      },
    },
    {
      name: 'commit',
      run: async (ctx) => {
        const lock = ctx.bag.lock as TokenLock | null | undefined;
        if (lock) await commitTokenLock(lock);
        return null;
      },
    },
  ];

  const bag: Record<string, unknown> = {};
  const saga = await runSaga(steps, { signal: req.signal, bag });
  let resultUrl = typeof bag.tempUrl === 'string' ? bag.tempUrl : null;

  if (!saga.ok) {
    // PHASE 52 TASK 4 — free the idempotency reservation the instant the job
    // fails so the user can retry immediately instead of waiting out the 60s
    // double-click window on a render they already paid (and got refunded) for.
    await releaseIdempotencyKey(idemOwner, `assemble:${idemKey}`);
    // FIX 1/4 — CREDITS. When the saga aborted on a balance rejection, return a
    // dedicated, user-facing structured response (402) carrying a clear top-up
    // message — NOT a generic 502/500. The client shows this verbatim in chat so
    // the user understands WHY (and what to do) instead of a silent idle composer.
    const sagaErr = String(saga.error || '');
    if (/insufficient credits/i.test(sagaErr)) {
      const topUp =
        'You need credits to generate. Top up your account to continue. ' +
        '(New accounts include 3 free starter videos — these have been used up on this account.)';
      if (filmTokenId) await recordFilmFailed(filmTokenId, 'insufficient credits');
      return NextResponse.json(
        { error: 'insufficient_credits', reason: 'insufficient_credits', message: topUp, failedStep: saga.failedStep },
        { status: 402 },
      );
    }
    // PHASE 47 §1 — record the terminal failure so the tracker stops claiming
    // 'assembling' forever; the client's amber fallback already covers the UX.
    if (filmTokenId) await recordFilmFailed(filmTokenId, sagaErr || 'assembly failed');
    return NextResponse.json(
      { error: 'assembly_failed', reason: 'assembly_failed', failedStep: saga.failedStep, message: sagaErr || 'The editor could not assemble the final video.', compensated: saga.compensatedSteps },
      { status: 502 },
    );
  }

  // B2B commercials — use the marketing copy the client passed, or AUTO-derive it from the
  // film brief (intent classified by the director). Burn the overlays into the finished
  // master before it is recorded/delivered. Fail-open at every step: a miss keeps the master.
  // The music-video brand lower-third is now burned IN the stitch (see
  // globalRender.brandLowerThird above) — reliable, no post-pass. This block is
  // ONLY the B2B commercial overlay (price/CTA/spec lower-thirds), which still uses
  // the post-stitch burn. Bounded so it can never push the route past maxDuration.
  let marketing: MarketingOverlay | null = body.marketing ?? null;
  if (!marketing && resultUrl && typeof body.scorePrompt === 'string') {
    marketing = await deriveMarketingFromBrief(body.scorePrompt);
  }
  if (resultUrl && marketing && hasOverlayContent(marketing)) {
    try {
      const overlaid = await Promise.race([
        overlayMasterUrl(resultUrl, marketing),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 60_000)),
      ]);
      if (overlaid) resultUrl = overlaid;
    } catch {
      /* keep the clean master */
    }
  }

  // PHASE 47 §1 — stamp the finished hosted master onto the unified tracker so a
  // reload / second device can recover the playable 30s film without re-rendering.
  // The Supervisor QA verdict rides along so the recovered film carries its grade.
  const qa = (bag.qa as QaReport | null | undefined) ?? null;
  const qaSummary = qa ? { pass: qa.pass, score: qa.score, grade: qa.grade, issues: qa.issues.map((i) => i.code) } : null;
  if (filmTokenId && resultUrl) await recordFilmMaster(filmTokenId, resultUrl, qaSummary);

  // Phase 7B — checkpoint the surviving clip URLs (keyed by the film token) so a later
  // re-render / re-assemble of the same film can reuse them instead of re-paying. Fail-
  // open: a missing generation_checkpoints table (un-migrated) is a silent no-op.
  if (filmTokenId && resultUrl) {
    void saveClipCheckpoints(filmTokenId, segments.map((s, i) => ({ sceneIndex: i, clipUrl: s.url })));
  }

  // Task 2 — persist the finished film into the user's durable per-user Library
  // (generation_jobs). The studio renders through orchestrate→assemble, not the
  // produce routes, so without this the film would never appear in History. Only
  // for signed-in users (anonymous trials have no account to file it under).
  // Best-effort + fail-open: keyed by the film token so a re-stamp upserts.
  if (uid && resultUrl) {
    // Phase 6B — estimate the wholesale cost + record wall-clock duration into the
    // result JSONB (no schema change). Pure estimate for the admin cost view; never bills.
    const clipSecTotal = segments.reduce((sum, s) => sum + (Number(s.durationSec) || 6), 0);
    const cost = estimateFilmCostUsd({
      clipCount: segments.length,
      musicSec: resolvedMusicUrl ? clipSecTotal : 0,
    });
    const durationMs = Date.now() - fnT0;
    await recordCompletedFilm({
      id: filmTokenId || saga.sagaId,
      userId: uid,
      url: resultUrl,
      prompt: typeof body.scorePrompt === 'string' ? body.scorePrompt : null,
      orientation: resolvedOrientation || 'landscape',
      result: { url: resultUrl, qa: qaSummary, kind: 'film', costUsd: cost.usd, costGel: cost.gel, costBreakdown: cost.breakdown, durationMs },
      // Dedicated columns (admin queryability) — falls back to the base row if unmigrated.
      costUsd: cost.usd,
      costGel: cost.gel,
      durationMs,
    });
  }

  // Return the resolved song URL so the client can drive a HeyGen singer-performance
  // lip-sync (face frame + this vocal) instead of the destructive whole-master relip.
  return NextResponse.json({ url: resultUrl, qa, sagaId: saga.sagaId, filmTokenId, scoreFallback, musicUrl: resolvedMusicUrl, freeFilm: Boolean(bag.freeFilm) });
}
