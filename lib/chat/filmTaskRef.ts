/**
 * lib/chat/filmTaskRef.ts
 * =======================
 * PHASE 43 §1 — Wire-format for the "Union Poll Codec" of the 30-second film.
 *
 * The chat shell's poll loop follows ONE predictionId at a time. The film
 * pipeline, however, fans out into a full production matrix: 5 continuity-locked
 * LTX clips + one cohesive audio track + a final editor (stitch) leg. To track
 * the whole matrix through a single tracker, we encode every async leg's
 * reference into one base64url token prefixed with `film:`:
 *
 *   film:<base64url(JSON({v, sessionId, createdAt, seed, sceneCount, clips, musicWorkId}))>
 *
 * `pollOrchestrationTask` detects the prefix, decodes the token, and polls EACH
 * clip + the audio leg in lock-step (see `pollFilmTask` in providerRouter.ts),
 * reporting the union status. The render phase resolves only when every
 * non-skipped clip lands; the editor (stitch) leg then becomes ready-to-assemble
 * and the authenticated client fires the real `/api/video/assemble` to mount the
 * fully stitched + audio-synced master.
 *
 * Legs are self-describing (each clip carries its own taskRef + dispatch status)
 * so skipped/failed clips round-trip cleanly without a separate side-channel.
 */

export const FILM_PREFIX = 'film:';

/** Dispatch-time status of a single clip leg, as known when the token is minted. */
export type FilmClipDispatchStatus = 'queued' | 'failed' | 'skipped' | 'pending';

export interface FilmClipRef {
  ordinal: number;
  /** ServiceManager taskRef / predictionId for this clip's LTX render. */
  taskRef: string | null;
  /** Status at dispatch time (queued = a real provider job is in flight). */
  status: FilmClipDispatchStatus;
  /** How many dispatch attempts the master agent made (§3 retry telemetry). */
  attempts?: number;
}

export interface FilmTaskRef {
  v: 1;
  sessionId: string;
  createdAt: number;
  /** Shared seed locking character continuity across all clips. */
  seed: number;
  sceneCount: number;
  clips: FilmClipRef[];
  /** Udio workId for the cohesive score (NOT prefixed with `udio:` — bare). */
  musicWorkId: string | null;
  /**
   * PHASE 48 §2 — already-resolved signed URL of the commentator / narration
   * voice-over (minted synchronously at dispatch; TTS is fast, unlike the async
   * music workId). Optional + backward-compatible: older tokens without it decode
   * fine and simply carry no spoken track. The assembler passes it as
   * `voiceoverUrl` and the FFmpeg master ducks the score under it.
   */
  voiceUrl?: string | null;
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function encodeFilmRef(ref: Omit<FilmTaskRef, 'v'>): string {
  const payload: FilmTaskRef = { v: 1, ...ref };
  return `${FILM_PREFIX}${b64urlEncode(JSON.stringify(payload))}`;
}

export function decodeFilmRef(token: string): FilmTaskRef | null {
  if (!token.startsWith(FILM_PREFIX)) return null;
  try {
    const json = b64urlDecode(token.slice(FILM_PREFIX.length));
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed
      && typeof parsed === 'object'
      && (parsed as { v?: unknown }).v === 1
      && Array.isArray((parsed as { clips?: unknown }).clips)
    ) {
      return parsed as FilmTaskRef;
    }
    return null;
  } catch {
    return null;
  }
}

export function isFilmRef(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.startsWith(FILM_PREFIX);
}

/* ─── Union status math (pure, runtime-agnostic, unit-testable) ──────────────── */

/** Runtime status of a leg as resolved by a single poll tick. */
export type FilmLegRuntimeStatus = 'pending' | 'succeeded' | 'failed' | 'skipped';

/** Editor (stitch) leg state derived from the clip + audio matrix. */
export type FilmStitchStatus = 'pending' | 'ready' | 'blocked';

export interface FilmUnion {
  /** True once no clip is pending and the audio leg is terminal. */
  renderSettled: boolean;
  allClipsSucceeded: boolean;
  anyClipPending: boolean;
  anyClipFailed: boolean;
  /** True only when every non-skipped clip landed AND audio is terminal. */
  readyToStitch: boolean;
  /** Overall render-phase status surfaced as predictionStatus. */
  filmStatus: 'processing' | 'succeeded' | 'failed';
  stitchStatus: FilmStitchStatus;
}

/**
 * Compute the union status of the film matrix from the legs' runtime statuses.
 *
 * Contract (PHASE 43 §1):
 *   - `processing` while any clip is pending OR the audio leg is still pending.
 *   - `succeeded` only when EVERY non-skipped clip landed AND audio is terminal
 *     (the editor can now stitch — `readyToStitch` is true).
 *   - `failed` when the matrix is settled but a clip leg failed (the film can't
 *     be a complete 5-scene cut) — surviving clips are NOT discarded.
 */
export function computeFilmUnion(
  clipStatuses: FilmLegRuntimeStatus[],
  audioStatus: FilmLegRuntimeStatus,
): FilmUnion {
  const clipLegs = clipStatuses.filter((s) => s !== 'skipped');
  const anyClipPending = clipLegs.some((s) => s === 'pending');
  const allClipsSucceeded = clipLegs.length > 0 && clipLegs.every((s) => s === 'succeeded');
  const anyClipFailed = clipLegs.some((s) => s === 'failed');
  const audioTerminal = audioStatus !== 'pending'; // succeeded | failed | skipped

  const renderSettled = !anyClipPending && audioTerminal;
  const readyToStitch = allClipsSucceeded && audioTerminal;

  const filmStatus: FilmUnion['filmStatus'] = !renderSettled
    ? 'processing'
    : allClipsSucceeded
      ? 'succeeded'
      : 'failed';

  const stitchStatus: FilmStitchStatus = readyToStitch
    ? 'ready'
    : anyClipFailed && !anyClipPending
      ? 'blocked'
      : 'pending';

  return { renderSettled, allClipsSucceeded, anyClipPending, anyClipFailed, readyToStitch, filmStatus, stitchStatus };
}
