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

const GEMINI_STT_MODEL = (process.env.VOICE_V2V_GEMINI_MODEL || 'gemini-2.0-flash').trim();

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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_STT_MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
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
      }),
      signal: AbortSignal.timeout(25_000),
    },
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gemini STT failed (${res.status}): ${txt.slice(0, 180)}`);
  }

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
