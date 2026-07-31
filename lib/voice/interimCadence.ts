/**
 * When the recorder should run another INTERIM transcription pass.
 *
 * ⚠️ THE BUG THIS FIXES IS QUADRATIC. The recorder fires `ondataavailable` every 1.2s and each pass
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
 * O(n²), the early responsiveness that makes dictation feel live is preserved exactly, and the FINAL
 * pass on Stop is unchanged — so the finished transcript is never less accurate than before.
 */

/** Growth factor between interim passes. 1.5 keeps the first several passes ~1 chunk apart. */
const GROWTH = 1.5;

/**
 * Beyond this many chunks (~1 minute at 1.2s each) interim passes stop entirely and the text settles on
 * Stop. By then a single pass costs longer than the interval between ticks, so additional passes only
 * queue up behind each other and burn the shared rate-limit bucket without ever catching up.
 */
export const MAX_INTERIM_CHUNKS = 50;

/**
 * Given how many chunks have arrived and which chunk the last pass ran at, should we transcribe now?
 *
 * `lastPassAtChunk` of 0 means no pass has run yet.
 */
export function shouldRunInterim(chunkCount: number, lastPassAtChunk: number): boolean {
  if (!Number.isFinite(chunkCount) || chunkCount <= 0) return false;
  if (chunkCount > MAX_INTERIM_CHUNKS) return false;
  if (lastPassAtChunk <= 0) return true; // the first pass is always worth running
  return chunkCount >= nextInterimAt(lastPassAtChunk);
}

/** The chunk index at which the next pass becomes due after one ran at `lastPassAtChunk`. */
export function nextInterimAt(lastPassAtChunk: number): number {
  const n = Math.max(1, Math.floor(lastPassAtChunk));
  // Always advance by at least one chunk, so this can never spin on the same index.
  return Math.max(n + 1, Math.ceil(n * GROWTH));
}

/**
 * The pass schedule for a whole dictation — exported so the saving is measurable in a test rather than
 * asserted in a comment.
 */
export function interimSchedule(totalChunks: number): number[] {
  const out: number[] = [];
  let last = 0;
  for (let c = 1; c <= totalChunks; c++) {
    if (shouldRunInterim(c, last)) { out.push(c); last = c; }
  }
  return out;
}
