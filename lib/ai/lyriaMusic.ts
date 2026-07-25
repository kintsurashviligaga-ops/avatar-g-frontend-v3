/**
 * lib/ai/lyriaMusic.ts — Google **Lyria** music generation via the Gemini API, wired as the OPTIONAL PRIMARY
 * music engine for INSTRUMENTAL tracks. Cost bills to the Gemini API account tied to the key.
 *
 * Lyria is INSTRUMENTAL (no vocals) — so it is only offered as primary when the request is instrumental;
 * a vocal-song request stays on ElevenLabs Music (which sings). See app/api/ai/music/route.ts.
 *
 * GATED opt-in via LYRIA_ENABLED (default OFF) so the existing Udio→ElevenLabs→MusicGen chain is byte-
 * identical until an operator confirms the key has Lyria access + funding and flips it on. EVERY path is
 * null/failure-safe: no key, no access, quota, timeout, or a contract drift returns null so the caller's
 * latency-failover moves straight to the next provider — the track NEVER fails to generate.
 *
 * NOTE: like all Google generative media, Lyria audio carries an INAUDIBLE SynthID watermark (forensic) —
 * that is deliberately untouched. There is no visible/textual Google mark to remove: our player renders our
 * OWN branded card (components/studio/TrackPlayer), so nothing from Google is ever shown.
 *
 * CONTRACT CAVEAT: the exact Lyria REST surface for API-key billing needs validation with a funded, Lyria-
 * enabled key. This targets the documented predict shape defensively; ANY mismatch → null → fallback, so
 * enabling it can never break music generation. Finalize the endpoint/parse once it can be tested live.
 */
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { isTruthyFlag } from '@/lib/env/flag';

const GL_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEN_TIMEOUT_MS = 150_000; // bounded under the route's 300s ceiling

/** Default Lyria model (env-overridable). */
export function lyriaModel(): string {
  return (process.env.LYRIA_MODEL || 'lyria-002').trim();
}

/** True iff Lyria is opt-in ENABLED and a Gemini key is present. Off by default → chain unchanged. */
export function hasLyriaProvider(): boolean {
  return isTruthyFlag(process.env.LYRIA_ENABLED) && !!resolveGeminiKey();
}

export interface LyriaTrack {
  /** Base64 audio payload + its mime, ready to host. */
  base64: string;
  mime: string;
}

/**
 * Generate an INSTRUMENTAL Lyria track. Returns { base64, mime } or null on ANY miss so the caller falls
 * back to the next music provider. Never throws.
 */
export async function generateLyriaTrack(args: { prompt: string; durationSec?: number; negativePrompt?: string }): Promise<LyriaTrack | null> {
  const key = resolveGeminiKey();
  if (!key || !args.prompt?.trim()) return null;

  const parameters: Record<string, unknown> = { sampleCount: 1 };
  if (Number.isFinite(args.durationSec)) parameters.durationSeconds = Math.min(120, Math.max(10, Math.round(args.durationSec as number)));
  if (args.negativePrompt?.trim()) parameters.negativePrompt = args.negativePrompt.trim().slice(0, 300);

  try {
    const res = await fetch(`${GL_BASE}/models/${lyriaModel()}:predict?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ instances: [{ prompt: args.prompt.trim().slice(0, 1000) }], parameters }),
      signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[lyria] predict http_${res.status} → falling back. body: ${body.slice(0, 300)}`);
      return null;
    }
    const j = (await res.json().catch(() => ({}))) as {
      predictions?: Array<{ bytesBase64Encoded?: string; audioContent?: string; mimeType?: string }>;
    };
    const pred = j.predictions?.[0];
    const b64 = pred?.bytesBase64Encoded || pred?.audioContent || null;
    if (!b64) return null;
    return { base64: b64, mime: pred?.mimeType || 'audio/wav' };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[lyria] predict threw → falling back:', e instanceof Error ? e.message : e);
    return null;
  }
}
