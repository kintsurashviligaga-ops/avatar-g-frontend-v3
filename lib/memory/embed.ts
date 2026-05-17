import 'server-only';

import { reportError } from '@/lib/observability/report-error';

/**
 * Embed a piece of text as a 1536-dimensional vector.
 *
 * Provider order:
 *   1. Google Gemini `gemini-embedding-001` (output_dimensionality=1536) —
 *      primary because the project's Gemini key has free-tier embeddings
 *      capacity. Returns 1536-d vectors compatible with the pgvector
 *      `memories.embedding vector(1536)` column.
 *   2. OpenAI `text-embedding-3-small` — fallback when GEMINI_API_KEY is
 *      missing or the Gemini call fails. Also produces 1536-d vectors.
 *
 * Returns `null` (and logs via reportError) when both providers fail or
 * neither key is configured. Callers must treat `null` as "embedding
 * unavailable" and proceed without storing an embedding or running
 * similarity injection. This function NEVER throws.
 */
export async function embed(text: string): Promise<number[] | null> {
  const input = (text ?? '').trim();
  if (!input) return null;

  // 1. Primary — Gemini
  const gemini = await embedGemini(input);
  if (gemini) return gemini;

  // 2. Fallback — OpenAI
  const openai = await embedOpenAI(input);
  if (openai) return openai;

  return null;
}

// ─── Gemini ────────────────────────────────────────────────────────────────

async function embedGemini(input: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
  if (!apiKey) return null;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: input }] },
          outputDimensionality: 1536,
          taskType: 'SEMANTIC_SIMILARITY',
        }),
      },
    );

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
