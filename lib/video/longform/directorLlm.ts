/**
 * lib/video/longform/directorLlm.ts — the Director's LLM: lib/ai/llmText adapted to director.DirectorGenerate.
 *
 * Its own module (runtime.ts re-exports it) so the create route — the only caller — imports the LLM call and nothing
 * else: runtime.ts also carries ffmpeg-static, the Veo engine and storage, none of which that route touches.
 */
import 'server-only';
import { llmText } from '@/lib/ai/llmText';
import { isGoogleOnly } from '@/lib/veo/policy';
import type { DirectorGenerate } from './director';

const DEFAULT_TIMEOUT_MS = 86_000;

/**
 * The same call runPromptAgent makes (Google-only JSON when VIDEO_GOOGLE_ONLY, VEO_DIRECTOR_MODEL honoured). A
 * deadline wrapper's `timeoutMs` / `signal` (director.DirectorCallOptions) only ever SHORTEN the call.
 */
export const llmDirectorGenerate: DirectorGenerate = async (prompt, opts) => {
  const directorModel = (process.env.VEO_DIRECTOR_MODEL || '').trim() || undefined;
  const base = Number(process.env.PROMPT_AGENT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const capped =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? Math.min(base, Math.floor(opts.timeoutMs)) : base;
  return llmText({
    system: opts.system,
    user: prompt,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    timeoutMs: capped,
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(isGoogleOnly() ? { googleOnly: true, json: true, ...(directorModel ? { geminiModel: directorModel } : {}) } : {}),
  });
};
