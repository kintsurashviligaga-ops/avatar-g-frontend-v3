/**
 * chunkForTts — split text into TTS-sized chunks so a long read is never truncated by a single
 * request. Normalizes whitespace, breaks on sentence terminators (Latin · Georgian · CJK), merges fragments
 * up to ~600 chars, splits long sentences at word boundaries, and hard-splits only oversized words.
 * Hard splits preserve Unicode surrogate pairs. Pure + dependency-free + tested.
 *
 * Callers own synthesis/playback failures and budget approval; complete text chunking alone does not
 * prove that the provider or player spoke it all. Shared by composer read-aloud and report speech plans.
 */
export interface ChunkForTtsOptions {
  /**
   * Speak sooner: the FIRST sentence becomes a chunk of its own when it is at most `leadMax` characters. Synthesis
   * time grows with length, so a one-sentence first request returns its audio in a fraction of a 600-char one, and
   * the rest is synthesised while it plays. It also makes the first chunk FINAL as soon as the second sentence has
   * begun — which is what lets a streaming reply pre-synthesise it before the stream ends (OmniStudio).
   */
  leadSentence?: boolean;
  /** Default 220. */
  leadMax?: number;
}

export function chunkForTts(text: string, maxChars = 600, opts: ChunkForTtsOptions = {}): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 2) throw new RangeError('TTS chunk size must be an integer of at least 2 UTF-16 units');
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  // Include standalone/leading punctuation instead of dropping it before the first word.
  const sentences = clean.match(/[^.!?。！？]+[.!?。！？]*|[.!?。！？]+/gu) || [clean];
  const MAX = maxChars;
  const chunks: string[] = [];
  let buf = '';
  let first = true;
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (first) {
      first = false;
      if (opts.leadSentence && /[\p{L}\p{N}]/u.test(s) && s.length <= Math.min(MAX, opts.leadMax ?? 220)) { chunks.push(s); continue; }
    }
    if (`${buf} ${s}`.trim().length > MAX) {
      if (buf) { chunks.push(buf.trim()); buf = ''; }
      if (s.length > MAX) {
        let rest = s;
        while (rest.length > MAX) {
          let end = rest.lastIndexOf(' ', MAX);
          if (end < 1) {
            end = MAX;
            // A provider must never receive the two halves of an astral character in separate requests.
            if (/[\uD800-\uDBFF]/.test(rest[end - 1]!) && /[\uDC00-\uDFFF]/.test(rest[end]!)) end -= 1;
          }
          chunks.push(rest.slice(0, end));
          rest = rest.slice(end).trimStart();
        }
        if (rest) chunks.push(rest);
      }
      else buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}
