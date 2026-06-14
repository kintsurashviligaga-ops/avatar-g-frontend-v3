import 'server-only';

/**
 * Replicate-hosted Whisper speech-to-text — the robust mic fallback.
 *
 * WHY THIS EXISTS
 * The chat mic records a short clip with the browser's MediaRecorder, which
 * produces an `audio/webm;codecs=opus` (desktop Chrome/Firefox) or `audio/mp4`
 * (iOS Safari) container. Our two earlier STT paths each have a blind spot:
 *   • OpenAI Whisper / Deepgram (lib/voice-v2v/providers) need OPENAI_API_KEY
 *     or DEEPGRAM_API_KEY — neither is provisioned on this deployment.
 *   • Gemini (lib/voice-v2v/geminiStt) only ingests wav/mp3/aac/ogg/flac — it
 *     REJECTS the webm/mp4 the browser actually records, so it can't rescue the
 *     real mic even though it powers chat.
 *
 * Whisper-large-v3 on Replicate accepts webm/mp4/mp3/wav all the same and
 * transcribes Georgian well — and it runs on the SAME REPLICATE_API_TOKEN that
 * already drives the (proven-working) video pipeline. So this gives the mic a
 * working path with ZERO new operator secrets. Setting OPENAI_API_KEY remains
 * the lowest-latency option, but this keeps Georgian dictation alive without it.
 *
 * The token is read ONLY from REPLICATE_API_TOKEN (operator env); never logged,
 * never returned to the client.
 */

// openai/whisper is a COMMUNITY model → the model-latest predictions endpoint
// (/v1/models/{model}/predictions) returns 404, which silently broke the mic. Run a
// pinned VERSION via /v1/predictions instead. Override per env if the version rotates.
const WHISPER_VERSION = (process.env.VOICE_STT_REPLICATE_VERSION || '8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e').trim();

/** Whisper takes a full language NAME (or "auto"); map our BCP-47 mic codes. */
const LANGUAGE_NAME: Record<string, string> = {
  'ka-GE': 'georgian',
  'en-US': 'english',
  'ru-RU': 'russian',
};

function replicateToken(): string {
  return String(process.env.REPLICATE_API_TOKEN || '').trim();
}

export function hasReplicateSttKey(): boolean {
  return replicateToken().length > 0;
}

interface ReplicatePrediction {
  id?: string;
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string | null;
  urls?: { get?: string };
}

/** Pull the plain transcript out of whatever shape the model returned. */
function extractTranscript(output: unknown): string {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    // segment arrays → join their text
    return output
      .map((seg) => (typeof seg === 'string' ? seg : String((seg as { text?: string })?.text ?? '')))
      .join(' ');
  }
  if (typeof output === 'object') {
    const o = output as { transcription?: string; text?: string; translation?: string };
    return String(o.transcription ?? o.text ?? o.translation ?? '');
  }
  return '';
}

/**
 * Transcribe a short clip via Replicate Whisper. Returns the spoken text
 * (possibly empty); throws on a real provider error so the caller can log it.
 * Bounded to ~24s so it never outlives the route's 30s budget.
 */
export async function transcribeWithReplicateWhisper(
  audioBase64: string,
  mimeType: string,
  language: string,
): Promise<string> {
  const token = replicateToken();
  if (!token) throw new Error('REPLICATE_API_TOKEN is not configured');

  const mt = mimeType || 'audio/webm';
  const dataUri = `data:${mt};base64,${audioBase64}`;
  const langName = LANGUAGE_NAME[language] || 'georgian';

  // Create the prediction via /v1/predictions with the pinned version (the
  // model-latest endpoint 404s for this community model). `model` is NOT a valid
  // input for openai/whisper — passing it was part of the breakage.
  const createRes = await fetch(
    'https://api.replicate.com/v1/predictions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        version: WHISPER_VERSION,
        input: {
          audio: dataUri,
          language: langName,
          transcription: 'plain text',
          translate: false,
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!createRes.ok) {
    const txt = await createRes.text().catch(() => '');
    throw new Error(`Replicate Whisper create failed (${createRes.status}): ${txt.slice(0, 160)}`);
  }

  let pred = (await createRes.json().catch(() => ({}))) as ReplicatePrediction;
  const pollUrl = pred.urls?.get || (pred.id ? `https://api.replicate.com/v1/predictions/${pred.id}` : '');
  if (!pollUrl) throw new Error('Replicate Whisper returned no prediction handle');

  // Poll to completion within a tight budget (route maxDuration is 30s).
  const deadline = Date.now() + 22_000;
  while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
    if (Date.now() > deadline) throw new Error('Replicate Whisper timed out');
    await new Promise((r) => setTimeout(r, 1200));
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!pollRes.ok) continue; // transient — keep polling until the deadline
    pred = (await pollRes.json().catch(() => pred)) as ReplicatePrediction;
  }

  if (pred.status !== 'succeeded') {
    throw new Error(`Replicate Whisper ${pred.status}: ${String(pred.error || '').slice(0, 160)}`);
  }

  return extractTranscript(pred.output).replace(/\s+/g, ' ').trim();
}
