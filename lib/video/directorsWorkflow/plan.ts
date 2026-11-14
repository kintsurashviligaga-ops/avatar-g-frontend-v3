/**
 * lib/video/directorsWorkflow/plan.ts — per-scene engine, resolution and price, and the checks a storyboard must pass
 * before anything is charged.
 *
 * Every rule here is the SINGLE-CLIP rule, applied scene by scene, so a 1-scene project costs exactly what the same clip
 * costs in the Video service today:
 *   • engine — directClipEngine: a Georgian line or 10 s → Gemini Omni, otherwise Veo.
 *   • resolution — directClipResolution (Veo 720p below 8 s, 1080p at 8 s; Omni as the project asks, speech 1080p).
 *   • words fit the scene — clipSpeechFits (a line longer than the clip is refused here, not rushed by the engine).
 *
 * PRICE COMES FROM A PRICER, not from this file. `livePricer` is today's price book (directClipCredits). The Phase 8.1
 * v8 price engine (draft #343) plugs in as another pricer when its wiring PR lands, so the scene cards show whichever
 * price list is live without changing this module.
 *
 * Pure and client-safe.
 */
import {
  DIRECT_CLIP_SECONDS,
  directClipCredits,
  directClipEngine,
  directClipResolution,
  type DirectClipEngine,
  type DirectClipResolution,
  type DirectClipSeconds,
} from '@/lib/video/directClip';
import { clipSpeechFits, speaksGeorgian, type ClipSpeaker } from '@/lib/video/clipPrompt';
import type { VideoQuality } from '@/lib/credits/videoPricing';
import {
  DW_ACTION_MAX,
  DW_MAX_CHARACTERS,
  DW_MAX_LINES_PER_SCENE,
  DW_MAX_SCENES,
  DW_MIN_SCENES,
  DW_SOUND_MAX,
  DW_TITLE_MAX,
  type DwProject,
  type DwScene,
} from './types';

/** Veo tier for scenes with no Georgian line. Fast = the Video service's default clip. */
export const DW_VEO_TIER: VideoQuality = 'fast';

/** What one scene renders as: the inputs every pricer and the renderer read. */
export interface DwClipSpec {
  engine: DirectClipEngine;
  seconds: DirectClipSeconds;
  resolution: DirectClipResolution;
  /** 'ka' when a line is Georgian (the engine and price follow it). */
  speech: 'ka' | null;
  tier: VideoQuality;
  /** Reference photos sent with the scene (a first frame counts as one). */
  photos: number;
}

/** Credits for one scene's clip. */
export type DwPricer = (clip: DwClipSpec) => number;

/** Today's price book — the same function the Video service quotes a single clip with. */
export const livePricer: DwPricer = (c) =>
  directClipCredits({ seconds: c.seconds, tier: c.tier, photos: c.photos, resolution: c.resolution, speech: c.speech });

const linesOf = (scene: DwScene): string[] => scene.audio.lines.map((l) => l.text.trim()).filter(Boolean);

/** The speakers of a scene's lines, in order, as clipSpeechFits counts turns. */
export function sceneSpeakers(project: DwProject, scene: DwScene): ClipSpeaker[] {
  return scene.audio.lines
    .filter((l) => l.text.trim())
    .map((l) => {
      const c = project.characters.find((x) => x.id === l.characterId);
      return { who: c?.name ?? '', voice: c?.voice ?? null };
    });
}

export function sceneClipSpec(project: DwProject, scene: DwScene): DwClipSpec {
  const speech = speaksGeorgian(linesOf(scene)) ? 'ka' : null;
  const engine = directClipEngine(scene.seconds, speech);
  const photos = scene.firstFrame === 'photo' && scene.photoId ? 1 : scene.firstFrame === 'previous' ? 1 : 0;
  return {
    engine,
    seconds: scene.seconds,
    resolution: directClipResolution(scene.seconds, project.resolution, speech),
    speech,
    tier: DW_VEO_TIER,
    photos,
  };
}

export interface DwSceneQuote {
  sceneId: string;
  order: number;
  clip: DwClipSpec;
  credits: number;
}

export interface DwQuote {
  scenes: DwSceneQuote[];
  totalCredits: number;
  totalSeconds: number;
}

