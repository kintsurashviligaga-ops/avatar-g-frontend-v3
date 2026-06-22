/**
 * lib/chat/filmStudioClient.ts
 * ============================
 * Client-side driver for the standalone "30-Second Cinematic Film Studio"
 * (app/[locale]/studio/film). It is NOT a mock: it drives the SAME real,
 * battle-tested pipeline the chat shell uses —
 *
 *   1. POST /api/chat/orchestrate  { message, referenceImages }       → dispatch
 *      handleFilmComposite() fans out the 5 clips + audio and returns a single
 *      opaque union-poll token (`predictionId`) plus the live `metadata.film`
 *      production matrix.
 *   2. POST /api/chat/orchestrate  { predictionId, sessionId }        → poll
 *      Re-polls every leg until `film.readyToStitch` (all clips landed + score
 *      terminal) or a terminal failure / timeout.
 *   3. POST /api/video/assemble    { segments, musicUrl, filmTokenId } → stitch
 *      The authed saga reserves credits, stitches on GPU RunPod (or CPU FFmpeg)
 *      and hosts the final 30-second master, stamping it on the status tracker.
 *   4. GET  /api/video/status/[tokenId]                                → recover
 *      Recovers the hosted master if the assemble response was lost.
 *
 * The browser session (cookies) carries auth + the credit charge, exactly as in
 * MyAvatarChatV2; this module just sequences the same calls behind a bespoke UI.
 * Pure helpers (prompt shaping, cost estimate, progress mapping) are exported so
 * they can be unit-tested without the network.
 */

import { isThirtySecondFilm, FILM_SCENE_COUNT, FILM_CLIP_SEC } from './filmPipeline';
import { GEL_COST } from '@/lib/billing/gel';

// ─── Public types ──────────────────────────────────────────────────────────

export type FilmLegClientStatus = 'pending' | 'queued' | 'succeeded' | 'failed' | 'skipped';

export interface FilmClipState {
  ordinal: number;
  status: FilmLegClientStatus;
  url?: string | null;
  attempts?: number;
}

/** Mirrors the server `metadata.film` matrix (providerRouter) the client reads. */
export interface FilmStudioMatrix {
  sceneCount: number;
  seed: number;
  storyboard: FilmLegClientStatus;
  clips: FilmClipState[];
  stitch: FilmLegClientStatus;
  audio: FilmLegClientStatus;
  audioUrl?: string | null;
  /** PHASE 48 §2 — commentator/narration track; handed to the assembler as `voiceoverUrl`. */
  voiceUrl?: string | null;
  /** PHASE 49 §7 — cinematic SFX / sound-design track; handed to the assembler as `sfxUrl`. */
  sfxUrl?: string | null;
  readyToStitch?: boolean;
  statusTokenId?: string;
}

export type FilmStudioPhase =
  | 'idle'
  | 'dispatching'
  | 'rendering'
  | 'stitching'
  | 'assembled'
  | 'failed';

export interface FilmStudioProgress {
  phase: FilmStudioPhase;
  matrix: FilmStudioMatrix | null;
  message: string;
  masterUrl: string | null;
  /** First ready clip — a graceful fallback to show while the editor finishes. */
  previewUrl: string | null;
}

/** Supervisor-QA verdict on the assembled master (mirror of the server summary). */
export interface FilmQaSummary {
  pass: boolean;
  score: number;
  grade: string;
  issues: string[];
}

export interface FilmStudioResult {
  ok: boolean;
  phase: FilmStudioPhase;
  masterUrl: string | null;
  previewUrl: string | null;
  matrix: FilmStudioMatrix | null;
  /** Quality grade of the master from the server Supervisor QA gate, if any. */
  qa?: FilmQaSummary | null;
  error?: string;
}

/** Narrow an unknown JSON `qa` field to a FilmQaSummary, or null. */
function asQa(v: unknown): FilmQaSummary | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.pass !== 'boolean' || typeof o.score !== 'number' || typeof o.grade !== 'string') return null;
  const issues = Array.isArray(o.issues) ? o.issues.filter((x): x is string => typeof x === 'string') : [];
  return { pass: o.pass, score: o.score, grade: o.grade, issues };
}

