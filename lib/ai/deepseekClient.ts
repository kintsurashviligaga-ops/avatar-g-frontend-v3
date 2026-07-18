/**
 * lib/ai/deepseekClient.ts
 * ========================
 * DeepSeek DIRECT API (api.deepseek.com) — OpenAI-compatible chat completions using the
 * freshly-provisioned DEEPSEEK_API_KEY. This is a SEPARATE channel from Atlas Cloud
 * (lib/ai/atlasClient.ts, which serves the same model under the HF-style id
 * "deepseek-ai/DeepSeek-V3-0324"). On the DIRECT API the flagship id is "deepseek-chat"
 * (→ DeepSeek-V3); "deepseek-reasoner" is R1. NOTE: `deepseek-chat` works ONLY here — it
 * 404s on Atlas (that was the P88b trap). Having BOTH routes to DeepSeek-V3 gives the film
 * pipeline resilience: if one is rate-limited/down, llmText fails over to the other — both premium.
 *
 * A lean, fail-open sibling of atlasChat (returns null on any miss + a hard timeout) so the
 * latency-bounded storyboard planner never hangs on a dead socket. Env: DEEPSEEK_API_KEY,
 * DEEPSEEK_BASE_URL, DEEPSEEK_MODEL.
 */
import 'server-only';

const DEEPSEEK_BASE = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
export const DEEPSEEK_DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'; // → DeepSeek-V3 on the direct API

function deepseekKey(): string {
  return String(process.env.DEEPSEEK_API_KEY || '').trim();
}

export function deepseekConfigured(): boolean {
  return deepseekKey().length > 0;
}

export interface DeepSeekChatOpts {
  user: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** One-shot chat completion → assistant text, or null on any failure (fail-open). */
export async function deepseekChat(opts: DeepSeekChatOpts): Promise<string | null> {
  const key = deepseekKey();
  if (!key) return null;
  const messages = [
    ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
    { role: 'user', content: opts.user },
  ];
  const ctrl = opts.signal ? undefined : new AbortController();
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 40_000) : null;
  try {
    const res = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model || DEEPSEEK_DEFAULT_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 2000,
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
        stream: false,
      }),
      signal: opts.signal ?? ctrl?.signal,
    });
    const data = (await res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
      | null;
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[deepseek] chat failed:', res.status, String(data?.error?.message || '').slice(0, 160));
      return null;
    }
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim().length > 0 ? content : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[deepseek] chat threw:', e instanceof Error ? e.message : e);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
