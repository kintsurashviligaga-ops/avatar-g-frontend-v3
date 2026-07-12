/**
 * lib/voice/sentenceStream.ts
 * ===========================
 * PHASE 33 (VECTOR 2) — pure, unit-testable sentence accumulator for the low-latency voice loop.
 *
 * The old voice turn waited for the LLM's ENTIRE reply before any TTS started (a full LLM round-trip of
 * dead air). The new turn streams the LLM output and speaks each sentence the instant it's complete, so
 * time-to-first-audio drops from (full reply + first synth) to (first sentence + first synth). This module
 * owns the boundary logic: fed a stream of text deltas, it yields COMPLETE sentences as soon as they close,
 * and buffers the incomplete tail. No DOM, no network — just string math, so it's fully testable.
 *
 * Boundaries: sentence-ending punctuation (. ! ? … ;) followed by whitespace/end, or a newline. A run-on
 * with no punctuation is force-flushed at the last space once it passes `maxChars` so a long monologue still
 * pipelines. Fragments shorter than `minChars` keep accumulating (so "Mr." / "3." don't become their own
 * TTS calls). Decimals like "3.5" are NOT split (the punctuation must be followed by whitespace/end).
 */

export interface SentenceAccumulator {
  /** Feed a text delta; returns any sentences that just completed (possibly empty). */
  push(delta: string): string[];
  /** Emit the remaining buffered tail (trimmed) and clear it. Call once the stream ends. */
  flush(): string | null;
}

export interface SentenceAccumulatorOpts {
  /** A completed sentence shorter than this keeps accumulating (avoids tiny TTS calls). Default 8. */
  minChars?: number;
  /** A punctuation-less run-on longer than this is force-flushed at the last space. Default 180. */
  maxChars?: number;
}

const SENTENCE_END = /[.!?…;]+(?=\s|$)|\n+/;

/**
 * Create a streaming sentence accumulator. `push` returns freshly-completed sentences; `flush` returns the
 * final tail. Pure/stateful — one instance per turn.
 */
export function createSentenceAccumulator(opts: SentenceAccumulatorOpts = {}): SentenceAccumulator {
  const minChars = opts.minChars ?? 8;
  const maxChars = opts.maxChars ?? 180;
  let buf = '';

  const drain = (): string[] => {
    const out: string[] = [];
    // Guard against pathological loops; 64 sentences per delta is far beyond any real chunk.
    for (let guard = 0; guard < 64; guard++) {
      // Find the FIRST sentence boundary whose cumulative sentence is at least `minChars` long. A shorter
      // fragment (an abbreviation like "Mr." or a tiny "Hi.") is absorbed and we scan onward, so it rides
      // into the next sentence instead of becoming its own tiny TTS call or looping on the same boundary.
      let searchFrom = 0;
      let emitEnd = -1;
      while (searchFrom < buf.length) {
        const m = buf.slice(searchFrom).match(SENTENCE_END);
        if (!m || m.index == null) break;
        const end = searchFrom + m.index + m[0].length;
        if (buf.slice(0, end).trim().length >= minChars) { emitEnd = end; break; }
        searchFrom = end; // too short → keep this fragment and look for a later boundary
      }
      if (emitEnd >= 0) {
        out.push(buf.slice(0, emitEnd).trim());
        buf = buf.slice(emitEnd).replace(/^\s+/, '');
        continue;
      }
      // No usable boundary yet — force-flush a run-on once it grows past maxChars, cut at the last space.
      if (buf.length >= maxChars) {
        const sp = buf.lastIndexOf(' ', maxChars);
        const cut = sp > minChars ? sp : maxChars;
        const candidate = buf.slice(0, cut).trim();
        if (candidate) {
          out.push(candidate);
          buf = buf.slice(cut).replace(/^\s+/, '');
          continue;
        }
      }
      break;
    }
    return out;
  };

  return {
    push(delta: string): string[] {
      if (typeof delta === 'string' && delta.length) buf += delta;
      return drain();
    },
    flush(): string | null {
      const tail = buf.trim();
      buf = '';
      return tail.length ? tail : null;
    },
  };
}