export interface DriveFilmOptions {
  prompt: string;
  /** 1–3 data:/https reference images that lock the protagonist's identity. */
  referenceImages?: string[];
  /**
   * §5 Music-Video mode: a user-supplied soundtrack (data:/https URL). When set,
   * it becomes the film's music bed verbatim — overriding the generated score —
   * and the FFmpeg master ducks it under any voiceover exactly like generated
   * music. Absent → the pipeline composes a score as before.
   */
  soundtrackUrl?: string | null;
  /**
   * v330 — explicit MUSIC VIDEO mode (vs documentary/commercial). Drives the
   * song-master audio mix (narrator omitted, SFX ducked −12 dB under the song)
   * and the branded music-video lower-third. When a soundtrackUrl is supplied this
   * is implied true. Absent/false → narration-forward documentary mix.
   */
  musicVideoMode?: boolean;
  /** v330 — selected sung-vocal gender for ElevenLabs Music (steers the AI singer). */
  vocalGender?: 'male' | 'female';
  /** 'vertical' → 9:16 (1080×1920) master for TikTok/Reels/Shorts; else 16:9. */
  orientation?: 'landscape' | 'vertical';
  /** Scene-to-scene transition in the master stitch: soft 'crossfade' or hard 'cut'. */
  transition?: 'crossfade' | 'cut';
  /** Re-voice the narration in the user's TRAINED voice (RVC) before the stitch. */
  myVoiceNarration?: boolean;
  /** Verbatim dialogue from the video panel — spoken as the film's voice-over (as-is). */
  narrationScript?: string;
  /** Music OFF → no score (voice-only film). */
  noMusic?: boolean;
  /**
   * After the master is stitched, run a Wav2Lip pass so the character's LIPS move with
   * the narration — a real talking character, not just a voice-over. Keyed to the
   * master's own embedded audio; fail-open (any failure keeps the voiced cut).
   */
  lipsyncNarration?: boolean;
  /**
   * Approved storyboard frames (ordered by scene) from /api/film/storyboard.
   * When present, each becomes that scene's per-scene identity anchor, so the
   * rendered film matches the storyboard the user approved.
   */
  sceneFrames?: string[];
  /**
   * Approved LLM story scenes (ordered) from /api/film/storyboard — the clips are
   * rendered from these exact scene descriptions so the film matches the storyboard.
   */
  sceneScripts?: string[];
  locale?: string;
  signal?: AbortSignal;
  onProgress?: (p: FilmStudioProgress) => void;
  /** Defaults tuned to the route's maxDuration (300s) with headroom. */
  pollIntervalMs?: number;
  maxPollMs?: number;
  /** Max time with NO forward progress before failing fast (anti-stall). */
  stallMs?: number;
  /**
   * Resume an already-dispatched render instead of starting a new one. Used for
   * reload-recovery: the client persists the union poll token + sessionId when a
   * render starts, and on remount re-attaches to that job (skips dispatch, polls
   * straight away) so an interrupted film picks up where it left off rather than
   * being lost.
   */
  resume?: { predictionId: string; sessionId: string };
  /**
   * Fires once the union poll token is known (right after dispatch, or on
   * resume). The caller persists `{ predictionId, sessionId }` so the render can
   * be recovered after a reload; it's cleared when the run settles.
   */
  onDispatched?: (info: { predictionId: string; sessionId: string }) => void;
}

// ─── Pure helpers (unit-tested) ──────────────────────────────────────────────

/**
 * Guarantee the message routes to the 30-second-film composite. The studio's
 * free-text "script direction" may not contain the trigger phrase, so we append
 * a canonical one only when `isThirtySecondFilm` would otherwise miss.
 */
export function buildFilmPrompt(prompt: string): string {
  // Cap to stay within the orchestrate route's 4000-char `message` limit. A long
  // pasted brief was 400'ing the ENTIRE render as "Invalid request" before the
  // pipeline ever started. 3900 leaves room for the suffix appended below.
  const trimmed = String(prompt || '').trim().slice(0, 3900);
  if (!trimmed) return 'a 30-second cinematic film';
  if (isThirtySecondFilm(trimmed)) return trimmed;
  return `${trimmed} — a 30-second cinematic film`;
}

