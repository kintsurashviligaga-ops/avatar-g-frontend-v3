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

import { isThirtySecondFilm, FILM_SCENE_COUNT } from './filmPipeline';
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

export interface FilmStudioResult {
  ok: boolean;
  phase: FilmStudioPhase;
  masterUrl: string | null;
  previewUrl: string | null;
  matrix: FilmStudioMatrix | null;
  error?: string;
}

export interface DriveFilmOptions {
  prompt: string;
  /** 1–3 data:/https reference images that lock the protagonist's identity. */
  referenceImages?: string[];
  locale?: string;
  signal?: AbortSignal;
  onProgress?: (p: FilmStudioProgress) => void;
  /** Defaults tuned to the route's maxDuration (300s) with headroom. */
  pollIntervalMs?: number;
  maxPollMs?: number;
}

// ─── Pure helpers (unit-tested) ──────────────────────────────────────────────

/**
 * Guarantee the message routes to the 30-second-film composite. The studio's
 * free-text "script direction" may not contain the trigger phrase, so we append
 * a canonical one only when `isThirtySecondFilm` would otherwise miss.
 */
export function buildFilmPrompt(prompt: string): string {
  const trimmed = String(prompt || '').trim();
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
  error?: string;
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
): Promise<string | null> {
  const res = await fetch('/api/video/assemble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({
      segments: clipUrls.map((url) => ({ url, durationSec: 6 })),
      ...(musicUrl ? { musicUrl } : {}),
      ...(scorePrompt.trim() ? { scorePrompt: scorePrompt.trim() } : {}),
      ...(statusTokenId ? { filmTokenId: statusTokenId } : {}),
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { url?: unknown } | null;
  return json && typeof json.url === 'string' && json.url.length > 0 ? json.url : null;
}

/** Recover an already-hosted master from the durable status tracker. */
async function recoverMaster(statusTokenId: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`/api/video/status/${encodeURIComponent(statusTokenId)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { phase?: unknown; masterUrl?: unknown } | null;
    if (json && json.phase === 'assembled' && typeof json.masterUrl === 'string' && json.masterUrl.length > 0) {
      return json.masterUrl;
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
    maxPollMs = 300_000,
  } = opts;

  const sessionId = `session_studio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

  const fail = (error: string, matrix: FilmStudioMatrix | null): FilmStudioResult => {
    emit('failed', matrix, null);
    return { ok: false, phase: 'failed', masterUrl: null, previewUrl: firstPreviewUrl(matrix), matrix, error };
  };

  try {
    // 1 ── Dispatch
    emit('dispatching', null, null);
    const dispatch = await postOrchestrate(
      {
        message,
        sessionId,
        serviceContext: 'video',
        locale,
        ...(refs.length ? { referenceImages: refs } : {}),
      },
      signal,
    );

    let predictionId = dispatch.predictionId;
    let matrix: FilmStudioMatrix | null = dispatch.metadata?.film ?? null;

    if (!predictionId || !matrix) {
      // No film job dispatched — surface the honest server reason (insufficient
      // credits, provider not configured, auth) instead of a silent spinner.
      return fail(dispatch.message || dispatch.error || 'The film service could not start this render.', matrix);
    }

    emit('rendering', matrix, null);

    // 2 ── Poll until ready to stitch / terminal / timeout
    const deadline = Date.now() + maxPollMs;
    while (!matrix.readyToStitch && Date.now() < deadline) {
      if (predictionId === undefined) break;
      await sleep(pollIntervalMs, signal);
      const poll = await postOrchestrate({ predictionId, sessionId }, signal);
      predictionId = poll.predictionId ?? predictionId;
      if (poll.metadata?.film) matrix = poll.metadata.film;
      emit('rendering', matrix, null);
      if (poll.predictionStatus && TERMINAL_FAIL.has(poll.predictionStatus) && !matrix.readyToStitch) {
        return fail('One or more scenes failed to render, so the film could not be assembled.', matrix);
      }
    }

    // The poll loop ended either because every scene is ready OR the deadline
    // passed. A timeout with too few scenes is a hard fail — route it through
    // fail() so it EMITS a terminal 'failed' (the old inline return left the
    // last emitted phase at 'rendering', so the UI kept spinning all 5 scenes
    // under a red "halted" header — a contradictory tracker). But if enough
    // scenes DID land before the deadline, salvage a partial cut instead of
    // throwing the whole film away: fall through to the stitch block, which
    // assembles from whatever ready clips exist.
    const readyAtDeadline = readyClipUrls(matrix);
    if (!matrix.readyToStitch && readyAtDeadline.length < 2) {
      return fail(
        'The render timed out before enough scenes were ready to assemble a film.',
        matrix,
      );
    }

    // 3 ── Stitch the master (authed saga: credits → GPU/CPU → host).
    // Reached when every scene is ready OR a timeout left ≥2 salvageable clips.
    emit('stitching', matrix, null);
    const clips = readyClipUrls(matrix);
    if (clips.length < 2) {
      return fail('Not enough scenes rendered to stitch a film (need at least 2).', matrix);
    }
    let master = await assembleMaster(clips, matrix.audioUrl ?? null, matrix.statusTokenId, message, signal);

    // 4 ── Recover if the assemble response was lost in transit
    if (!master && matrix.statusTokenId) {
      master = await recoverMaster(matrix.statusTokenId, signal);
    }

    if (!master) {
      // Route through fail() so a terminal 'failed' is EMITTED (the old inline
      // return left the last phase at 'stitching', wedging the UI on a spinner).
      return fail(
        'The editor could not host the final master. Showing the first rendered scene instead.',
        matrix,
      );
    }

    emit('assembled', matrix, master);
    return { ok: true, phase: 'assembled', masterUrl: master, previewUrl: firstPreviewUrl(matrix), matrix };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, phase: 'idle', masterUrl: null, previewUrl: null, matrix: null, error: 'Canceled.' };
    }
    return fail(err instanceof Error ? err.message : 'Unexpected error while producing the film.', null);
  }
}
