/**
 * lib/rag/chunk.ts
 * ================
 * Pure, deterministic text chunker for the RAG ingestion pipeline.
 *
 * Strategy: split on blank-line paragraph boundaries first, packing whole
 * paragraphs into chunks up to `chunkSize` characters. Paragraphs longer than
 * `chunkSize` are hard-sliced into overlapping windows so no content is lost
 * and embeddings stay within model limits.
 *
 * No external deps (no LangChain) — keeps the bundle lean and the behaviour
 * unit-testable.
 */

export interface ChunkOptions {
  /** Target maximum characters per chunk. Clamped to a 200 floor. */
  chunkSize?: number;
  /** Characters of overlap between hard-sliced windows. Clamped to chunkSize/2. */
  overlap?: number;
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const chunkSize = Math.max(200, opts.chunkSize ?? 1500);
  const overlap = Math.min(Math.max(0, opts.overlap ?? 200), Math.floor(chunkSize / 2));

  const clean = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  const units = clean
    .split(/\n{2,}/)
    .map((u) => u.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const c = current.trim();
    if (c) chunks.push(c);
    current = '';
  };

  for (const unit of units) {
    // Oversized paragraph → flush current, then hard-slice with overlap.
    if (unit.length > chunkSize) {
      flush();
      const step = Math.max(1, chunkSize - overlap);
      for (let i = 0; i < unit.length; i += step) {
        const slice = unit.slice(i, i + chunkSize).trim();
        if (slice) chunks.push(slice);
        if (i + chunkSize >= unit.length) break;
      }
      continue;
    }

    // Would adding this paragraph overflow the current chunk? Flush first.
    if (current && current.length + 2 + unit.length > chunkSize) flush();
    current = current ? `${current}\n\n${unit}` : unit;
  }

  flush();
  return chunks;
}
