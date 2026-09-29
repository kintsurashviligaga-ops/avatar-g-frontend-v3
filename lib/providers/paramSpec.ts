/**
 * A model's input schema, described for a form.
 *
 * The studio's parameter chips are generated from the SAME zod schema the server validates with
 * (lib/providers/higgsfield/models.ts), so a chip can never offer a value the provider refuses — and a schema
 * change reaches the UI without anyone remembering to update a second list.
 *
 * Only what a form needs crosses to the browser: key, kind, range, options, default. Never an endpoint.
 * Media fields are recognised by their KEY — the same keys lib/studio/media.ts signs — because every media
 * URL is a refined string and the refinement itself is opaque.
 */
import { z } from 'zod';

export type ParamKind = 'text' | 'enum' | 'int' | 'number' | 'bool' | 'media' | 'mediaList';
export type MediaType = 'image' | 'video' | 'audio';

export interface ParamSpec {
  key: string;
  kind: ParamKind;
  /** No default and not optional: the request is invalid without it. */
  required: boolean;
  default?: unknown;
  /** enum values, in the schema's order. */
  options?: string[];
  /** int/number: the value range. text: the length range. mediaList: how many items. */
  min?: number;
  max?: number;
  media?: MediaType;
}

const MEDIA_SINGLE: Record<string, MediaType> = { image_url: 'image', last_image_url: 'image', video_url: 'video' };
const MEDIA_LIST: Record<string, MediaType> = { image_urls: 'image', video_urls: 'video', audio_urls: 'audio' };

interface Unwrapped {
  inner: z.ZodTypeAny;
  required: boolean;
  default?: unknown;
}

/** Peel refinements, defaults and optionals off a field, remembering what they said. */
function unwrap(t: z.ZodTypeAny): Unwrapped {
  let inner = t;
  let required = true;
  let dflt: unknown;
  for (let i = 0; i < 10; i++) {
    if (inner instanceof z.ZodEffects) inner = inner._def.schema;
    else if (inner instanceof z.ZodDefault) {
      dflt = inner._def.defaultValue();
      required = false;
      inner = inner._def.innerType;
    } else if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      required = false;
      inner = inner._def.innerType;
    } else break;
  }
  return { inner, required, ...(dflt !== undefined ? { default: dflt } : {}) };
}

function range(checks: Array<{ kind: string; value?: number }>): { min?: number; max?: number } {
  const out: { min?: number; max?: number } = {};
  for (const c of checks) {
    if (c.kind === 'min' && typeof c.value === 'number') out.min = c.value;
    if (c.kind === 'max' && typeof c.value === 'number') out.max = c.value;
  }
  return out;
}

function describeField(key: string, field: z.ZodTypeAny): ParamSpec | null {
  const { inner, required, default: dflt } = unwrap(field);
  const base = { key, required, ...(dflt !== undefined ? { default: dflt } : {}) };

  if (key in MEDIA_SINGLE) return { ...base, kind: 'media', media: MEDIA_SINGLE[key] };
  if (key in MEDIA_LIST && inner instanceof z.ZodArray) {
    return {
      ...base,
      kind: 'mediaList',
      media: MEDIA_LIST[key],
      ...(inner._def.minLength ? { min: inner._def.minLength.value } : {}),
      ...(inner._def.maxLength ? { max: inner._def.maxLength.value } : {}),
    };
  }
  if (inner instanceof z.ZodEnum) return { ...base, kind: 'enum', options: [...(inner._def.values as string[])] };
  if (inner instanceof z.ZodBoolean) return { ...base, kind: 'bool' };
  if (inner instanceof z.ZodNumber) {
    const checks = inner._def.checks as Array<{ kind: string; value?: number }>;
    return { ...base, kind: checks.some((c) => c.kind === 'int') ? 'int' : 'number', ...range(checks) };
  }
  if (inner instanceof z.ZodString) return { ...base, kind: 'text', ...range(inner._def.checks as Array<{ kind: string; value?: number }>) };
  return null;
}

/** The object schema under any top-level refinement (e.g. "at least one reference"). */
function objectOf(schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape> | null {
  let s = schema;
  for (let i = 0; i < 10 && s instanceof z.ZodEffects; i++) s = s._def.schema;
  return s instanceof z.ZodObject ? s : null;
}

/** Every field of a model's input schema a form can render, in declaration order. */
export function describeInput(schema: z.ZodTypeAny): ParamSpec[] {
  const obj = objectOf(schema);
  if (!obj) return [];
  return Object.entries(obj.shape)
    .map(([key, field]) => describeField(key, field as z.ZodTypeAny))
    .filter((p): p is ParamSpec => p !== null);
}