/** The storyboard's price, scene by scene. What the user approves is this total for this version. */
export function quoteProject(project: DwProject, pricer: DwPricer = livePricer): DwQuote {
  const scenes = [...project.scenes]
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const clip = sceneClipSpec(project, s);
      return { sceneId: s.id, order: s.order, clip, credits: pricer(clip) };
    });
  return {
    scenes,
    totalCredits: scenes.reduce((n, s) => n + s.credits, 0),
    totalSeconds: scenes.reduce((n, s) => n + s.clip.seconds, 0),
  };
}

/** One problem the user must fix on the card, before any money is spent. `sceneId` null = the whole project. */
export interface DwProblem {
  sceneId: string | null;
  code:
    | 'scene_count'
    | 'character_count'
    | 'order'
    | 'duplicate_id'
    | 'seconds'
    | 'title'
    | 'action'
    | 'unknown_character'
    | 'speaker_not_in_scene'
    | 'too_many_lines'
    | 'speech_too_long'
    | 'first_frame'
    | 'sound_too_long';
  /** Plain English for logs and tests; the UI shows its own Georgian copy per code. */
  detail: string;
}

/** Everything wrong with a storyboard. Empty = it may be quoted and approved. */
export function validateProject(project: DwProject): DwProblem[] {
  const out: DwProblem[] = [];
  const add = (sceneId: string | null, code: DwProblem['code'], detail: string) => out.push({ sceneId, code, detail });

  const n = project.scenes.length;
  if (n < DW_MIN_SCENES || n > DW_MAX_SCENES) add(null, 'scene_count', `${n} scenes; allowed ${DW_MIN_SCENES}–${DW_MAX_SCENES}`);
  if (project.characters.length > DW_MAX_CHARACTERS) add(null, 'character_count', `${project.characters.length} characters; at most ${DW_MAX_CHARACTERS}`);

  const ids = new Set<string>();
  for (const id of [...project.characters.map((c) => c.id), ...project.scenes.map((s) => s.id)]) {
    if (ids.has(id)) add(null, 'duplicate_id', `id "${id}" is used twice`);
    ids.add(id);
  }

  const orders = project.scenes.map((s) => s.order).sort((a, b) => a - b);
  if (orders.some((o, i) => o !== i + 1)) add(null, 'order', `scene order must be 1…${n} with no gaps`);

  const charIds = new Set(project.characters.map((c) => c.id));
  for (const s of project.scenes) {
    if (!(DIRECT_CLIP_SECONDS as readonly number[]).includes(s.seconds)) add(s.id, 'seconds', `${s.seconds} s; allowed ${DIRECT_CLIP_SECONDS.join('/')}`);
    if (s.title.length > DW_TITLE_MAX) add(s.id, 'title', `title longer than ${DW_TITLE_MAX}`);
    const action = s.action.trim();
    if (!action || action.length > DW_ACTION_MAX) add(s.id, 'action', `action must be 1–${DW_ACTION_MAX} characters`);

    for (const id of s.characterIds) if (!charIds.has(id)) add(s.id, 'unknown_character', `character "${id}" is not in the project`);
    const lines = s.audio.lines.filter((l) => l.text.trim());
    if (lines.length > DW_MAX_LINES_PER_SCENE) add(s.id, 'too_many_lines', `${lines.length} lines; at most ${DW_MAX_LINES_PER_SCENE}`);
    for (const l of lines) {
      if (!charIds.has(l.characterId)) add(s.id, 'unknown_character', `line speaker "${l.characterId}" is not in the project`);
      else if (!s.characterIds.includes(l.characterId)) add(s.id, 'speaker_not_in_scene', `"${l.characterId}" speaks but is not on screen`);
    }
    if (lines.length > 0) {
      const fit = clipSpeechFits(lines.map((l) => l.text), s.seconds, sceneSpeakers(project, s));
      if (!fit.fits) add(s.id, 'speech_too_long', `the lines take ~${fit.seconds} s; too long for ${s.seconds} s`);
    }

    if (s.firstFrame === 'previous' && s.order === 1) add(s.id, 'first_frame', 'scene 1 has no previous scene');
    if (s.firstFrame === 'photo' && !s.photoId) add(s.id, 'first_frame', 'first frame "photo" needs a photo');

    const sounds = [s.audio.ambience, s.audio.music ?? '', ...s.audio.effects];
    if (sounds.some((x) => x.length > DW_SOUND_MAX)) add(s.id, 'sound_too_long', `a sound note is longer than ${DW_SOUND_MAX}`);
  }
  return out;
}
