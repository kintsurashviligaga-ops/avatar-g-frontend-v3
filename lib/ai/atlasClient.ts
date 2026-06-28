/**
 * lib/ai/atlasClient.ts
 * =====================
 * Atlas Cloud (api.atlascloud.ai) — OpenAI-compatible LLM inference. Verified live:
 * GET /v1/models → 200 (131 LLMs incl. DeepSeek-V3, Qwen3, Kimi-K2); POST
 * /v1/chat/completions with model "deepseek-ai/DeepSeek-V3-0324" → 200. Auth is a
 * single Bearer key (the "apikey-…" value). NOTE: Atlas has NO video/Kling models —
 * this is for LLM text only (Director / storyboard fallback), never video.
 *
 * Env: ATLAS_API_KEY (or legacy ATLAS_KLING_API_KEY), ATLAS_BASE_URL, ATLAS_MODEL.
 * STRICTLY ADDITIVE + fail-open: every miss returns null so callers keep their
 * primary provider.
 */
import 'server-only';

const ATLAS_BASE = (process.env.ATLAS_BASE_URL || 'https://api.atlascloud.ai').replace(/\/$/, '');
// Exact ids from the live model list — the short "deepseek-v3" 404s ("not found").
export const ATLAS_DEFAULT_MODEL = process.env.ATLAS_MODEL || 'deepseek-ai/DeepSeek-V3-0324';

function atlasKey(): string {
  return String(process.env.ATLAS_API_KEY || process.env.ATLAS_KLING_API_KEY || '').trim();
}

export function atlasConfigured(): boolean {
  return atlasKey().length > 0;
}

export interface AtlasChatOpts {
  user: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * One-shot chat completion → assistant text, or null on any failure (fail-open).
 * OpenAI-compatible: choices[0].message.content.
 */
export async function atlasChat(opts: AtlasChatOpts): Promise<string | null> {
  const key = atlasKey();
  if (!key) return null;
  const messages = [
    ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
    { role: 'user', content: opts.user },
  ];
  const ctrl = opts.signal ? undefined : new AbortController();
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000) : null;
  try {
    const res = await fetch(`${ATLAS_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model || ATLAS_DEFAULT_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 2000,
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
      }),
      signal: opts.signal ?? ctrl?.signal,
    });
    const data = (await res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }>; msg?: string; error?: unknown }
      | null;
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[atlas] chat failed:', res.status, String(data?.msg || data?.error || '').slice(0, 160));
      return null;
    }
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim().length > 0 ? content : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[atlas] chat threw:', e instanceof Error ? e.message : e);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
