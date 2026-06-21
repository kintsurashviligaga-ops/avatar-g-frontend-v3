/**
 * lib/audio/azure-tts.ts
 * ======================
 * Microsoft Azure Cognitive Services — NATIVE Georgian (ka-GE) text-to-speech.
 *
 * WHY THIS IS THE GEORGIAN FIX
 * ----------------------------
 * ElevenLabs has NO native Georgian voice — even eleven_v3 only applies the
 * Georgian *language* to non-Georgian voices, so it always carries an accent.
 * Azure ships two voices trained ON Georgian by native speakers:
 *   • ka-GE-EkaNeural    (female)
 *   • ka-GE-GiorgiNeural (male)
 * These are the same voices SpeechGen / Notevibes / Fliki expose as "Eka" and
 * "Giorgi" — natural, accent-free, human. They handle Georgian's ejectives,
 * three-way stop contrast and consonant clusters correctly.
 *
 * Config (Azure Speech free tier F0 = 500K chars/month, $0):
 *   AZURE_SPEECH_KEY     — the resource key
 *   AZURE_SPEECH_REGION  — e.g. "westeurope", "eastus"
 *
 * Strictly fail-open: returns null on any miss so the caller falls back to
 * ElevenLabs (eleven_v3) → Google. No key ⇒ no behaviour change.
 */
import 'server-only';

export type AzureGender = 'male' | 'female';

/** Native ka-GE neural voices (the two Azure ships). */
const KA_VOICE: Record<AzureGender, string> = {
  female: 'ka-GE-EkaNeural',
  male: 'ka-GE-GiorgiNeural',
};

function azureConfig(): { key: string; region: string } | null {
  const key = process.env.AZURE_SPEECH_KEY || process.env.AZURE_TTS_KEY || '';
  const region = process.env.AZURE_SPEECH_REGION || process.env.AZURE_TTS_REGION || '';
  return key && region ? { key, region } : null;
}

/** True when an Azure Speech key + region are configured. */
export function azureTtsConfigured(): boolean {
  return azureConfig() !== null;
}

const xmlEscape = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));

// Once the key is proven bad (401/403), stop retrying on every request.
let keyDead = false;

/**
 * Synthesise Georgian `text` to an MP3 ArrayBuffer with the native ka-GE voice for
 * the requested gender. Returns null on any failure (no key, bad key, network).
 */
export async function synthesizeAzureGeorgian(
  text: string,
  gender: AzureGender = 'female',
): Promise<ArrayBuffer | null> {
  const cfg = azureConfig();
  if (!cfg || keyDead) return null;
  const clean = (text ?? '').trim();
  if (!clean) return null;

  const voice = KA_VOICE[gender];
  const ssml =
    `<speak version="1.0" xml:lang="ka-GE">` +
    `<voice xml:lang="ka-GE" name="${voice}">${xmlEscape(clean.slice(0, 5000))}</voice>` +
    `</speak>`;

  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 30_000);
    const res = await fetch(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': cfg.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'myavatar-ge',
      },
      body: ssml,
      signal: ac.signal,
    }).finally(() => clearTimeout(to));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) keyDead = true;
      console.error('[azure-tts] synth error', res.status, voice);
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 512) return null;
    return buf;
  } catch {
    return null;
  }
}
