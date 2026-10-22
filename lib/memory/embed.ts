import 'server-only';

import { reportError } from '@/lib/observability/report-error';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { googleModelFetch, googleTransportBlocker } from '@/lib/ai/google/transport';

/**
 * Embed a piece of text as a 1536-dimensional vector.
 *
 * Provider order:
 *   1. Google Gemini `gemini-embedding-001` (output_dimensionality=1536),
 *      called as `:predict` on Vertex AI — the only Google transport under
 *      MASTER TASK v3.1 (the Developer API's `:embedContent` is gone with it).
 *      Returns 1536-d vectors compatible with the pgvector
 *      `memories.embedding vector(1536)` column. ⚠️ That these vectors match
 *      any stored while the Developer API served this model is Google's model
 *      identity, not something this project has measured yet.
 *   2. OpenAI `text-embedding-3-small` — fallback when Vertex AI is not
 *      configured or the Gemini call fails, and ONLY when AI_GOOGLE_ONLY is
 *      off (lib/ai/google/policy.ts). Also produces 1536-d vectors.
 *
 * ⚠️ THE FALLBACK'S VECTORS ARE NOT COMPARABLE TO GEMINI'S. Same dimension, different embedding space:
 * a text-embedding-3-small vector stored next to gemini-embedding-001 vectors in `memories.embedding`
 * (or used to query them via match_memories) gives similarity scores that mean nothing — it silently
 * recalls the wrong memories rather than failing. Under Google-only a Gemini miss is therefore just a
 * miss (null), never an OpenAI vector.
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

  // 1. Primary — Gemini
  const gemini = await embedGemini(input);
  if (gemini) return gemini;

  // 2. Fallback — OpenAI (never under Google-only; see the ⚠️ above).
  if (isAiGoogleOnly()) return null;
  const openai = await embedOpenAI(input);
  if (openai) return openai;

  return null;
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

// ─── OpenAI (fallback) ─────────────────────────────────────────────────────

async function embedOpenAI(input: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  if (!apiKey) return null;

  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input,
      }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      reportError(new Error(`OpenAI embeddings ${r.status}: ${errText.slice(0, 240)}`), {
        route: 'lib/memory/embed',
        provider: 'openai',
      });
      return null;
    }

    const json = (await r.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = json.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== 1536) {
      reportError(new Error('OpenAI embeddings: unexpected response shape'), {
        route: 'lib/memory/embed',
        provider: 'openai',
        got_length: Array.isArray(vec) ? vec.length : 'n/a',
      });
      return null;
    }

    return vec;
  } catch (err) {
    reportError(err, { route: 'lib/memory/embed', provider: 'openai' });
    return null;
  }
}
