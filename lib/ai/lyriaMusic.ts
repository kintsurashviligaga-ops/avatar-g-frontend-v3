import 'server-only';
import { googleAiConfigured, googleTransport, requireVertexAiConfig } from '@/lib/ai/google/transport';
import { getVertexAccessToken } from '@/lib/veo/vertexAuth';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { reportGeminiFallback } from '@/lib/ai/geminiFallbackReport';
import { isEnabledByDefault } from '@/lib/env/flag';

/** Google Lyria is the exclusive music provider. The selected transport never silently changes billing accounts.
 * Vertex contract: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/music/generate-music
 */
export function lyriaModel(): string {
  const model = process.env.LYRIA_MODEL?.trim() || 'lyria-3-clip-preview';
  if (!['lyria-3-clip-preview', 'lyria-3-pro-preview'].includes(model)) throw new Error('Unsupported Lyria model');
  return model;
}
export function hasLyriaProvider(): boolean {
  return isEnabledByDefault(process.env.LYRIA_ENABLED) && googleAiConfigured();
}
export interface LyriaTrack { base64: string; mime: string }

/** Accept only audio blocks, never an unrelated large image or text field. */
function extractAudio(value: unknown): LyriaTrack | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) { const audio = extractAudio(item); if (audio) return audio; }
    return null;
  }
  const obj = value as Record<string, unknown>;
  const mime = obj.mime_type ?? obj.mimeType;
  if (typeof mime === 'string' && mime.startsWith('audio/') && typeof obj.data === 'string' && obj.data.length > 0) {
    return { base64: obj.data, mime };
  }
  for (const child of Object.values(obj)) { const audio = extractAudio(child); if (audio) return audio; }
  return null;
}

async function musicWithinBudget(): Promise<boolean> {
  try {
    const { canProceed } = await import('@/lib/services/billing/BillingGuard');
    const { estimateCost } = await import('@/lib/services/billing/costModel');
    const decision = await canProceed(estimateCost({ service: 'music', model: lyriaModel(), units: 1 }));
    return decision.allowed;
  } catch {
    return true; // guard unavailable → do not block the product
  }
}

/** Book one generated track against the platform budget. Best-effort: the audio is already in hand. */
async function recordMusicUsage(): Promise<void> {
  try {
    const { recordUsage } = await import('@/lib/services/billing/BillingGuard');
    const { estimateCost } = await import('@/lib/services/billing/costModel');
    await recordUsage(estimateCost({ service: 'music', model: lyriaModel(), units: 1 }));
  } catch {
    /* bookkeeping only — never surfaces to the caller */
  }
}

/** A failed generation returns null; callers must report/refund it instead of trying a prohibited vendor. */
export async function generateLyriaTrack(args: { prompt: string; lyrics?: string; instrumental?: boolean }): Promise<LyriaTrack | null> {
  if (!hasLyriaProvider() || !args.prompt?.trim()) return null;
  if (!(await musicWithinBudget())) return null;
  let input = args.prompt.trim().slice(0, 1500);
  if (args.instrumental) input += '. Instrumental, no vocals.';
  else if (args.lyrics?.trim()) input += `\n\nLyrics:\n${args.lyrics.trim().slice(0, 1500)}`;
  try {
    const vertex = googleTransport() === 'vertex';
    const url = vertex
      ? `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(requireVertexAiConfig().projectId)}/locations/global/interactions`
      : 'https://generativelanguage.googleapis.com/v1beta/interactions';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (vertex) headers.Authorization = `Bearer ${await getVertexAccessToken(false)}`;
    else headers['x-goog-api-key'] = resolveGeminiKey()!;
    const res = await fetch(url, {
      method: 'POST', headers, cache: 'no-store', redirect: 'manual',
      body: JSON.stringify(vertex
        ? { model: lyriaModel(), input: [{ type: 'text', text: input }] }
        : { model: lyriaModel(), input, response_format: { type: 'audio' } }),
      signal: AbortSignal.timeout(150_000),
    });
    if (!res.ok) {
      reportGeminiFallback({ leg: 'lyria', fallbackTo: 'none', status: res.status, detail: 'Music generation failed', model: lyriaModel() });
      return null;
    }
    const payload = await res.json().catch(() => null);
    if (payload?.status && payload.status !== 'completed') return null;
    const audio = extractAudio(payload);
    if (audio) void recordMusicUsage();
    return audio;
  } catch {
    reportGeminiFallback({ leg: 'lyria', fallbackTo: 'none', detail: 'Music transport failed' });
    return null;
  }
}
