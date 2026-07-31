/**
 * Trim-window resolution for a multi-clip sequence — the step that decides which clips survive the stitch.
 *
 * ⚠️ THE BUG THIS EXISTS TO KILL. The trim window for every clip was measured in the BROWSER, by loading the
 * file into a `<video>` element and reading `duration`. That works right up until the browser cannot decode
 * the container — an iPhone HEVC `.mov` on desktop Chrome, a 10-bit clip, an exotic codec — and then
 * `onerror` fires, the duration is recorded as 0, and the segment becomes `{ start: 0, end: 0 }`.
 *
 * Downstream, both the route and `runSequence` filter on `end > start`. So the clip was accepted by the
 * picker, drawn in the timeline, uploaded in full, and then DISAPPEARED from the render with no error
 * anywhere — the export just came back one clip short. That is the silent drop.
 *
 * The fix inverts who is authoritative. A window the browser could not measure is no longer a
 * zero-length window; it is an OPEN one, meaning "from `start` to wherever this clip actually ends", and
 * the server — which has ffmpeg and therefore decodes everything the browser cannot — fills it in.
 *
 * Pure module on purpose: no ffmpeg, no Supabase, no `node:` imports, so the drop/keep decision is unit
 * testable on its own. The measuring lives in surgicalOps; only the ARITHMETIC lives here.
 */

/** A requested window. `end <= start` means OPEN — "run to the real end of the source". */
export interface SeqWindow {
  src: number;
  start: number;
  end: number;
}

/** Why a clip did not make it into the render. Surfaced to the user; never swallowed. */
export type DropReason = 'bad-source-index' | 'unmeasurable' | 'zero-length';

export interface DroppedWindow {
  index: number;
  src: number;
  reason: DropReason;
}

export interface ResolvedWindows<T extends SeqWindow> {
  /** Windows that will actually be rendered, in the caller's order, with every `end` a real number. */
  kept: T[];
  /** Windows that could not be rendered, with the reason. The caller MUST report these. */
  dropped: DroppedWindow[];
}

/** A window whose end the browser could not supply. Anything at or below start is "unknown", not "empty". */
export function isOpenEnded(w: SeqWindow): boolean {
  return !Number.isFinite(w.end) || !Number.isFinite(w.start) || w.end <= w.start;
}

/**
 * Which source indices need a server-side duration probe. Only the ones carrying an open window — a
 * sequence whose durations all came through fine costs nothing, so the probe never becomes a tax on the
 * common case.
 */
export function sourcesNeedingDuration(windows: readonly SeqWindow[], sourceCount: number): number[] {
  const need = new Set<number>();
  for (const w of windows) {
    if (!Number.isInteger(w.src) || w.src < 0 || w.src >= sourceCount) continue;
    if (isOpenEnded(w)) need.add(w.src);
  }
  return [...need].sort((a, b) => a - b);
}

/**
 * Shortest window we will render. Below this a segment is a single frame or less, which ffmpeg's `trim`
 * turns into an empty stream that then breaks the concat graph for every OTHER clip — so one bad window
 * would take the whole export down with it. Dropping it and SAYING SO is the honest trade.
 */
export const MIN_WINDOW_SEC = 0.1;

/**
 * Fill in every open window from measured source durations, and separate what survives from what does not.
 *
 * `durations[src]` is the real length of that source in seconds, or 0/undefined when even ffmpeg could not
 * measure it (a truly corrupt upload). Note the asymmetry that matters: a clip the BROWSER could not read
 * is recovered here, while a clip FFMPEG could not read is genuinely unusable and is reported as such.
 */
export function resolveSegmentWindows<T extends SeqWindow>(
  windows: readonly T[],
  durations: readonly number[],
  sourceCount: number,
): ResolvedWindows<T> {
  const kept: T[] = [];
  const dropped: DroppedWindow[] = [];

  windows.forEach((w, index) => {
    if (!w || !Number.isInteger(w.src) || w.src < 0 || w.src >= sourceCount) {
      dropped.push({ index, src: w?.src ?? -1, reason: 'bad-source-index' });
      return;
    }
    const start = Number.isFinite(w.start) && w.start > 0 ? w.start : 0;

    if (!isOpenEnded(w)) {
      if (w.end - start < MIN_WINDOW_SEC) {
        dropped.push({ index, src: w.src, reason: 'zero-length' });
        return;
      }
      kept.push({ ...w, start, end: w.end });
      return;
    }

    const measured = durations[w.src];
    // No measurement, or a start point past the end of the source — nothing left to render.
    if (!Number.isFinite(measured) || (measured ?? 0) - start < MIN_WINDOW_SEC) {
      dropped.push({ index, src: w.src, reason: 'unmeasurable' });
      return;
    }
    kept.push({ ...w, start, end: measured as number });
  });

  return { kept, dropped };
}

/**
 * `Duration: 00:01:23.45` out of ffmpeg's stderr banner, in seconds. Returns 0 when absent or N/A —
 * a live stream, or a container ffmpeg opened but could not measure.
 */
export function parseFfmpegDuration(stderr: string): number {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/i.exec(stderr);
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(s)) return 0;
  return h * 3600 + min * 60 + s + frac;
}