/**
 * Honest retail estimate in GEL (₾) from the real cost matrix:
 * storyboard (chat, free) + N×video_film clips + one voice_tts score track.
 * This is a forecast for display; the durable charge is metered server-side.
 */
export function estimateFilmCostGel(sceneCount: number = FILM_SCENE_COUNT): number {
  const n = Number.isFinite(sceneCount) && sceneCount > 0 ? Math.round(sceneCount) : FILM_SCENE_COUNT;
  return n * GEL_COST.video_film + GEL_COST.voice_tts;
}

/** Ordered, de-duplicated URLs of the clips that actually landed. */
export function readyClipUrls(matrix: FilmStudioMatrix | null): string[] {
  if (!matrix) return [];
  const seen = new Set<string>();
  return [...matrix.clips]
    .sort((a, b) => a.ordinal - b.ordinal)
    .filter((c) => c.status === 'succeeded' && typeof c.url === 'string' && c.url.length > 0)
    .map((c) => c.url as string)
    .filter((url) => (seen.has(url) ? false : (seen.add(url), true)));
}

/** First playable clip URL — the graceful fallback while the editor stitches. */
export function firstPreviewUrl(matrix: FilmStudioMatrix | null): string | null {
  if (!matrix) return null;
  const ready = [...matrix.clips]
    .sort((a, b) => a.ordinal - b.ordinal)
    .find((c) => typeof c.url === 'string' && c.url.length > 0);
  return ready?.url ?? null;
}

/**
 * The editor needs at least this many landed clips to assemble a film. Mirrors
 * the /api/video/assemble guard ("at least 2 ready segments required"): a single
 * clip is just a clip, not a cut.
 */
export const MIN_SALVAGE_CLIPS = 2;

/**
 * True when enough scenes have landed to salvage a watchable partial cut even
 * though the full render didn't complete cleanly — a clip leg failed OR the
 * deadline passed. This is the load-bearing decision that keeps a 4-of-5 render
 * from being thrown away: the server union reports `failed` the moment ONE clip
 * fails (it can't be a complete 5-scene cut), but the surviving clips are still
 * a real film. Pure + exported so the salvage gate is unit-testable off-network.
 */
export function canSalvagePartialCut(matrix: FilmStudioMatrix | null): boolean {
  return readyClipUrls(matrix).length >= MIN_SALVAGE_CLIPS;
}

/**
 * True once every clip leg has reached a TERMINAL state — none is still
 * `queued`/`pending`. At that point no further clip will ever land, so idling
 * until the poll deadline is pure dead time. (The server union only flips
 * `readyToStitch` when every clip ALSO succeeds AND the audio leg is terminal —
 * so a single failed clip, or a wedged Udio score, otherwise keeps the driver
 * waiting out the entire window.) Pure + exported for off-network unit tests.
 */
export function clipsSettled(matrix: FilmStudioMatrix | null): boolean {
  if (!matrix || matrix.clips.length === 0) return false;
  return !matrix.clips.some((c) => c.status === 'queued' || c.status === 'pending');
}

/**
 * True when every non-skipped clip leg SUCCEEDED — a complete N-scene cut is
 * still on the table, so it's worth waiting briefly for the Udio score to
 * finalize `readyToStitch` instead of salvaging early. Distinguishes "all clips
 * done, only audio outstanding" (keep waiting) from "a clip failed" (salvage now).
 */
export function everyClipLanded(matrix: FilmStudioMatrix | null): boolean {
  if (!matrix) return false;
  const active = matrix.clips.filter((c) => c.status !== 'skipped');
  return active.length > 0 && active.every((c) => c.status === 'succeeded');
}

/**
 * Default client patience for the full 5-clip render. LTX-2 6-second clips
 * dispatch in waves (CLIP_DISPATCH_CONCURRENCY) and each takes ~1–3 min, so the
 * union of all five realistically needs well beyond 5 minutes — the prior 5-min
 * cap surfaced as "the render timed out before enough scenes were ready." Each
 * poll is a cheap status check (not a long-running function), so a generous
 * window costs almost nothing and lets slow-but-successful renders land + salvage.
 */
export const DEFAULT_FILM_MAX_POLL_MS = 1_500_000;

