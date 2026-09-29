/**
 * The prompt dock's logic, kept out of React so the money-adjacent rules are unit-tested:
 *   - what a model needs before it can be priced (missing),
 *   - exactly which keys go to /api/estimate and /api/generate (requestParams — only the schema's own keys,
 *     so a stale chip from another model can never reach the provider as an unknown field → 422),
 *   - which values survive a model switch (carryOver).
 *
 * Client-safe: types only from the server modules.
 */
import type { ParamSpec } from '@/lib/providers/paramSpec';

export type StudioTab = 'video' | 'image' | 'avatar' | 'music' | 'voice' | 'motion' | 'remix';
export type Tier = 'fast' | 'standard' | 'pro';

/** GET /api/studio/models → one of these per enabled model. */
export interface StudioModel {
  id: string;
  service: 'image' | 'video' | 'avatar' | 'motion' | 'remix';
  mode: 'text-to-image' | 'text-to-video' | 'image-to-video' | 'reference-to-video' | 'motion-transfer';
  label_ka: string;
  description_ka: string;
  label_en: string;
  tier: Tier;
  output: 'images' | 'video';
  params: ParamSpec[];
  requireOneOf: string[];
}

export type ParamValues = Record<string, unknown>;
/** Media fields hold storage paths (omni-uploads/<uid>/…) or public https URLs; lists hold several. */
export type MediaValues = Record<string, string | string[]>;

/** Advanced knobs the dock does not show (their schema default, or absence, applies). */
export const HIDDEN_PARAMS: ReadonlySet<string> = new Set(['cfg_scale']);

export const promptSpec = (m: StudioModel) => m.params.find((p) => p.key === 'prompt' && p.kind === 'text');
export const mediaSpecs = (m: StudioModel) => m.params.filter((p) => p.kind === 'media' || p.kind === 'mediaList');
export const chipSpecs = (m: StudioModel) =>
  m.params.filter((p) => (p.kind === 'enum' || p.kind === 'int' || p.kind === 'bool') && !HIDDEN_PARAMS.has(p.key));

/** Defaults for the chips (enum / int / bool); prompt and media start empty. */
export function initialParams(m: StudioModel): ParamValues {
  const out: ParamValues = {};
  for (const p of chipSpecs(m)) {
    if (p.default !== undefined) out[p.key] = p.default;
    else if (p.kind === 'enum' && p.options?.length) out[p.key] = p.options[0];
    else if (p.kind === 'int' && typeof p.min === 'number') out[p.key] = p.min;
    else if (p.kind === 'bool') out[p.key] = false;
  }
  return out;
}

/** Offered durations: common lengths inside the model's own range, both ends included. */
export function durationChoices(p: ParamSpec): number[] {
  const min = typeof p.min === 'number' ? p.min : 1;
  const max = typeof p.max === 'number' ? p.max : min;
  const common = [min, 5, 8, 10, 15, 20, 30, max];
  return [...new Set(common.filter((n) => n >= min && n <= max && Number.isInteger(n)))].sort((a, b) => a - b);
}

function valueFits(p: ParamSpec, v: unknown): boolean {
  if (p.kind === 'enum') return typeof v === 'string' && !!p.options?.includes(v);
  if (p.kind === 'bool') return typeof v === 'boolean';
  if (p.kind === 'int' || p.kind === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    if (p.kind === 'int' && !Number.isInteger(v)) return false;
    return (p.min === undefined || v >= p.min) && (p.max === undefined || v <= p.max);
  }
  return false;
}

/** Chip values after switching to `next`: what still fits is kept (16:9 stays 16:9), the rest resets. */
export function carryOver(next: StudioModel, prev: ParamValues): ParamValues {
  const out = initialParams(next);
  for (const p of chipSpecs(next)) if (p.key in prev && valueFits(p, prev[p.key])) out[p.key] = prev[p.key];
  return out;
}

/** Media values that still have a field on `next` (a first frame stays a first frame; a video input does not). */
export function carryMedia(next: StudioModel, prev: MediaValues): MediaValues {
  const out: MediaValues = {};
  for (const p of mediaSpecs(next)) {
    const v = prev[p.key];
    if (p.kind === 'media' && typeof v === 'string' && v) out[p.key] = v;
    if (p.kind === 'mediaList' && Array.isArray(v) && v.length) out[p.key] = v.slice(0, p.max ?? v.length);
  }
  return out;
}

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim().length > 0 : v !== undefined && v !== null);

/**
 * What is still missing before this request can be priced — keys, in the order the form shows them.
 * `requireOneOf` reports as its first key (e.g. "image_urls" for "add a photo or a sound").
 */
export function missing(m: StudioModel, prompt: string, media: MediaValues): string[] {
  const out: string[] = [];
  const ps = promptSpec(m);
  if (ps?.required && !prompt.trim()) out.push('prompt');
  for (const p of mediaSpecs(m)) {
    if (p.required && !filled(media[p.key])) out.push(p.key);
  }
  if (m.requireOneOf.length && !m.requireOneOf.some((k) => filled(media[k]))) out.push(m.requireOneOf[0]!);
  return out;
}

/** The body's `params`: only the schema's keys, only filled values. */
export function requestParams(m: StudioModel, prompt: string, params: ParamValues, media: MediaValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ps = promptSpec(m);
  const text = prompt.trim();
  if (ps && text) out.prompt = typeof ps.max === 'number' ? text.slice(0, ps.max) : text;
  for (const p of chipSpecs(m)) if (p.key in params && valueFits(p, params[p.key])) out[p.key] = params[p.key];
  for (const p of mediaSpecs(m)) {
    const v = media[p.key];
    if (p.kind === 'media' && typeof v === 'string' && v.trim()) out[p.key] = v.trim();
    if (p.kind === 'mediaList' && Array.isArray(v) && v.length) out[p.key] = v.slice(0, p.max ?? v.length);
  }
  return out;
}

/** A stable key for "these exact inputs" — an estimate is only reused while it is unchanged. */
export function requestKey(modelId: string, body: Record<string, unknown>): string {
  const sorted = Object.keys(body).sort().reduce<Record<string, unknown>>((acc, k) => ((acc[k] = body[k]), acc), {});
  return `${modelId}|${JSON.stringify(sorted)}`;
}

/** The tabs a model list can fill; avatar/music/voice have no studio models yet and link to their flows. */
export function modelsForTab(models: StudioModel[], tab: StudioTab): StudioModel[] {
  if (tab === 'music' || tab === 'voice') return [];
  return models.filter((m) => m.service === tab);
}

/** Price the user may spend without a second tap; above it the dock asks once more. */
export const CONFIRM_ABOVE_GEL = 10;
