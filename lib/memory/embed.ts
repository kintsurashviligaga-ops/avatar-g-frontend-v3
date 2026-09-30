import 'server-only';

import { reportError } from '@/lib/observability/report-error';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';

/**
 * Embed a piece of text as a 1536-dimensional vector.
 *
 * Provider order:
 *   1. Google Gemini `gemini-embedding-001` (output_dimensionality=1536) —
 *      primary because the project's Gemini key has free-tier embeddings
 *      capacity. Returns 1536-d vectors compatible with the pgvector
 *      `memories.embedding vector(1536)` column.
 *   2. OpenAI `text-embedding-3-small` — fallback when no Gemini key is
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
 * no key is configured. Callers must treat `null` as "embedding
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

const GEMINI_EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

async function embedGemini(input: string): Promise<number[] | null> {
  // resolveGeminiKey(): GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, else the GEMINI_API_KEYS pool.
  const apiKey = resolveGeminiKey();
  if (!apiKey) return null;

  try {
    // ⚠️ The key travels in the x-goog-api-key header, never the URL: a `?key=` URL lands in fetch error
    // messages, traces and proxy logs (and from there in reportError payloads).
    const r = await fetch(GEMINI_EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        content: { parts: [{ text: input }] },
        outputDimensionality: 1536,
        taskType: 'SEMANTIC_SIMILARITY',
      }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      reportError(new Error(`Gemini embedContent ${r.status}: ${errText.slice(0, 240)}`), {
        route: 'lib/memory/embed',
        provider: 'gemini',
      });
      return null;
    }

    const json = (await r.json()) as { embedding?: { values?: number[] } };
    const vec = json.embedding?.values;
    if (!Array.isArray(vec) || vec.length !== 1536) {
      reportError(new Error('Gemini embedContent: unexpected response shape'), {
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
