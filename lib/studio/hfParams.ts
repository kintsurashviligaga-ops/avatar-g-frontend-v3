/**
 * lib/studio/hfParams.ts — what the Image and Video panels send when a Higgsfield model is picked: the panel's own state
 * (shape, length, sound, size, reference pictures) mapped onto THAT model's parameters, as Studio β's dock describes them
 * (GET /api/studio/models → ParamSpec[], built from the same zod schema the server validates with).
 *
 * ⚠️ A VALUE THE MODEL DOES NOT TAKE IS NEVER SENT. Each hint is applied only when the model has that parameter AND the value
 * fits it (lib/studio/ui/dock valueFits via carryOver); otherwise the model's own default stands. `requestParams` then keeps
 * only the schema's keys — a stray field would be a 422 at the provider after the reserve.
 *
 * ⚠️ A PANEL LENGTH THE MODEL CANNOT RENDER IS CLAMPED, AND SAID. The film panel offers 4 s … 96 s; Kling renders 3–15 s.
 * `hfSummary` prints the length that will really be rendered next to the price, so nobody pays for 24 s and gets 15.
 *
 * Pure: no React, no fetch.
 */
import type { ParamSpec } from '@/lib/providers/paramSpec';
import { carryOver, mediaSpecs, requestParams, type MediaValues, type ParamValues, type StudioModel } from '@/lib/studio/ui/dock';

/** What a panel knows, in its own words. */
export interface PanelHints {
  /** The panel's shape: '9:16', '1:1', … */
  aspect?: string;
  /** The panel's length in seconds. */
  seconds?: number;
  /** Native sound on/off. */
  sound?: boolean;
  /** The image panel's size: standard (1K) · high (2K) · ultra (4K). */
  quality?: 'standard' | 'high' | 'ultra';
}

const spec = (m: StudioModel, key: string): ParamSpec | undefined => m.params.find((p) => p.key === key);

/** The model's resolution option closest to the panel's size (smallest for standard, largest otherwise). */
function resolutionFor(p: ParamSpec, quality: PanelHints['quality']): string | undefined {
  const opts = p.options ?? [];
  if (!opts.length || !quality) return undefined;
  return quality === 'standard' ? opts[0] : opts[opts.length - 1];
}

/** The panel's state as values for this model (only the ones it takes, and only where they fit). */
export function hfValues(model: StudioModel, hints: PanelHints): ParamValues {
  const wanted: ParamValues = {};
  const ar = spec(model, 'aspect_ratio');
  if (ar && hints.aspect) wanted.aspect_ratio = hints.aspect;
  const d = spec(model, 'duration');
  if (d && typeof hints.seconds === 'number' && Number.isFinite(hints.seconds)) {
    const lo = typeof d.min === 'number' ? d.min : hints.seconds;
    const hi = typeof d.max === 'number' ? d.max : hints.seconds;
    wanted.duration = Math.min(hi, Math.max(lo, Math.round(hints.seconds)));
  }
  if (typeof hints.sound === 'boolean') {
    const s = spec(model, 'sound');
    if (s?.kind === 'enum') wanted.sound = hints.sound ? 'on' : 'off';
    if (spec(model, 'generate_audio')?.kind === 'bool') wanted.generate_audio = hints.sound;
  }
  const r = spec(model, 'resolution');
  if (r?.kind === 'enum') {
    const v = resolutionFor(r, hints.quality);
    if (v) wanted.resolution = v;
  }
  // carryOver starts from the model's own defaults and keeps a wanted value only when it fits the schema.
  return carryOver(model, wanted);
}

/** Which media keys the panel's pictures fill (a first frame, or a reference list up to the model's own cap). */
export function hfMediaKeys(model: StudioModel): { single: string | null; list: { key: string; max: number } | null } {
  const media = mediaSpecs(model).filter((p) => p.media === 'image');
  const single = media.find((p) => p.kind === 'media' && p.key === 'image_url')?.key ?? null;
  const l = media.find((p) => p.kind === 'mediaList');
  return { single, list: l ? { key: l.key, max: typeof l.max === 'number' ? l.max : 1 } : null };
}

/** Uploaded picture paths placed on the model's media keys. */
export function hfMedia(model: StudioModel, paths: readonly string[]): MediaValues {
  const { single, list } = hfMediaKeys(model);
  if (!paths.length) return {};
  if (single) return { [single]: paths[0]! };
  if (list) return { [list.key]: paths.slice(0, list.max) };
  return {};
}

/** The request body's params: the prompt, the mapped values and the media — the schema's keys only. */
export function hfRequest(model: StudioModel, prompt: string, hints: PanelHints, media: MediaValues): Record<string, unknown> {
  return requestParams(model, prompt, hfValues(model, hints), media);
}

/** "15 s · 9:16 · sound on" — what will REALLY be rendered, printed beside the price. */
export function hfSummary(model: StudioModel, values: ParamValues, words: { seconds: string; soundOn: string; soundOff: string }): string {
  const parts: string[] = [];
  if (typeof values.duration === 'number') parts.push(`${values.duration} ${words.seconds}`);
  if (typeof values.aspect_ratio === 'string') parts.push(values.aspect_ratio);
  if (typeof values.resolution === 'string') parts.push(values.resolution);
  const sound = values.sound === 'on' || values.generate_audio === true ? true : values.sound === 'off' || values.generate_audio === false ? false : null;
  if (sound !== null) parts.push(sound ? words.soundOn : words.soundOff);
  return parts.join(' · ');
}
