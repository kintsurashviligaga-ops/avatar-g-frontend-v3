/**
 * lib/veo/renderOptions.ts — the wire contract for the studio's Veo plan (lib/video/veoPlan.ts → toRenderOptions).
 *
 * ONE zod schema, used twice: /api/chat/orchestrate validates the request body with it, and filmComposite
 * re-parses `metadata.veo` with it (metadata is `Record<string, unknown>` by the time it gets there, and a film
 * token or a direct caller can put anything in it). Anything outside the Veo vocabulary is rejected at the door,
 * never interpreted downstream.
 */
import { z } from 'zod';
import type { FilmVeoOptions, SceneScreenwriterMeta } from '@/lib/chat/filmPipeline';
import type { CameraSpec } from '@/lib/veo/types';

/** The film's scene ceiling (MAX_SEGMENTS in lib/chat/filmPipeline) — restated here to keep this module import-light. */
const MAX_SCENES = 12;

const CameraMoveSchema = z.enum([
  'auto', 'static', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'push_in', 'pull_out', 'truck_left', 'truck_right',
  'pedestal_up', 'pedestal_down', 'zoom_in', 'zoom_out', 'orbit', 'crane_up', 'crane_down', 'aerial', 'handheld',
]);
const ShotSizeSchema = z.enum(['auto', 'extreme_wide', 'wide', 'full', 'medium', 'medium_close', 'close_up', 'extreme_close_up']);
const CameraAngleSchema = z.enum(['auto', 'eye_level', 'low', 'high', 'birds_eye', 'worms_eye', 'dutch', 'over_shoulder', 'pov']);
const LensLookSchema = z.enum(['auto', 'wide_angle', 'standard', 'telephoto', 'macro', 'shallow_focus', 'deep_focus']);

export const CameraSpecSchema = z.object({
  move: CameraMoveSchema,
  intensity: z.number().int().min(1).max(10),
  shot: ShotSizeSchema,
  angle: CameraAngleSchema,
  lens: LensLookSchema,
});

export const VeoRenderOptionsSchema = z.object({
  tier: z.enum(['standard', 'fast', 'lite']),
  format: z.enum(['9:16', '16:9', '1:1', '4:5']),
  referenceMode: z.enum(['first_frame', 'reference']),
  generateAudio: z.boolean(),
  seedLock: z.boolean(),
  enhancePrompt: z.boolean(),
  negativePrompt: z.string().max(800).optional(),
  scenes: z.array(z.object({
    camera: CameraSpecSchema,
    transitionOut: z.enum(['cut', 'crossfade', 'dissolve', 'fade_black']),
  })).max(MAX_SCENES),
});

export type VeoRenderOptionsWire = z.infer<typeof VeoRenderOptionsSchema>;

/** The director's per-scene provenance from the storyboard (lib/chat/promptAgent MasterFilmScene). */
export const SceneMetaSchema = z.array(z.object({
  cameraShot: z.string().max(400).optional(),
  mood: z.string().max(200).optional(),
  location: z.string().max(300).optional(),
  lighting: z.string().max(300).optional(),
  camera: z.object({ move: CameraMoveSchema, shot: ShotSizeSchema, angle: CameraAngleSchema, lens: LensLookSchema }).optional(),
})).max(MAX_SCENES);

export interface ParsedVeoRender {
  film: FilmVeoOptions;
  scenes: Array<{ camera: CameraSpec }>;
  transitions: Array<'cut' | 'crossfade' | 'dissolve' | 'fade_black'>;
  negativePrompt?: string;
}

/** Re-validate `metadata.veo` server-side. null for anything that is not a well-formed plan. */
export function parseVeoRenderOptions(raw: unknown): ParsedVeoRender | null {
  const r = VeoRenderOptionsSchema.safeParse(raw);
  if (!r.success) return null;
  const o = r.data;
  return {
    film: { tier: o.tier, format: o.format, referenceMode: o.referenceMode, generateAudio: o.generateAudio, seedLock: o.seedLock, enhancePrompt: o.enhancePrompt },
    scenes: o.scenes.map((s) => ({ camera: s.camera })),
    transitions: o.scenes.slice(0, -1).map((s) => s.transitionOut),
    ...(o.negativePrompt?.trim() ? { negativePrompt: o.negativePrompt.trim() } : {}),
  };
}

/** Re-validate `metadata.sceneMeta`. undefined for anything malformed (the render then uses its own sources). */
export function parseSceneMeta(raw: unknown): SceneScreenwriterMeta[] | undefined {
  const r = SceneMetaSchema.safeParse(raw);
  if (!r.success || r.data.length === 0) return undefined;
  return r.data.map((m) => ({
    ...(m.cameraShot ? { cameraShot: m.cameraShot } : {}),
    ...(m.mood ? { mood: m.mood } : {}),
    ...(m.location ? { location: m.location } : {}),
    ...(m.lighting ? { lighting: m.lighting } : {}),
    ...(m.camera ? { camera: m.camera } : {}),
  }));
}
