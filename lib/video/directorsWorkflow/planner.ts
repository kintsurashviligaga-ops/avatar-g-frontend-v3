/**
 * lib/video/directorsWorkflow/planner.ts — the storyboard draft: the instruction the planner model gets, and the strict
 * reader of its answer.
 *
 * The planner only PROPOSES. Its draft lands on the scene cards, the user edits and approves it, and nothing renders or
 * is charged before that. The reader therefore never "fixes" a scene silently into something else: it clamps lengths
 * to the nearest allowed clip, drops what is unusable, and returns the problems so the cards can show them.
 *
 * THE USER'S WORDS STAY THE USER'S: dialogue is kept in the language it was given (Georgian lines stay Georgian; the
 * engine says them in the character's own voice), and an idea the user already split into scenes is kept as written.
 *
 * Pure; the model call itself lives in the server route (Phase 8.3), on Vertex like every other Gemini call.
 */
import { DIRECT_CLIP_SECONDS, snapDirectClipSeconds, type DirectClipAspect, type DirectClipResolution } from '@/lib/video/directClip';
import { validateProject, type DwProblem } from './plan';
import {
  DW_ACTION_MAX,
  DW_MAX_CHARACTERS,
  DW_MAX_LINES_PER_SCENE,
  DW_MAX_SCENES,
  DW_SOUND_MAX,
  DW_TITLE_MAX,
  type DwCharacter,
  type DwFirstFrame,
  type DwProject,
  type DwScene,
} from './types';

export interface DwPlannerInput {
  idea: string;
  /** The scene count the user asked for, or null = the planner picks (1–10). */
  scenes: number | null;
  aspect: DirectClipAspect;
  /** The language the user writes in; titles and actions come back in it. */
  locale: 'ka' | 'en' | 'ru';
}

/** The instruction for the planner model. Asks for JSON only, in the shape parsePlannerAnswer reads. */
export function plannerInstruction(input: DwPlannerInput): string {
  const count = input.scenes
    ? `exactly ${Math.min(Math.max(Math.round(input.scenes), 1), DW_MAX_SCENES)} scenes`
    : `between 1 and ${DW_MAX_SCENES} scenes (as few as tell the story well)`;
  const lang = { ka: 'Georgian', en: 'English', ru: 'Russian' }[input.locale];
  return [
    `You are a film director planning a short ${input.aspect} video as a storyboard of ${count}.`,
    `Each scene is ONE continuous shot of ${DIRECT_CLIP_SECONDS.join(', ')} seconds.`,
    `At most ${DW_MAX_CHARACTERS} characters. Describe each character's look (face, age, hair, clothes) once, never the background.`,
    `Dialogue: at most ${DW_MAX_LINES_PER_SCENE} short lines per scene, said aloud by characters ON SCREEN in that scene. Keep every line in the language the user wrote it in; if the user wrote Georgian, write the lines in Georgian. No narrator, no voice-over.`,
    'A line must be short enough to say naturally in the scene\'s length (about 2 words per second). Pick a longer scene rather than rushing.',
    'Sound per scene: ambience and sound effects that fit; music only if the user asked for music, otherwise null.',
    `firstFrame: "previous" when the scene continues straight from the last frame of the scene before it, otherwise "none". Scene 1 is always "none".`,
    `Write titles, actions and camera notes in ${lang}. If the user already split the idea into scenes, keep their split and words.`,
    'Answer with JSON only:',
    '{"title":"…","logline":"…","characters":[{"id":"c1","name":"…","look":"…","voice":"male|female"}],"scenes":[{"title":"…","action":"…","camera":"…","seconds":8,"characterIds":["c1"],"lines":[{"characterId":"c1","text":"…"}],"ambience":"…","effects":["…"],"music":null,"firstFrame":"none|previous"}]}',
    '',
    `The user's idea:\n${input.idea.trim()}`,
  ].join('\n');
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** The JSON object in a model answer (it may come fenced or with words around it). */
function jsonOf(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return rec(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export type DwPlannerResult =
  | { ok: true; project: DwProject; problems: DwProblem[] }
  | { ok: false; reason: 'not_json' | 'no_scenes' };

export interface DwPlannerDefaults {
  id: string;
  aspect: DirectClipAspect;
  resolution: DirectClipResolution;
  /** Id maker for scenes (tests pass a counter). */
  sceneId: (i: number) => string;
}

/** Read the planner's answer into a draft project. Never throws. */
export function parsePlannerAnswer(raw: string, d: DwPlannerDefaults): DwPlannerResult {
  const j = jsonOf(raw);
  if (!j) return { ok: false, reason: 'not_json' };

  const characters: DwCharacter[] = [];
  for (const c of Array.isArray(j.characters) ? j.characters : []) {
    const o = rec(c);
    if (!o || characters.length >= DW_MAX_CHARACTERS) continue;
    const id = str(o.id, 24) || `c${characters.length + 1}`;
    const name = str(o.name, 40);
    if (!name || characters.some((x) => x.id === id)) continue;
    characters.push({ id, name, look: str(o.look, 400), voice: o.voice === 'male' ? 'male' : 'female' });
  }
  const known = new Set(characters.map((c) => c.id));

  const scenes: DwScene[] = [];
  for (const s of Array.isArray(j.scenes) ? j.scenes : []) {
    const o = rec(s);
    if (!o || scenes.length >= DW_MAX_SCENES) continue;
    const action = str(o.action, DW_ACTION_MAX);
    if (!action) continue;
    const characterIds = (Array.isArray(o.characterIds) ? o.characterIds : []).map((x) => str(x, 24)).filter((x) => known.has(x));
    const lines = (Array.isArray(o.lines) ? o.lines : [])
      .map(rec)
      .filter((l): l is Record<string, unknown> => !!l)
      .map((l) => ({ characterId: str(l.characterId, 24), text: str(l.text, 300) }))
      .filter((l) => l.text && known.has(l.characterId))
      .slice(0, DW_MAX_LINES_PER_SCENE);
    // A speaker the planner forgot to put on screen is put there: they say the line, so they are in the shot.
    for (const l of lines) if (!characterIds.includes(l.characterId)) characterIds.push(l.characterId);
    const order = scenes.length + 1;
    const firstFrame: DwFirstFrame = order > 1 && o.firstFrame === 'previous' ? 'previous' : 'none';
    const music = str(o.music, DW_SOUND_MAX);
    scenes.push({
      id: d.sceneId(order),
      order,
      title: str(o.title, DW_TITLE_MAX),
      action,
      camera: str(o.camera, 200),
      seconds: snapDirectClipSeconds(o.seconds),
      characterIds,
      audio: {
        lines,
        ambience: str(o.ambience, DW_SOUND_MAX),
        effects: (Array.isArray(o.effects) ? o.effects : []).map((e) => str(e, DW_SOUND_MAX)).filter(Boolean).slice(0, 4),
        music: music || null,
      },
      firstFrame,
    });
  }
  if (scenes.length === 0) return { ok: false, reason: 'no_scenes' };

  const project: DwProject = {
    id: d.id,
    title: str(j.title, DW_TITLE_MAX),
    logline: str(j.logline, 300),
    aspect: d.aspect,
    resolution: d.resolution,
    characters,
    scenes,
    status: 'draft',
    version: 1,
  };
  return { ok: true, project, problems: validateProject(project) };
}
