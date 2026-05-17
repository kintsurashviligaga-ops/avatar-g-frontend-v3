import 'server-only';

import { reportError } from '@/lib/observability/report-error';

/**
 * Embed a piece of text with OpenAI text-embedding-3-small (1536 dims).
 *
 * Returns `null` (and logs via reportError) when:
 *   • OPENAI_API_KEY is not configured
 *   • text is empty
 *   • the OpenAI call fails
 *
 * Callers must treat a `null` result as "embedding unavailable" and
 * proceed without storing an embedding / without similarity injection.
 * This function never throws.
 */
export async function embed(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const input = (text ?? '').trim();

  if (!input) {
    return null;
  }

  if (!apiKey) {
    reportError(new Error('OPENAI_API_KEY not configured — skipping embedding'), {
      route: 'lib/memory/embed',
      input_length: input.length,
    });
    return null;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      reportError(new Error(`OpenAI embeddings ${res.status}: ${errText.slice(0, 300)}`), {
        route: 'lib/memory/embed',
        status: res.status,
      });
      return null;
    }

    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    const vector = json.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== 1536) {
      reportError(new Error('OpenAI embeddings: unexpected response shape'), {
        route: 'lib/memory/embed',
        got_length: Array.isArray(vector) ? vector.length : 'n/a',
      });
      return null;
    }

    return vector;
  } catch (err) {
    reportError(err, { route: 'lib/memory/embed' });
    return null;
  }
}