/**
 * A compact, comparable signature of every leg's observable state. The driver
 * snapshots this between polls to detect a STALLED render — one frozen with no
 * forward progress at all (e.g. stuck at 0/5 because the provider jobs never
 * leave `processing` and so never flip a clip to a terminal state). Any leg
 * advancing — a clip landing, the score finalizing, stitch readiness — changes
 * the key. Pure + exported so the stall decision is unit-testable off-network.
 */
export function filmProgressKey(matrix: FilmStudioMatrix | null): string {
  if (!matrix) return 'none';
  const landed = readyClipUrls(matrix).length;
  const terminalClips = matrix.clips.filter(
    (c) => c.status === 'succeeded' || c.status === 'failed' || c.status === 'skipped',
  ).length;
  return [
    matrix.storyboard,
    landed,
    terminalClips,
    matrix.audio,
    matrix.stitch,
    matrix.readyToStitch ? 1 : 0,
  ].join('|');
}

/**
 * How long the render may make ZERO forward progress before the driver gives up
 * early. Generous enough to ride out one slow LTX clip (~1–3 min) yet well under
 * the full poll window, so a render frozen at 0/5 — the "გაჭედილია" stall —
 * surfaces an honest failure in ~5 min instead of spinning the tracker for the
 * entire 15. A render that IS landing clips keeps resetting the stall timer and
 * is therefore allowed its full patience.
 */
export const DEFAULT_FILM_STALL_MS = 720_000;

/**
 * Localized copy for the live progress line. Georgian is the canonical platform
 * language; en/ru mirror it. `{done}` / `{total}` / `{audio}` are interpolated.
 * Unknown locales fall back to English (the function default), so the existing
 * English-only callers and tests are unaffected.
 */
const PROGRESS_COPY: Record<'ka' | 'en' | 'ru', {
  dispatching: string;
  assembled: string;
  failed: string;
  working: string;
  stitching: string;
  rendering: string;
}> = {
  ka: {
    dispatching: 'წარმოება იწყება — სცენარი + 5 სცენის რენდერი…',
    assembled: 'მონტაჟი დასრულდა — თქვენი 30-წამიანი ფილმი მზად არის.',
    failed: 'რენდერი ვერ დასრულდა.',
    working: 'მუშავდება…',
    stitching: 'რედაქტორი კრებს საბოლოო ვერსიას — {done}/{total} სცენა დარენდერდა.',
    rendering: 'სცენების რენდერი — {done}/{total} მზად · საუნდტრეკი {audio}.',
  },
  en: {
    dispatching: 'Dispatching the production — storyboard + 5 scene renders…',
    assembled: 'Compilation complete — your 30-second film is ready.',
    failed: 'The render could not be completed.',
    working: 'Working…',
    stitching: 'Editor stitching the final cut — {done}/{total} scenes rendered.',
    rendering: 'Rendering scenes — {done}/{total} ready · score {audio}.',
  },
  ru: {
    dispatching: 'Запуск производства — раскадровка + рендер 5 сцен…',
    assembled: 'Монтаж завершён — ваш 30-секундный фильм готов.',
    failed: 'Рендер не удалось завершить.',
    working: 'Обработка…',
    stitching: 'Редактор собирает финальную версию — отрендерено {done}/{total} сцен.',
    rendering: 'Рендер сцен — {done}/{total} готово · саундтрек {audio}.',
  },
};

/** A short, honest status line for the progress UI (localized). */
export function summarizeProgress(
  matrix: FilmStudioMatrix | null,
  phase: FilmStudioPhase,
  locale: string = 'en',
): string {
  const c = PROGRESS_COPY[locale === 'ka' ? 'ka' : locale === 'ru' ? 'ru' : 'en'];
  if (phase === 'dispatching') return c.dispatching;
  if (phase === 'assembled') return c.assembled;
  if (phase === 'failed') return c.failed;
  if (!matrix) return c.working;
  const total = matrix.sceneCount || matrix.clips.length;
  const done = matrix.clips.filter((c) => c.status === 'succeeded').length;
  const fill = (s: string) =>
    s.replace('{done}', String(done)).replace('{total}', String(total)).replace('{audio}', String(matrix.audio));
  if (phase === 'stitching') return fill(c.stitching);
  return fill(c.rendering);
}

