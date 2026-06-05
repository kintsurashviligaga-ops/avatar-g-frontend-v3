import 'server-only';

/**
 * Gemini speech-to-text fallback.
 *
 * The primary chat-mic STT goes through OpenAI Whisper (OPENAI_API_KEY) or
 * Deepgram (DEEPGRAM_API_KEY). When NEITHER key is provisioned the mic silently
 * fails — "I speak Georgian and nothing appears". Gemini is ALWAYS configured
 * (it powers chat), and gemini-2.0-flash is natively multimodal incl. audio, so
 * it is the zero-extra-key fallback that keeps Georgian dictation working.
 *
 * The credential is read ONLY from GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY
 * (operator env), never the client, never logged.
 */

function geminiKey(): string {
  const single = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '').trim();
  if (single) return single;
  // The chat path rotates a POOL of keys under GEMINI_API_KEYS (comma/space/newline
  // separated). If the single var isn't set, draw the first key from the pool so
  // the mic uses the SAME provisioned credential the rest of the app already does.
  const pool = (process.env.GEMINI_API_KEYS || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return pool[0] || '';
}

export function hasGeminiSttKey(): boolean {
  return geminiKey().length > 0;
}

/**
 * Candidate models, tried in order. The first is the app-wide canonical model
 * (matches lib/gemini/client.ts), the rest are graceful step-downs. We iterate
 * because Google RETIRES model aliases without notice — `gemini-2.0-flash` was
 * decommissioned (404 "model is no longer available"), which is exactly what
 * silently killed Georgian dictation. Skipping a dead model to the next keeps
 * the mic alive across these deprecations, mirroring the chat route's self-heal.
 */
const GEMINI_STT_MODELS: string[] = Array.from(
  new Set(
    [
      (process.env.VOICE_V2V_GEMINI_MODEL || '').trim(),
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-2.0-flash-lite',
    ].filter(Boolean),
  ),
);

const LANGUAGE_NAME: Record<string, string> = {
  'ka-GE': 'Georgian',
  'en-US': 'English',
  'ru-RU': 'Russian',
};

/**
 * Transcribe a short audio clip with Gemini. Returns the spoken text (possibly
 * empty); throws with the upstream status on a real provider error so the caller
 * can decide. Bounded by a timeout so it never hangs the request.
 */
export async function transcribeWithGemini(
  audioBase64: string,
  mimeType: string,
  language: string,
): Promise<string> {
  const key = geminiKey();
  if (!key) throw new Error('GEMINI_API_KEY is not configured');

  const langName = LANGUAGE_NAME[language] || 'Georgian';
  const mt = mimeType || 'audio/webm';

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: `Transcribe this audio in ${langName}. Output ONLY the exact spoken words — no translation, no punctuation commentary, no quotes, no extra text. If silent, output nothing.`,
          },
          { inline_data: { mime_type: mt, data: audioBase64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 1024 },
  });

  let lastErr = '';
  for (const model of GEMINI_STT_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body,
        signal: AbortSignal.timeout(25_000),
      },
    );

    if (res.ok) {
      const json = (await res.json().catch(() => null)) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      } | null;
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      return parts
        .map((p) => p.text ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const txt = await res.text().catch(() => '');
    lastErr = `Gemini STT failed (${res.status}) on ${model}: ${txt.slice(0, 160)}`;
    // 404 / "no longer available" / "not found" → the model alias was retired;
    // step down to the next candidate. Any other status is a real error (bad
    // audio format, quota, auth) that the next model won't fix → stop early.
    const retired = res.status === 404 || /no longer available|not found|is not supported/i.test(txt);
    if (!retired) break;
  }

  throw new Error(lastErr || 'Gemini STT failed: no model available');
}
