/**
 * Ad script agent — STEP 2.2. Turns the validated ad inputs (brand/price/hook) into a
 * STRICT-JSON, multi-shot scene plan via the EXISTING scriptwriter brain (`llmText` →
 * DeepSeek-V3/Atlas → Gemini → Anthropic). Defensive by construction: code-fence strip,
 * try/catch JSON.parse, zod validation, ONE "JSON only" retry, then a clean user-facing
 * error — never throws, never crashes the route. Scene count is clamped to Kling clip
 * limits AND the caller's budget ceiling.
 */
import { z } from 'zod';
import { llmText } from '@/lib/ai/llmText';

/** One clip's duration (Kling i2v is happiest ≈5–6s; the ad cadence is 6s/scene). */
export const AD_SCENE_SEC = 6;
/** Hard ceiling on scenes irrespective of budget (a tight ad, not a film). */
export const AD_MAX_SCENES = 8;

export const adSceneSchema = z.object({
  index: z.number().int().nonnegative(),
  durationSec: z.number().positive().max(10).default(AD_SCENE_SEC),
  visualPrompt: z.string().trim().min(1).max(1200),
  narrationKa: z.string().trim().max(400).default(''),
});
export const adScriptSchema = z.object({
  scenes: z.array(adSceneSchema).min(1).max(24),
  totalSec: z.number().positive().optional(),
});
export type AdScene = z.infer<typeof adSceneSchema>;
export type AdScript = z.infer<typeof adScriptSchema>;

/** Strip markdown fences / leading commentary and isolate the outermost JSON object. */
export function stripToJson(raw: string): string {
  let s = (raw || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

/** Defensive parse: fence-strip → JSON.parse (try/catch) → zod. Returns a flat error. */
export function parseAdScript(raw: string): { ok: true; script: AdScript } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(stripToJson(raw));
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  const r = adScriptSchema.safeParse(obj);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { ok: true, script: r.data };
}

/** Clamp scene count (Kling + budget), re-index sequentially, recompute totalSec. */
export function clampAdScript(script: AdScript, maxScenes: number): AdScript {
  const cap = Math.max(1, Math.min(AD_MAX_SCENES, Math.floor(maxScenes)));
  const scenes = script.scenes.slice(0, cap).map((s, i) => ({ ...s, index: i, durationSec: s.durationSec || AD_SCENE_SEC }));
  const totalSec = scenes.reduce((t, s) => t + s.durationSec, 0);
  return { scenes, totalSec };
}

export interface AdScriptParams {
  brand?: string;
  price?: string;
  hook: string;
  locale?: string;
  /** Desired ad length in seconds (clamped to budget via maxScenes). */
  targetSec?: number;
  /** Max scenes the budget allows (from the cost guardrail). */
  maxScenes?: number;
  signal?: AbortSignal;
}

function buildPrompt(p: AdScriptParams): { system: string; user: string } {
  const scenes = Math.max(1, Math.min(AD_MAX_SCENES, Math.round((p.targetSec ?? 30) / AD_SCENE_SEC)));
  const system =
    'You are a senior Georgian advertising director. You output ONLY strict, minified JSON — ' +
    'no markdown, no code fences, no commentary. Every visualPrompt is a vivid English prompt for ' +
    'an image-to-video model; every narrationKa is natural Georgian (ქართული) ad copy.';
  const user =
    `Create a ${p.targetSec ?? 30}-second product ad as ${scenes} sequential 6-second shots.\n` +
    `Brand: ${p.brand || '(unnamed)'}\nPrice/badge: ${p.price || '(none)'}\nHook (≤60 chars): ${p.hook}\n\n` +
    `Return JSON exactly: {"scenes":[{"index":0,"durationSec":6,"visualPrompt":"...","narrationKa":"..."}],"totalSec":${(scenes * AD_SCENE_SEC)}}.\n` +
    `Each shot advances the story (establish → feature → benefit → CTA). JSON only.`;
  return { system, user };
}

/**
 * Generate + validate the ad script. Retries ONCE on malformed output, clamps to budget,
 * and returns a clean error rather than throwing.
 */
export async function generateAdScript(
  p: AdScriptParams,
): Promise<{ ok: true; script: AdScript } | { ok: false; error: string }> {
  const maxScenes = Math.max(1, Math.min(AD_MAX_SCENES, p.maxScenes ?? AD_MAX_SCENES));
  const { system, user } = buildPrompt(p);
  const call = (u: string) => llmText({ system, user: u, maxTokens: 1600, temperature: 0.6, timeoutMs: 45_000, signal: p.signal });

  let raw = (await call(user).catch(() => null)) ?? '';
  let parsed = parseAdScript(raw);
  if (!parsed.ok) {
    // ONE retry with a hard "JSON only" reminder.
    raw = (await call(user + '\n\nIMPORTANT: reply with ONLY valid minified JSON matching the schema — no markdown, no code fences, no prose.').catch(() => null)) ?? '';
    parsed = parseAdScript(raw);
  }
  if (!parsed.ok) {
    return { ok: false, error: 'The ad script could not be generated right now. Please try again.' };
  }
  return { ok: true, script: clampAdScript(parsed.script, maxScenes) };
}