// ─── Internal transport ──────────────────────────────────────────────────────

interface OrchestrateLike {
  success?: boolean;
  message?: string;
  predictionId?: string;
  predictionStatus?: string;
  assetUrl?: string | null;
  metadata?: { film?: FilmStudioMatrix; [k: string]: unknown };
  // The server may send a plain string OR a structured error object (e.g. a
  // provider rejection). Typed `unknown` so callers are forced to coerce — a
  // raw object reaching the UI caused the "[object Object]" + `.slice` crash.
  error?: unknown;
}

/** Coerce any server/error value to a safe, human-readable string. */
export function asErrorText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim()) return o.message;
    if (typeof o.error === 'string' && o.error.trim()) return o.error;
    try {
      return JSON.stringify(v);
    } catch {
      return 'Unknown error';
    }
  }
  return v == null ? '' : String(v);
}

const TERMINAL_FAIL = new Set(['failed', 'error', 'canceled']);

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function postOrchestrate(body: Record<string, unknown>, signal?: AbortSignal): Promise<OrchestrateLike> {
  const res = await fetch('/api/chat/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as OrchestrateLike | null;
  if (!json) throw new Error(`orchestrate ${res.status}: empty response`);
  return json;
}

/** Mirror of MyAvatarChatV2.assembleFilm — hand the landed clips to the authed stitch. */
async function assembleMaster(
  clipUrls: string[],
  musicUrl: string | null,
  statusTokenId: string | undefined,
  scorePrompt: string,
  signal?: AbortSignal,
  orientation?: 'landscape' | 'vertical',
  voiceUrl?: string | null,
  sfxUrl?: string | null,
  transition?: 'crossfade' | 'cut',
  myVoiceNarration?: boolean,
  noMusic?: boolean,
  musicVideoMode?: boolean,
  customAudioUrl?: string | null,
  captionLang?: 'ka' | 'en' | 'ru',
  vocalGender?: 'male' | 'female',
): Promise<{ url: string; qa: FilmQaSummary | null } | null> {
  // Optionally re-voice the narration in the user's TRAINED voice before the stitch
  // (done here, not in the budget-tight assemble route). Fail-open keeps the original.
  let finalVoiceUrl = voiceUrl ?? null;
  if (myVoiceNarration && finalVoiceUrl) {
    try {
      const cr = await fetch('/api/video/voice-narration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal,
        body: JSON.stringify({ voiceoverUrl: finalVoiceUrl }),
      });
      const cj = (await cr.json().catch(() => null)) as { url?: string } | null;
      if (cj?.url) finalVoiceUrl = cj.url;
    } catch { /* keep the original TTS narration */ }
  }
  const res = await fetch('/api/video/assemble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({
      segments: clipUrls.map((url) => ({ url, durationSec: FILM_CLIP_SEC })),
      ...(musicUrl ? { musicUrl } : {}),
      // Music OFF → tell the route to skip score generation (no musicUrl + this flag).
      ...(noMusic ? { noMusic: true } : {}),
      // PHASE 48 §2 — the commentator/narration track; the FFmpeg master ducks
      // the score under it (voiceoverUrl → vocal_ducking_pct).
      ...(finalVoiceUrl ? { voiceoverUrl: finalVoiceUrl } : {}),
      // PHASE 49 §7 — cinematic SFX / sound-design, mixed under the score.
      ...(sfxUrl ? { sfxUrl } : {}),
      ...(scorePrompt.trim() ? { scorePrompt: scorePrompt.trim() } : {}),
      ...(statusTokenId ? { filmTokenId: statusTokenId } : {}),
      ...(orientation === 'vertical' ? { orientation: 'vertical' } : {}),
      // v330 — explicit Music Video mode → song-master mix + branded lower-third.
      // A supplied soundtrack implies music-video intent.
      ...(musicVideoMode || customAudioUrl ? { musicVideoMode: true } : {}),
      // v330 — a user-uploaded soundtrack: the route anchors onto it, bypassing
      // both the Udio score and the MusicGen fallback.
      ...(customAudioUrl ? { customAudioUrl } : {}),
      // v330 — caption language for the FiraGO lower-third (ka/en/ru).
      ...(captionLang ? { captionLang } : {}),
      // v330 — selected sung-vocal gender (steers the ElevenLabs Music singer).
      ...(vocalGender ? { vocalGender } : {}),
      // Scene transition (crossfade/cut). globalRender wins over the route's
      // film-token default ('cut'), so the user's choice is honoured.
      ...(transition ? { globalRender: { transition } } : {}),
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { url?: unknown; qa?: unknown } | null;
  if (!(json && typeof json.url === 'string' && json.url.length > 0)) return null;
  return { url: json.url, qa: asQa(json.qa) };
}

/** Recover an already-hosted master (+ its QA verdict) from the durable tracker. */
async function recoverMaster(statusTokenId: string, signal?: AbortSignal): Promise<{ url: string; qa: FilmQaSummary | null } | null> {
  try {
    const res = await fetch(`/api/video/status/${encodeURIComponent(statusTokenId)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { phase?: unknown; masterUrl?: unknown; qa?: unknown } | null;
    if (json && json.phase === 'assembled' && typeof json.masterUrl === 'string' && json.masterUrl.length > 0) {
      return { url: json.masterUrl, qa: asQa(json.qa) };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Orchestration driver ─────────────────────────────────────────────────────

/**
 * Drive one full film from a brief + reference images to a hosted master URL,
 * emitting honest progress against the real pipeline. Never throws on a normal
 * failure — it resolves a `FilmStudioResult` with `ok:false` + an `error`.
 */
export async function driveFilmStudio(opts: DriveFilmOptions): Promise<FilmStudioResult> {
  const {
    prompt,
    referenceImages,
    locale = 'en',
    signal,
    onProgress,
    pollIntervalMs = 4000,
    maxPollMs = DEFAULT_FILM_MAX_POLL_MS,
    stallMs = DEFAULT_FILM_STALL_MS,
  } = opts;

  const sessionId =
    opts.resume?.sessionId ??
    `session_studio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const message = buildFilmPrompt(prompt);
  const refs = (referenceImages ?? []).filter((s) => typeof s === 'string' && s.length > 0).slice(0, 3);

  const emit = (phase: FilmStudioPhase, matrix: FilmStudioMatrix | null, masterUrl: string | null) => {
    onProgress?.({
      phase,
      matrix,
      message: summarizeProgress(matrix, phase, locale),
      masterUrl,
      previewUrl: firstPreviewUrl(matrix),
    });
  };

  const fail = (error: unknown, matrix: FilmStudioMatrix | null): FilmStudioResult => {
    emit('failed', matrix, null);
    // ALWAYS resolve `error` to a string so the UI never renders "[object Object]"
    // nor crashes on `.slice` (the generationFailed regression).
    return { ok: false, phase: 'failed', masterUrl: null, previewUrl: firstPreviewUrl(matrix), matrix, error: asErrorText(error) };
  };

  try {
    // 1 ── Dispatch (or re-attach to an in-flight render after a reload)
    let predictionId: string | undefined;
    let matrix: FilmStudioMatrix | null;

    if (opts.resume?.predictionId) {
      // RESUME: skip dispatch, re-attach to the existing job by its union poll
      // token and pull the current matrix straight away. If the server can't
      // resolve it (already finished + cleared, or expired), fail gracefully so
      // the user simply re-runs — never a silent spinner on a dead token.
      predictionId = opts.resume.predictionId;
      emit('rendering', null, null);
      const first = await postOrchestrate({ predictionId, sessionId }, signal);
      predictionId = first.predictionId ?? predictionId;
      matrix = first.metadata?.film ?? null;
      if (!predictionId || !matrix) {
        return fail('This render could not be resumed — it may have already finished or expired.', matrix);
      }
    } else {
      emit('dispatching', null, null);
      const dispatch = await postOrchestrate(
        {
          message,
          sessionId,
          serviceContext: 'video',
          locale,
          ...(refs.length ? { referenceImages: refs } : {}),
          // Send orientation at DISPATCH so the clips render in the chosen shape
          // (was only sent at assemble → clips were always 9:16 then re-shaped).
          ...(opts.orientation ? { orientation: opts.orientation } : {}),
          // Approved storyboard frames → per-scene identity anchors for the render.
          ...(opts.sceneFrames?.length ? { sceneFrames: opts.sceneFrames } : {}),
          // Approved LLM story scenes → the clips render from these exact scenes.
          ...(opts.sceneScripts?.length ? { sceneScripts: opts.sceneScripts } : {}),
          // Verbatim dialogue the user typed → spoken as the film's voice-over.
          ...(opts.narrationScript?.trim() ? { narrationScript: opts.narrationScript.trim() } : {}),
          // v330 — a user-uploaded soundtrack: tell the orchestrator to SKIP the
          // ambient music-generation (Udio) leg entirely (no generation, no charge);
          // the upload becomes the master bed at assemble time.
          ...(opts.soundtrackUrl ? { soundtrackUrl: opts.soundtrackUrl } : {}),
          // v330 — Music Video mode is driven by the EXPLICIT flag only (not inferred from a
          // soundtrack), so a documentary with a custom bed is never silently turned into a
          // narrator-less music video.
          ...(opts.musicVideoMode ? { musicVideoMode: true } : {}),
        },
        signal,
      );

      predictionId = dispatch.predictionId;
      matrix = dispatch.metadata?.film ?? null;

      if (!predictionId || !matrix) {
        // No film job dispatched — surface the honest server reason (insufficient
        // credits, provider not configured, auth) instead of a silent spinner.
        return fail(
          (typeof dispatch.message === 'string' && dispatch.message.trim() ? dispatch.message : asErrorText(dispatch.error)) ||
            'The film service could not start this render.',
          matrix,
        );
      }
    }

    // Token is known — let the caller persist { predictionId, sessionId } for
    // reload-recovery (and refresh it on resume so a second reload still works).
    opts.onDispatched?.({ predictionId, sessionId });

    emit('rendering', matrix, null);

    // 2 ── Poll until ready to stitch / terminal / timeout
    const deadline = Date.now() + maxPollMs;
    let renderFailed = false;
    let renderStalled = false;
    // Stall tracking: snapshot the production signature and the wall-clock time
    // it last changed. A render that keeps landing clips resets this and earns
    // its full patience; a render frozen at 0/5 trips the stall guard below.
    let lastProgressKey = filmProgressKey(matrix);
    let lastProgressAt = Date.now();
    while (!matrix.readyToStitch && Date.now() < deadline) {
      if (predictionId === undefined) break;
      await sleep(pollIntervalMs, signal);
      const poll = await postOrchestrate({ predictionId, sessionId }, signal);
      predictionId = poll.predictionId ?? predictionId;
      if (poll.metadata?.film) matrix = poll.metadata.film;
      emit('rendering', matrix, null);

      const progressKey = filmProgressKey(matrix);
      if (progressKey !== lastProgressKey) {
        lastProgressKey = progressKey;
        lastProgressAt = Date.now();
      }
      if (poll.predictionStatus && TERMINAL_FAIL.has(poll.predictionStatus) && !matrix.readyToStitch) {
        // A leg reported terminal failure. The server union flips to `failed`
        // the moment ONE clip fails — but the clips that DID land are still a
        // real film. Don't discard them: break and let the salvage gate below
        // stitch a partial cut when ≥2 scenes survived. (Previously this
        // returned immediately, so a 4-of-5 render was thrown away even though
        // the salvage path was built for exactly this case — it was simply
        // unreachable on terminal failure, only on a clean timeout.)
        renderFailed = true;
        break;
      }
      // Early salvage: every clip leg has settled (none still rendering) but we
      // still aren't readyToStitch, AND a complete cut is no longer possible (a
      // clip failed/skipped, or the audio leg is wedged pending). There is
      // nothing left to wait for — break NOW instead of idling out the rest of
      // the poll window, and let the salvage gate stitch the survivors. When
      // every clip DID succeed we deliberately keep waiting so the Udio score
      // can finalize readyToStitch (the deadline still caps that).
      if (!matrix.readyToStitch && clipsSettled(matrix) && !everyClipLanded(matrix)) {
        renderFailed = !canSalvagePartialCut(matrix);
        break;
      }
      // Stall guard: the render has made NO forward progress for the whole stall
      // window — it's frozen (typically stuck at 0/5 because the provider jobs
      // never leave `processing`, so no clip ever flips terminal and the
      // clipsSettled break above can't fire). Spinning the tracker for the rest
      // of the 15-min deadline is pure dead time. Fail fast with an honest
      // reason — UNLESS enough scenes already landed to salvage a partial cut.
      if (!matrix.readyToStitch && Date.now() - lastProgressAt > stallMs && !canSalvagePartialCut(matrix)) {
        renderStalled = true;
        break;
      }
    }

    // The poll loop ended for one of three reasons: every scene is ready, a leg
    // failed terminally, or the deadline passed. When the full render didn't
    // complete cleanly we still salvage a partial cut if ≥2 scenes landed —
    // otherwise we route through fail() so it EMITS a terminal 'failed' (an
    // inline return would leave the last emitted phase at 'rendering', spinning
    // all 5 scenes under a red "halted" header — a contradictory tracker).
    if (!matrix.readyToStitch && !canSalvagePartialCut(matrix)) {
      return fail(
        renderStalled
          ? 'The render stalled — no scenes finished in time. This usually means the video provider rejected the jobs (out of quota / invalid key) or the wallet has no funds. Please check billing and try again.'
          : renderFailed
            ? 'One or more scenes failed to render, so the film could not be assembled.'
            : 'The render timed out before enough scenes were ready to assemble a film.',
        matrix,
      );
    }

    // 3 ── Stitch the master (authed saga: credits → GPU/CPU → host).
    // Reached when every scene is ready OR a timeout left ≥2 salvageable clips.
    emit('stitching', matrix, null);
    const clips = readyClipUrls(matrix);
    if (clips.length < MIN_SALVAGE_CLIPS) {
      return fail('Not enough scenes rendered to stitch a film (need at least 2).', matrix);
    }
    // §5 — a user soundtrack (Music-Video mode) wins over any generated score.
    const musicBed = opts.noMusic ? null : (opts.soundtrackUrl ?? matrix.audioUrl ?? null);
    // PHASE 48 §2 — commentator/narration track, when the brief asked for one.
    const voiceBed = matrix.voiceUrl ?? null;
    // PHASE 49 §7 — cinematic SFX / sound-design track, mixed under the score.
    const sfxBed = matrix.sfxUrl ?? null;
    // v330 — Music Video mode (explicit, or implied by an uploaded soundtrack) +
    // the caption language for the burned-in lower-third (the app locale).
    const musicVideoMode = Boolean(opts.musicVideoMode);
    const captionLang: 'ka' | 'en' | 'ru' = opts.locale === 'ka' ? 'ka' : opts.locale === 'ru' ? 'ru' : 'en';
    let assembled = await assembleMaster(clips, musicBed, matrix.statusTokenId, message, signal, opts.orientation, voiceBed, sfxBed, opts.transition, opts.myVoiceNarration, opts.noMusic, musicVideoMode, opts.soundtrackUrl ?? null, captionLang, opts.vocalGender);

    // 4 ── Recover if the assemble response was lost in transit
    if (!assembled && matrix.statusTokenId) {
      assembled = await recoverMaster(matrix.statusTokenId, signal);
    }

    if (!assembled) {
      // Route through fail() so a terminal 'failed' is EMITTED (the old inline
      // return left the last phase at 'stitching', wedging the UI on a spinner).
      return fail(
        'The editor could not host the final master. Showing the first rendered scene instead.',
        matrix,
      );
    }

    const master = assembled.url;
    // NOTE (v287): a Wav2Lip lip-sync pass over the WHOLE 30s master is not viable in
    // one request — cog-wav2lip needs >4 min for 30s (cold-boot + 750 frames), beyond
    // the 300s route budget even at resize_factor 3. So the film SPEAKS (the narration
    // voice-over is mixed under the score) but the master is not lip-synced here; the
    // standalone Lip-sync mode covers true talking-character output for shorter clips.
    emit('assembled', matrix, master);
    return { ok: true, phase: 'assembled', masterUrl: master, qa: assembled.qa, previewUrl: firstPreviewUrl(matrix), matrix };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, phase: 'idle', masterUrl: null, previewUrl: null, matrix: null, error: 'Canceled.' };
    }
    return fail(err instanceof Error ? err.message : 'Unexpected error while producing the film.', null);
  }
}
