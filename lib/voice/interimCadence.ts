/**
 * When the recorder should run another INTERIM transcription pass.
 *
 * ⚠️ THE BUG THIS FIXES IS QUADRATIC. The recorder fired `ondataavailable` every 1.2s and each pass
 * uploaded `new Blob(chunks)` — the WHOLE clip so far — to /api/voice/transcribe. So at 30 seconds of
 * speech every tick shipped 30 seconds of audio and re-decoded it from the beginning. Upload size and
 * decode cost both grow linearly with time while the tick rate stays fixed, which makes total work
 * grow with the SQUARE of how long you talk. In practice the interim text falls further and further
 * behind the speaker, then jumps; and because the whole clip is re-decoded each time, words that had
 * already settled can change under the cursor.
 *
 * ⚠️ WHY NOT JUST SEND THE NEW CHUNKS. Because `chunks[0]` carries the container header — the code says
 * so at the call site — and a WebM/MP4 fragment without it is not a decodable file. Sending
 * `[header, ...newChunks]` is format-dependent and risks handing the provider a file whose timestamps
 * do not line up, which produces confidently garbled text. Garbled transcription is worse than slow
 * transcription, because the user cannot tell it went wrong.
 *
 * So the cadence backs off instead: frequent passes while the clip is short (where they are cheap and
 * most useful), then progressively rarer as it grows. Total work becomes roughly O(n log n) rather than
 * O(n²), and the FINAL pass on Stop is unchanged — so the finished transcript is never less accurate.
 *
 * ⚠️ THE CLOCK IS CAPTURED AUDIO, IN MILLISECONDS — NOT A 1.2 s TICK COUNT. The old schedule counted 1.2 s ticks
 * from the moment the timer started, so the first text could not appear before ~1.2 s of audio plus a round-trip,
 * and the first pass often carried only the silence before the user began to speak. Now:
 *
 *   · the first pass is due at FIRST_INTERIM_MS (0.9 s) of captured audio — or SPEECH_LEAD_MS (0.5 s) after the
 *     level meter first heard speech, whichever is later;
 *   · while the meter is running and has heard nothing yet, no pass runs at all (it would transcribe silence and
 *     occupy the single in-flight slot just as the first word arrives) — for at most UNGATED_AFTER_MS (3 s), so a
 *     quiet voice that never crosses the threshold still gets live text;
 *   · then passes are at least MIN_INTERIM_GAP_MS (0.9 s) apart and back off by INTERIM_GROWTH (×1.5);
 *   · past MAX_INTERIM_MS (60 s) interim passes stop and the text settles on Stop.
 *
 * SCHEDULE (speech from the start, checked every 300 ms — useDictation's TICK_MS):
 *   before: 1.2, 2.4, 3.6, 6.0, 9.6, 14.4, 21.6, 32.4, 49.2 s           → 9 interim passes, ≈140 audio-seconds sent
 *   now:    0.9, 1.8, 2.7, 4.2, 6.3, 9.6, 14.4, 21.6, 32.4, 48.6 s       → 10 interim passes, ≈142 audio-seconds sent
 *
 * COST BOUND (each pass is one Gemini call). A dictation of ANY length makes at most 10 interim calls + 1 final =
 * 11 calls, all of them inside its first minute; a 2-minute dictation (MAX_RECORD_SEC = 120) is therefore 11 calls,
 * ~1.8 % of the per-user STT_USER budget (600/hour, lib/api/rate-limit). Worst case per minute for ONE dictation is
 * those 11 calls. Passes never overlap (one in flight, at most one deferred behind it — useDictation), and a
 * deferred pass only pushes the following ones later, so a slow network can only REDUCE the count. Back-to-back
 * short dictations (each needs a tap) cost ≤ 4 calls per ~3 s utterance (0.9 / 1.8 / 2.7 + final), the same order
 * as before (1.2 / 2.4 + final); the per-IP READ bucket and STT_USER stay the brakes there.
 */

/** No interim pass before this much captured audio. */
export const FIRST_INTERIM_MS = 900;
/** The first pass waits this long after the meter first hears speech, so it carries at least a syllable. */
export const SPEECH_LEAD_MS = 500;
/** Minimum spacing between interim passes. */
export const MIN_INTERIM_GAP_MS = 900;
/** Growth factor between passes once the gap exceeds the minimum. */
export const INTERIM_GROWTH = 1.5;
/**
 * Beyond this much audio (~1 minute) interim passes stop entirely and the text settles on Stop. By then a single
 * pass costs longer than the interval between passes, so additional passes only queue up behind each other and
 * burn the rate-limit bucket without ever catching up.
 */
export const MAX_INTERIM_MS = 60_000;
/** A metered capture that has heard nothing by now runs its passes anyway (a quiet voice under the threshold). */
export const UNGATED_AFTER_MS = 3_000;

/** What the level meter knows. Omit it (or `metered: false`) when there is no meter: the cadence is then ungated. */
export interface InterimSpeech {
  /** Levels are arriving for this capture. */
  metered: boolean;
  /** Captured-audio ms at which a level first crossed the speech threshold; null = nothing heard yet. */
  onsetMs: number | null;
}

const finitePos = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** The captured-audio ms at which the next pass becomes due, after one ran at `lastPassAtMs` (0 = none yet). */
export function nextInterimAtMs(lastPassAtMs: number, speechOnsetMs: number | null = null): number {
  if (!finitePos(lastPassAtMs)) {
    return Math.max(FIRST_INTERIM_MS, (finitePos(speechOnsetMs) ? speechOnsetMs : 0) + SPEECH_LEAD_MS);
  }
  // Always advances by at least the minimum gap, so this can never spin on the same instant.
  return Math.max(lastPassAtMs + MIN_INTERIM_GAP_MS, Math.ceil(lastPassAtMs * INTERIM_GROWTH));
}

/** Given the captured audio so far and when the last pass ran, should an interim pass run now? */
export function shouldRunInterimAt(elapsedMs: number, lastPassAtMs: number, speech?: InterimSpeech): boolean {
  if (!finitePos(elapsedMs) || elapsedMs > MAX_INTERIM_MS) return false;
  const onset = speech?.metered ? speech.onsetMs : null;
  // Silent lead-in: the meter is running and has heard nothing — there is nothing to transcribe yet.
  if (speech?.metered && onset === null && !finitePos(lastPassAtMs) && elapsedMs < UNGATED_AFTER_MS) return false;
  return elapsedMs >= nextInterimAtMs(lastPassAtMs, onset);
}

/**
 * The pass schedule (captured-audio ms of each interim pass) for a dictation of `totalMs`, checked every `stepMs`
 * with passes that return instantly — the most passes the cadence can ever produce. Exported so the bound is
 * measured in a test rather than asserted in a comment.
 */
export function interimScheduleMs(totalMs: number, stepMs = 300, speech?: InterimSpeech): number[] {
  const out: number[] = [];
  if (!finitePos(stepMs)) return out;
  let last = 0;
  for (let t = stepMs; t <= totalMs; t += stepMs) {
    if (shouldRunInterimAt(t, last, speech)) { out.push(t); last = t; }
  }
  return out;
}
