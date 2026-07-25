/**
 * lib/ai/geminiVeo.ts — Google **Veo** video generation via the Gemini API (generativelanguage), wired as
 * the OPTIONAL PRIMARY clip engine. Veo returns a finished clip WITH native audio (speech + effects) baked
 * in, so the pipeline delivers it directly — no separate ElevenLabs VO/audio-mix stage on Veo output.
 *
 * Cost is billed to the Gemini API account tied to the key (not the myavatar credit ledger — the user is
 * still charged credits by the existing billing).
 *
 * GATED opt-in via GEMINI_VEO_ENABLED (default OFF) so the working Runway→Kling→LTX cascade is byte-identical
 * until an operator confirms the key has Veo access + funding and flips it on. EVERY function is null/failure
 * safe: on no key, no access, timeout, quota, or a contract drift it returns null/failed so the caller
 * (ServiceManager) falls straight through to Runway — the generation NEVER errors out.
 *
 * Submit → operation name (non-blocking); poll separately (preserves the submit→poll pattern that fixed the
 * 504s). The video download URI needs the API key, so it is fetched SERVER-SIDE here (fetchVeoVideoBuffer)
 * and never leaks the key to the client.
 */
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { isTruthyFlag } from '@/lib/env/flag';

const GL_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const CREATE_TIMEOUT_MS = 20_000;

/** Default Veo model — the fast tier available on this key (verified live: veo-3.1-*-generate-preview exist;
 *  the older veo-3.0-*-001 IDs 404). Env-overridable per deploy (GEMINI_VEO_MODEL). */
export function geminiVeoModel(): string {
  return (process.env.GEMINI_VEO_MODEL || 'veo-3.1-fast-generate-preview').trim();
}

/** True iff Veo is opt-in ENABLED and a Gemini key is present. Off by default → cascade unchanged. */
export function hasGeminiVeoProvider(): boolean {
  return isTruthyFlag(process.env.GEMINI_VEO_ENABLED) && !!resolveGeminiKey();
}

// Veo accepts 16:9 and 9:16; there is no 1:1, so square requests fall to landscape.
function mapVeoAspect(aspect: string | undefined): '16:9' | '9:16' {
  return aspect === '9:16' ? '9:16' : '16:9';
}

export interface VeoCreateArgs {
  promptText: string;
  /** Optional i2v anchor frame (https/data URL). Absent → text-to-video. */
  promptImage?: string;
  aspect?: string;
  durationSec?: number;
  negativePrompt?: string;
}

/** Fetch an image URL/data-URL → { base64, mimeType } for Veo's i2v `image` field. Null-safe. */
async function imageToInline(src: string): Promise<{ bytes: string; mime: string } | null> {
  try {
    if (src.startsWith('data:')) {
      const m = src.match(/^data:([^;]+);base64,(.+)$/);
      return m ? { bytes: m[2]!, mime: m[1]! } : null;
    }
    if (!/^https?:\/\//i.test(src)) return null;
    const r = await fetch(src, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const mime = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.byteLength ? { bytes: buf.toString('base64'), mime } : null;
  } catch {
    return null;
  }
}

/**
 * Submit a Veo generation. Returns the long-running OPERATION NAME to poll, or null on ANY miss (no key/
 * access, quota, timeout, contract drift) so the caller falls back to Runway.
 */
export async function createGeminiVeoClip(args: VeoCreateArgs): Promise<{ operation: string } | null> {
  const key = resolveGeminiKey();
  if (!key || !args.promptText?.trim()) return null;

  const instance: Record<string, unknown> = { prompt: args.promptText.trim().slice(0, 1000) };
  if (args.promptImage) {
    const inline = await imageToInline(args.promptImage);
    if (inline) instance.image = { imageBytes: inline.bytes, mimeType: inline.mime };
  }
  const parameters: Record<string, unknown> = {
    aspectRatio: mapVeoAspect(args.aspect),
    personGeneration: 'allow_adult',
  };
  if (args.negativePrompt?.trim()) parameters.negativePrompt = args.negativePrompt.trim().slice(0, 300);
  if (Number.isFinite(args.durationSec)) parameters.durationSeconds = Math.min(8, Math.max(4, Math.round(args.durationSec as number)));

  try {
    const res = await fetch(`${GL_BASE}/models/${geminiVeoModel()}:predictLongRunning?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ instances: [instance], parameters }),
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[veo] create http_${res.status} → falling back to Runway. body: ${body.slice(0, 300)}`);
      return null;
    }
    const j = (await res.json().catch(() => ({}))) as { name?: unknown };
    return typeof j.name === 'string' && j.name ? { operation: j.name } : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[veo] create threw → falling back to Runway:', e instanceof Error ? e.message : e);
    return null;
  }
}

export type VeoPollResult = { status: 'processing' | 'succeeded' | 'failed'; uri: string | null };

/** Poll a Veo operation ONCE. `processing` on any transient/unknown outcome so the loop keeps waiting. */
export async function pollGeminiVeoTask(operation: string): Promise<VeoPollResult> {
  const key = resolveGeminiKey();
  if (!key || !operation) return { status: 'failed', uri: null };
  try {
    const res = await fetch(`${GL_BASE}/${operation}?key=${encodeURIComponent(key)}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { status: 'processing', uri: null }; // transient → keep polling
    const j = (await res.json().catch(() => ({}))) as {
      done?: boolean;
      error?: { message?: string };
      response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> }; videos?: Array<{ uri?: string }> };
    };
    if (!j.done) return { status: 'processing', uri: null };
    if (j.error) return { status: 'failed', uri: null };
    // Parse the video URI defensively across the shapes the API has used.
    const uri =
      j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
      j.response?.videos?.[0]?.uri ||
      null;
    return uri ? { status: 'succeeded', uri } : { status: 'failed', uri: null };
  } catch {
    return { status: 'processing', uri: null };
  }
}

/** Download a Veo video URI to a Buffer using the API key (server-side only — the key never reaches the
 *  client). Null on any failure so the caller can fall back. */
export async function fetchVeoVideoBuffer(uri: string): Promise<Buffer | null> {
  const key = resolveGeminiKey();
  if (!key || !uri) return null;
  try {
    // The download URI needs the key (header form, so it never lands in a logged URL string).
    const res = await fetch(uri, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength ? buf : null;
  } catch {
    return null;
  }
}
