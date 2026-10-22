import 'server-only';

import { reportError } from '@/lib/observability/report-error';
import { googleModelFetch, googleTransportBlocker } from '@/lib/ai/google/transport';

/**
 * Embed a piece of text as a 1536-dimensional vector.
 *
 * One provider: Google Gemini `gemini-embedding-001` (output_dimensionality=1536),
 * called as `:predict` on Vertex AI — the only Google transport under
 * MASTER TASK v3.1 (the Developer API's `:embedContent` is gone with it).
 * Returns 1536-d vectors compatible with the pgvector
 * `memories.embedding vector(1536)` column. ⚠️ That these vectors match
 * any stored while the Developer API served this model is Google's model
 * identity, not something this project has measured yet.
 *
 * A Gemini miss is a miss (null). The old OpenAI `text-embedding-3-small` fallback is gone, whatever
 * AI_GOOGLE_ONLY says: its vectors had the same dimension but a different embedding space, so one stored
 * next to gemini-embedding-001 vectors in `memories.embedding` (or used to query them via match_memories)
 * gave similarity scores that meant nothing and silently recalled the wrong memories.
 *
 * ⚠️ Every call is time-bounded (EMBED_TIMEOUT_MS): /api/chat/gemini awaits embed() before the model is
 * even called, so a hung embeddings socket used to stall the chat turn itself.
 *
 * Returns `null` (and logs via reportError) when the providers fail or
 * none is configured. Callers must treat `null` as "embedding
 * unavailable" and proceed without storing an embedding or running
 * similarity injection. This function NEVER throws.
 */
export const EMBED_TIMEOUT_MS = 8_000;

export async function embed(text: string): Promise<number[] | null> {
  const input = (text ?? '').trim();
  if (!input) return null;

  return embedGemini(input);
}

// ─── Gemini ────────────────────────────────────────────────────────────────

export const GEMINI_EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 1536;

/** The Vertex AI `:predict` body for the same model, task and dimension (exported for tests). */
export function buildVertexEmbedBody(input: string): Record<string, unknown> {
  return {
    instances: [{ content: input, task_type: 'SEMANTIC_SIMILARITY' }],
    parameters: { outputDimensionality: EMBED_DIM },
  };
}

async function embedGemini(input: string): Promise<number[] | null> {
  // Vertex AI must be able to serve; an AI Studio key never makes the call possible (v3.1).
  if (googleTransportBlocker()) return null;

  try {
    // The credential is a Workload Identity token in the Authorization header (lib/ai/google/transport), never the URL.
    const r = await googleModelFetch(GEMINI_EMBED_MODEL, 'predict', {
      method: 'POST',
      body: JSON.stringify(buildVertexEmbedBody(input)),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      reportError(new Error(`Gemini embedding predict ${r.status}: ${errText.slice(0, 240)}`), {
        route: 'lib/memory/embed',
        provider: 'gemini',
      });
      return null;
    }

    const json = (await r.json()) as { predictions?: Array<{ embeddings?: { values?: number[] } }> };
    const vec = json.predictions?.[0]?.embeddings?.values;
    if (!Array.isArray(vec) || vec.length !== EMBED_DIM) {
      reportError(new Error('Gemini embedding predict: unexpected response shape'), {
        route: 'lib/memory/embed',
        provider: 'gemini',
        got_length: Array.isArray(vec) ? vec.length : 'n/a',
      });
      return null;
    }

    return vec;
  } catch (err) {
    reportError(err, { route: 'lib/memory/embed', provider: 'gemini' });
    return null;
  }
}
