import 'server-only';

/**
 * xAI "Grok Imagine" image-generation client.
 *
 * A funded fallback for the image pipeline: when NanoBanana (Gemini) is out of
 * credits AND the Replicate (FLUX) failover also fails, we try Grok so the user
 * still gets a real image. The credential is read ONLY from the XAI_API_KEY env
 * var (set in Vercel by the operator) — never passed in from the client and never
 * logged. The endpoint is xAI's OpenAI-compatible image API.
 *
 * Docs: POST https://api.x.ai/v1/images/generations
 *   body  { model, prompt, n, response_format }
 *   reply { data: [{ url | b64_json, revised_prompt }] }
 */

const XAI_IMAGE_URL = 'https://api.x.ai/v1/images/generations';
const XAI_IMAGE_TIMEOUT_MS = 30_000;

/** The Grok image model. Overridable via env without a redeploy. */
function xaiImageModel(): string {
  return (process.env.XAI_IMAGE_MODEL || 'grok-2-image').trim();
}

/** True when XAI_API_KEY is provisioned — the Grok image leg can fire. */
export function hasXaiApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.XAI_API_KEY;
  return typeof v === 'string' && v.trim().length > 0;
}

export interface GrokImageResult {
  /** A hosted image URL (xAI default), or null when only base64 came back. */
  url: string | null;
  /** Base64 PNG (when response_format=b64_json), or null. */
  b64: string | null;
  /** xAI's auto-revised prompt, if any. */
  revisedPrompt: string | null;
  model: string;
}

/**
 * Generate one image with Grok Imagine. Returns null when no key is configured
 * (so callers treat it as "leg unavailable"); throws with the upstream status on
 * a real provider error (insufficient credits / auth / rate limit) so the caller
 * can surface a diagnosable reason. Bounded by a timeout so it can never hang a
 * synchronous request.
 */
export async function generateGrokImage(prompt: string, signal?: AbortSignal): Promise<GrokImageResult | null> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return null;

  const model = xaiImageModel();
  const res = await fetch(XAI_IMAGE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      model,
      prompt: prompt.slice(0, 1024),
      n: 1,
      response_format: 'url',
    }),
    signal: signal ?? AbortSignal.timeout(XAI_IMAGE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`xAI Grok image failed (${res.status}): ${txt.slice(0, 180)}`);
  }

  const json = (await res.json().catch(() => null)) as {
    data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  } | null;
  const item = json?.data?.[0];
  if (!item || (!item.url && !item.b64_json)) return null;

  return {
    url: typeof item.url === 'string' ? item.url : null,
    b64: typeof item.b64_json === 'string' ? item.b64_json : null,
    revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : null,
    model,
  };
}
