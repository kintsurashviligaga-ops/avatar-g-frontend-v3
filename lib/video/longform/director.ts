/**
 * lib/video/longform/director.ts — the long-form Director: one brief → a BIBLE → one storyboard call per ACT.
 *
 * Why chunked (the breakpoint this removes): runPromptAgent (lib/chat/promptAgent.ts) writes a whole film in ONE
 * call with maxTokens = min(8000, 1500 + 400·n). Every scene repeats each on-screen person's full wardrobe, so the
 * budget is already at its ceiling for 12–13 scenes; a 30-scene film would be cut off mid-JSON and fall back to the
 * deterministic plan. So the work is split:
 *
 *   1. ONE "bible" call — the cast (each person's LOCKED visual description), the look and palette, the arc (one
 *      entry per act, each ending on a closing image), and the music direction. Small and bounded.
 *   2. ONE call per act (≤ 12 scenes, plan.planActs) with the bible injected VERBATIM, plus the previous act's last
 *      scene and its end state, so act N+1 opens where act N closed. Acts run sequentially for that reason.
 *
 * ⚠️ IDENTITY IS LOCKED TWICE. The bible rides into every act call, but a model can still paraphrase a description
 * in its own prose. So the Veo prompt is NOT the act model's prose: each scene names the character ids on screen,
 * and buildSceneClipInput compiles the shot (lib/veo/promptCompiler) with the subject taken from the BIBLE's locked
 * descriptions — the same text in every clip of every act, whatever the act model wrote. The model's own
 * `imagePrompt` is kept for the storyboard UI (it is the MasterFilmScene shape the existing board renders).
 *
 * ⚠️ NEVER TRUST THE SHAPE. The model's reply is parsed with a size cap, every string is clipped and stripped of
 * control characters, enums are checked against Google's camera vocabulary, unknown character ids are dropped, and a
 * dialogue line too long to speak in 8 s is DROPPED rather than truncated (a cut line is half a sentence spoken —
 * the same rule as lib/chat/sceneDialogue). A bad reply is retried ONCE with a correction note; a second miss fails
 * the storyboard with a named reason. Nothing is charged before the storyboard exists, so failing is cheap.
 *
 * The LLM is an injected `generate(prompt, opts)` — this module never touches a provider, a key or the network,
 * so it is fully testable with a fake generator. runtime.ts adapts lib/ai/llmText to it.
 */
import type { MasterFilmScene } from '@/lib/chat/promptAgent';
import type { CreateVeoClipInput } from '@/lib/veo/engine';
import { FILM_DRIFT_NEGATIVE, stripNegativeTail } from '@/lib/chat/filmPipeline';
import { MAX_SPOKEN_LINE_CHARS } from '@/lib/chat/sceneDialogue';
import { framingHintFor } from '@/lib/veo/capabilities';
import { CAMERA_ANGLES, CAMERA_MOVES, clampIntensity, LENS_LOOKS, NEUTRAL_INTENSITY, SHOT_SIZES } from '@/lib/veo/cinematography';
import { compileShotPrompt } from '@/lib/veo/promptCompiler';
import type { CameraSpec, DialogueLine, OutputFormat, ShotSpec, VeoResolution, VeoTier } from '@/lib/veo/types';
import { LONGFORM_SCENE_SEC, longformSceneCount, planActs, type LongformAct } from './plan';

// ── Bounds ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A reply longer than this is not parsed at all (a runaway or hostile generation). */
export const MAX_REPLY_CHARS = 200_000;
export const MAX_CHARACTERS = 6;
const MAX_PALETTE = 6;
const MAX_DIALOGUE_PER_SCENE = 2;
/** Scene objects looked at per act reply — a reply with 10 000 entries is not walked. */
const MAX_SCENE_ENTRIES = 64;
const BRIEF_CHARS = 4000;

const LIMITS = {
  title: 120,
  logline: 400,
  name: 60,
  role: 120,
  description: 600,
  lookField: 300,
  paletteItem: 40,
  negative: 800,
  arcTitle: 120,
  arcSummary: 800,
  arcBeat: 200,
  closingImage: 400,
  musicField: 200,
  musicDirection: 600,
  imagePrompt: 1200,
  action: 500,
  location: 300,
  cameraShot: 200,
  mood: 120,
  lighting: 300,
  sfx: 200,
  endState: 300,
  speaker: 40,
} as const;

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LongformCharacter {
  /** Stable id the act calls refer to: lowercase a-z, 0-9, underscore. */
  id: string;
  name: string;
  role: string;
  /** The LOCKED appearance — pasted verbatim as the Veo subject in every shot this person is in. English. */
  description: string;
}

export interface LongformLook {
  colorGrade: string;
  lighting: string;
  cameraStyle: string;
  palette: string[];
  /** Nouns to exclude, film-wide (merged into every clip's negative prompt). */
  negativePrompt: string;
}

export interface LongformArcAct {
  /** 0-based act index. */
  act: number;
  title: string;
  summary: string;
  beat: string;
  /** How the act's final shot looks — the next act opens from it. */
  closingImage: string;
}

export interface LongformMusic {
  genre: string;
  mood: string;
  tempoBpm: number | null;
  instrumentation: string;
  /** How the score evolves across the acts. Instrumental only. */
  direction: string;
}

export interface LongformBible {
  title: string;
  logline: string;
  characters: LongformCharacter[];
  /** The lead (characters[0]) or null for a film with no recurring person. */
  primaryCharacterId: string | null;
  look: LongformLook;
  /** Exactly one entry per act, in act order. */
  arc: LongformArcAct[];
  music: LongformMusic;
}

/** One 8 s scene: the existing storyboard shape (MasterFilmScene) + what the long-form queue needs to render it. */
export interface LongformScene extends MasterFilmScene {
  /** 0-based, film-wide. sceneNumber = ordinal + 1. */
  ordinal: number;
  /** 0-based act index. */
  act: number;
  /** Bible character ids on screen (verified against the bible). */
  characters: string[];
  dialogue: DialogueLine[];
  /** One sentence: what the clip's final frame shows. */
  endState: string;
  continuity: {
    /** The end state of the scene immediately before this one (across an act boundary too); null for scene 1. */
    previousEndState: string | null;
    /**
     * True for the first scene of every act after the first: render it from the LAST FRAME of the previous act's
     * last clip when the job chains act frames (stateMachine dependsOn). Within an act the clips run in parallel.
     */
    seedFromPreviousActLastFrame: boolean;
  };
  /** The structured Veo shot (lib/veo/types) with the subject locked from the bible. hasStartImage is set at render. */
  shot: ShotSpec;
}

export interface LongformStoryboard {
  bible: LongformBible;
  acts: Array<LongformAct & { attempts: number }>;
  scenes: LongformScene[];
  /** Generator calls made (bible + acts + retries). */
  calls: number;
}

export type DirectorError = 'invalid_duration' | 'bible_unparseable' | 'act_unparseable';

export type DirectorResult =
  | { ok: true; storyboard: LongformStoryboard }
  | { ok: false; error: DirectorError; act?: number; detail: string; calls: number };

export interface DirectorCallOptions {
  system: string;
  maxTokens: number;
  temperature: number;
  /** Always true: ask for a JSON document (Gemini responseMimeType application/json). */
  json: true;
  purpose: 'bible' | 'act';
  /** 0-based act index (purpose 'act'). */
  act?: number;
  /** 1 on the first try, 2 on the retry. */
  attempt: number;
  /**
   * Set only by a caller's deadline wrapper (api.runDirectorWithDeadline), never by the Director: the most this one
   * call may take, and the signal that aborts it when the whole storyboard runs out of time.
   */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** The injected LLM call. A thrown error, null or '' all read as "no usable reply". */
export type DirectorGenerate = (prompt: string, opts: DirectorCallOptions) => Promise<string | null>;

export interface DirectorInput {
  brief: string;
  /** A validated long-form length (plan.isLongformDuration). */
  seconds: number;
  /** Language the user writes in and any dialogue is SPOKEN in (BCP-47). Every visual field stays English. */
  language?: string;
  /** 'film' | 'music_video' | … — free text, passed to the bible call. */
  mode?: string;
  /** A vision-extracted description of the user's reference person: becomes the lead's locked description. */
  characterVisualId?: string;
  hasReferenceImage?: boolean;
  /** Lines the user wants spoken (passed to the act calls; still bounded per scene). */
  dialogue?: string | null;
}

// ── Defensive parsing ────────────────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** A string field: non-strings become '', control characters and runs of whitespace collapse, then clipped. */
function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const t = v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).trimEnd() : t;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The first JSON value in a model reply: code fences stripped, then the outermost {…} or […] parsed. Null for
 * anything that is not a string, is over MAX_REPLY_CHARS, or does not parse. Never throws.
 */
export function parseModelJson(reply: unknown): unknown {
  if (typeof reply !== 'string' || reply.length === 0 || reply.length > MAX_REPLY_CHARS) return null;
  const unfenced = reply.replace(/```(?:json)?/gi, '').trim();
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const whole = tryParse(unfenced);
  if (whole !== undefined) return whole;
  for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
    const a = unfenced.indexOf(open);
    const b = unfenced.lastIndexOf(close);
    if (a >= 0 && b > a) {
      const inner = tryParse(unfenced.slice(a, b + 1));
      if (inner !== undefined) return inner;
    }
  }
  return null;
}

/** A model-supplied id → [a-z0-9_]{1,32}, or '' when nothing usable is left. */
function toId(v: unknown): string {
  return text(v, 64)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

function pickEnum<T extends string>(v: unknown, options: readonly { id: T }[]): T {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (options.find((o) => o.id === s)?.id ?? 'auto') as T;
}

/** Google's documented camera vocabulary only (lib/veo/cinematography); anything else is 'auto'. */
export function coerceCamera(raw: unknown): CameraSpec {
  const o = isRecord(raw) ? raw : {};
  const intensity = typeof o.intensity === 'number' ? clampIntensity(o.intensity) : NEUTRAL_INTENSITY;
  return {
    move: pickEnum(o.move, CAMERA_MOVES),
    intensity,
    shot: pickEnum(o.shot, SHOT_SIZES),
    angle: pickEnum(o.angle, CAMERA_ANGLES),
    lens: pickEnum(o.lens, LENS_LOOKS),
  };
}

/**
 * The bible, coerced. Null when it has no usable arc (an arc is the one thing every act call needs). Characters
 * are optional — a landscape film has none — but a vision-extracted reference identity always becomes the lead.
 */
export function coerceBible(raw: unknown, actCount: number, input: Pick<DirectorInput, 'characterVisualId'> = {}): LongformBible | null {
  if (!isRecord(raw)) return null;

  // Cast: ≤ 6, each needs a description; ids sanitised and made unique.
  const castRaw = Array.isArray(raw.characters) ? raw.characters.slice(0, MAX_CHARACTERS * 4) : [];
  const characters: LongformCharacter[] = [];
  const seen = new Set<string>();
  for (const c of castRaw) {
    if (characters.length >= MAX_CHARACTERS) break;
    if (!isRecord(c)) continue;
    const description = stripNegativeTail(text(c.description, LIMITS.description));
    if (!description) continue;
    const name = text(c.name, LIMITS.name);
    let id = toId(c.id) || toId(name) || `character_${characters.length + 1}`;
    for (let n = 2; seen.has(id); n++) id = `${id.slice(0, 28)}_${n}`;
    seen.add(id);
    characters.push({ id, name: name || id, role: text(c.role, LIMITS.role), description });
  }

  // ⚠️ HARD LOCK (as runPromptAgent does): a description extracted FROM the user's photo is ground truth and
  // replaces whatever the text-only model guessed for the lead.
  const vid = text(input.characterVisualId, LIMITS.description);
  if (vid) {
    const lead = characters[0];
    if (lead) characters[0] = { ...lead, description: vid };
    else characters.push({ id: 'protagonist', name: 'Protagonist', role: 'lead', description: vid });
  }

  const arcRaw = Array.isArray(raw.arc) ? raw.arc.slice(0, Math.max(actCount, 1) * 4) : [];
  const realArc = arcRaw.filter(isRecord).map((a) => ({
    title: text(a.title, LIMITS.arcTitle),
    summary: text(a.summary, LIMITS.arcSummary),
    beat: text(a.beat, LIMITS.arcBeat),
    closingImage: text(a.closingImage, LIMITS.closingImage),
  }));
  if (!realArc.some((a) => a.summary)) return null;
  // Exactly one entry per act: extras dropped, a short arc padded (the act call then continues the story).
  const arc: LongformArcAct[] = Array.from({ length: actCount }, (_, act) => {
    const a = realArc[act];
    return {
      act,
      title: a?.title || `Act ${act + 1}`,
      summary: a?.summary || '',
      beat: a?.beat || '',
      closingImage: a?.closingImage || '',
    };
  });

  const look = isRecord(raw.look) ? raw.look : {};
  const palette = (Array.isArray(look.palette) ? look.palette.slice(0, MAX_PALETTE * 4) : [])
    .map((p) => text(p, LIMITS.paletteItem))
    .filter(Boolean)
    .slice(0, MAX_PALETTE);
  const music = isRecord(raw.music) ? raw.music : {};
  const bpm = typeof music.tempoBpm === 'number' && Number.isFinite(music.tempoBpm) ? Math.round(music.tempoBpm) : NaN;

  return {
    title: text(raw.title, LIMITS.title),
    logline: text(raw.logline, LIMITS.logline),
    characters,
    primaryCharacterId: characters[0]?.id ?? null,
    look: {
      colorGrade: text(look.colorGrade, LIMITS.lookField),
      lighting: text(look.lighting, LIMITS.lookField),
      cameraStyle: text(look.cameraStyle, LIMITS.lookField),
      palette,
      negativePrompt: text(look.negativePrompt, LIMITS.negative),
    },
    arc,
    music: {
      genre: text(music.genre, LIMITS.musicField),
      mood: text(music.mood, LIMITS.musicField),
      tempoBpm: bpm >= 40 && bpm <= 220 ? bpm : null,
      instrumentation: text(music.instrumentation, LIMITS.musicField),
      direction: text(music.direction, LIMITS.musicDirection),
    },
  };
}

/** A scene as coerced from an act reply, before film-wide numbering and continuity are attached. */
interface DraftScene {
  location: string;
  action: string;
  cameraShot: string;
  camera: CameraSpec;
  lighting: string;
  mood: string;
  imagePrompt: string;
  sfxPrompt: string;
  characters: string[];
  dialogue: DialogueLine[];
  endState: string;
}

function resolveCharacterId(v: unknown, bible: LongformBible): string | null {
  const raw = text(v, 64).toLowerCase();
  if (!raw) return null;
  const id = toId(raw);
  return bible.characters.find((c) => c.id === id || c.name.toLowerCase() === raw)?.id ?? null;
}

function coerceDialogue(v: unknown, bible: LongformBible, language: string | undefined): DialogueLine[] {
  if (!Array.isArray(v)) return [];
  const out: DialogueLine[] = [];
  for (const d of v.slice(0, MAX_DIALOGUE_PER_SCENE * 4)) {
    if (out.length >= MAX_DIALOGUE_PER_SCENE) break;
    if (!isRecord(d) || typeof d.line !== 'string') continue;
    const line = d.line.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
    // ⚠️ DROPPED, NOT TRUNCATED: a line that does not fit an 8 s clip would be half a sentence spoken.
    if (!line || line.length > MAX_SPOKEN_LINE_CHARS) continue;
    const id = resolveCharacterId(d.speaker, bible);
    const speaker = (id ? bible.characters.find((c) => c.id === id)?.name : '') || text(d.speaker, LIMITS.speaker) || 'The subject';
    out.push({ speaker, line, ...(language ? { language } : {}) });
  }
  return out;
}

function coerceDraftScene(raw: unknown, bible: LongformBible, language: string | undefined): DraftScene | null {
  if (!isRecord(raw)) return null;
  const imagePrompt = stripNegativeTail(text(raw.imagePrompt, LIMITS.imagePrompt));
  let action = stripNegativeTail(text(raw.action, LIMITS.action));
  if (!action && imagePrompt) action = text(imagePrompt.split(/(?<=[.!?])\s/)[0], LIMITS.action);
  if (!action) return null;

  let characters: string[];
  if (Array.isArray(raw.characters)) {
    characters = [];
    for (const c of raw.characters.slice(0, MAX_CHARACTERS * 4)) {
      const id = resolveCharacterId(c, bible);
      if (id && !characters.includes(id)) characters.push(id);
    }
  } else {
    // Unstated → the lead is on screen (the protagonist carries the majority of shots, as in promptAgent rule 3b).
    characters = bible.primaryCharacterId ? [bible.primaryCharacterId] : [];
  }

  return {
    location: text(raw.location, LIMITS.location),
    action,
    cameraShot: text(raw.cameraShot, LIMITS.cameraShot) || 'medium',
    camera: coerceCamera(raw.camera),
    lighting: text(raw.lighting, LIMITS.lighting),
    mood: text(raw.mood, LIMITS.mood),
    imagePrompt: imagePrompt || action,
    sfxPrompt: text(raw.sfxPrompt, LIMITS.sfx),
    characters,
    dialogue: coerceDialogue(raw.dialogue, bible, language),
    endState: text(raw.endState, LIMITS.endState),
  };
}

/**
 * An act reply → exactly `expected` scenes, or null (→ retry). The reply may be `{ scenes: [...] }` or a bare
 * array. Scenes are placed by ORDER, never by the model's own sceneNumber (which is often wrong or duplicated).
 * Extra scenes are dropped; too few usable scenes is a malformed act.
 */
export function coerceActScenes(raw: unknown, expected: number, bible: LongformBible, language?: string): DraftScene[] | null {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.scenes) ? raw.scenes : null;
  if (!list || expected < 1) return null;
  const scenes: DraftScene[] = [];
  for (const s of list.slice(0, MAX_SCENE_ENTRIES)) {
    const scene = coerceDraftScene(s, bible, language);
    if (scene) scenes.push(scene);
    if (scenes.length === expected) break;
  }
  return scenes.length === expected ? scenes : null;
}

// ── Prompts ──────────────────────────────────────────────────────────────────────────────────────────────────

const CAMERA_VOCAB =
  `move: ${CAMERA_MOVES.filter((o) => o.id !== 'auto').map((o) => o.id).join(', ')}\n` +
  `shot: ${SHOT_SIZES.filter((o) => o.id !== 'auto').map((o) => o.id).join(', ')}\n` +
  `angle: ${CAMERA_ANGLES.filter((o) => o.id !== 'auto').map((o) => o.id).join(', ')}\n` +
  `lens: ${LENS_LOOKS.filter((o) => o.id !== 'auto').map((o) => o.id).join(', ')}`;

export const BIBLE_SYSTEM_PROMPT = `You are the showrunner of a long-form AI film rendered as consecutive 8-second Veo clips.
Write the film's BIBLE: the single source of truth that every act of the film is written against.

RULES
1. CHARACTERS (at most ${MAX_CHARACTERS}): every recurring person. For each: "id" (lowercase letters, digits, underscore),
   "name", "role", and "description" — ONE dense English noun phrase locking the appearance: age, build, face, hair
   (colour, length, style), eyes, and the EXACT wardrobe with colours and accessories. This exact text is pasted
   verbatim into every shot the person appears in, so it must not describe an action, a place or a mood.
   Never invent a stock or stereotypical persona for a thin brief; derive the cast from the theme. A film with no
   recurring person has an empty list.
2. LOOK: one "colorGrade", one "lighting" style, one "cameraStyle", a "palette" of 3-6 colours, and a
   "negativePrompt" — a comma list of NOUNS to exclude (never "no ..." phrases).
3. ARC: EXACTLY the number of acts requested, in order. Each act: "title", "summary" (what happens), "beat" (the
   emotional turn) and "closingImage" (the act's final shot — the next act opens from it). Together the acts tell
   one continuous story with a beginning, a development and a resolution.
4. MUSIC: "genre", "mood", "tempoBpm" (number), "instrumentation", and "direction" — how the score evolves across the
   acts. Instrumental only.
5. Every field is English. The "Language" line is the language spoken aloud in the film, not the language of these fields.

Return ONLY a JSON object, no markdown:
{"title":"","logline":"","characters":[{"id":"","name":"","role":"","description":""}],
 "look":{"colorGrade":"","lighting":"","cameraStyle":"","palette":[""],"negativePrompt":""},
 "arc":[{"title":"","summary":"","beat":"","closingImage":""}],
 "music":{"genre":"","mood":"","tempoBpm":90,"instrumentation":"","direction":""}}`;

export const ACT_SYSTEM_PROMPT = `You are the director of ONE act of a long-form AI film. Each scene is ONE 8-second Veo clip.
The film's BIBLE is fixed: never change a character's appearance, the look, or the story the arc describes.

RULES
1. Write EXACTLY the number of scenes requested, in order. Each scene is one beat of continuous action that fits 8 seconds.
2. "characters": the ids (from the bible) of everyone visible in the scene; [] for a scene with nobody in it. The lead
   appears in most scenes.
3. "imagePrompt": ONE flowing English sentence — what happens and where FIRST, then each visible character's bible
   description copied VERBATIM, then the light and camera woven into the prose; end with at most
   "photorealistic, cinematic, sharp focus". Never a "Negative:" list.
4. "action" (what happens in these 8 seconds), "location" (exact place and time of day), "cameraShot" (prose),
   "lighting" (source, direction, colour temperature), "mood", "sfxPrompt" (ambient diegetic sound only: no music,
   no speech, under 200 characters), "endState" (one sentence: what the clip's final frame shows).
5. "camera": an object using ONLY these values:
${CAMERA_VOCAB}
6. "dialogue": at most ${MAX_DIALOGUE_PER_SCENE} short lines {"speaker": character id, "line": words spoken}, each speakable in
   under 8 seconds, written in the film's spoken language, VERBATIM when the user supplied them; [] when nobody speaks.
7. CONTINUITY: the first scene opens exactly where the previous act's last scene ended (its end state is given); the
   last scene lands on this act's closing image. Consecutive scenes chain: same people, same wardrobe, same world,
   a logical progression of place and time. Vary the camera from scene to scene.

Return ONLY a JSON object, no markdown:
{"scenes":[{"characters":[""],"location":"","action":"","cameraShot":"","camera":{"move":"","shot":"","angle":"","lens":""},
 "lighting":"","mood":"","imagePrompt":"","sfxPrompt":"","dialogue":[],"endState":""}]}`;

const RETRY_NOTE =
  '\n\nYOUR PREVIOUS REPLY COULD NOT BE USED: it was not a JSON object of the required shape (or had the wrong number of ' +
  'scenes). Reply again with ONLY the JSON object.';

export function buildBiblePrompt(input: DirectorInput, acts: readonly LongformAct[]): string {
  const sceneCount = acts.reduce((s, a) => s + a.sceneCount, 0);
  const vid = text(input.characterVisualId, LIMITS.description);
  return (
    `Brief: ${text(input.brief, BRIEF_CHARS)}\n` +
    `Mode: ${text(input.mode, 40) || 'film'}\n` +
    `Length: ${sceneCount * LONGFORM_SCENE_SEC}s (${sceneCount} scenes of ${LONGFORM_SCENE_SEC}s)\n` +
    `Acts: ${acts.length} (${acts.map((a) => `act ${a.index + 1}: ${a.sceneCount} scenes`).join('; ')})\n` +
    `Language: ${text(input.language, 20) || 'en'}` +
    (vid
      ? `\n\nREFERENCE IDENTITY (ground truth, extracted from the user's photo): the lead is EXACTLY this person: "${vid}". ` +
        'Use it as the lead\'s description; never substitute a different age, gender, ethnicity, face or build.'
      : input.hasReferenceImage
        ? '\n\nA reference photo of the lead exists. Do NOT invent the lead\'s appearance from the brief: describe only the wardrobe the story needs.'
        : '') +
    `\n\nWrite EXACTLY ${acts.length} arc entries.`
  );
}

/** The bible as the act call sees it: compact, bounded, and ONLY what an act needs. */
function bibleForAct(bible: LongformBible, act: number): string {
  return JSON.stringify({
    title: bible.title,
    logline: bible.logline,
    characters: bible.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description })),
    look: bible.look,
    arc: bible.arc.map((a) => ({ act: a.act + 1, title: a.title, summary: a.summary, closingImage: a.closingImage })),
    thisAct: act + 1,
  });
}

export function buildActPrompt(
  input: DirectorInput,
  bible: LongformBible,
  act: LongformAct,
  actCount: number,
  previous: Pick<LongformScene, 'action' | 'location' | 'endState'> | null,
): string {
  const arc = bible.arc[act.index];
  const next = bible.arc[act.index + 1];
  const first = act.firstOrdinal + 1;
  const last = act.lastOrdinal + 1;
  return (
    `BIBLE: ${bibleForAct(bible, act.index)}\n\n` +
    `ACT ${act.index + 1} of ${actCount}: "${arc?.title ?? ''}" — ${arc?.summary || 'continue the story toward the film\'s resolution'}\n` +
    (arc?.beat ? `Emotional beat: ${arc.beat}\n` : '') +
    (arc?.closingImage ? `This act ends on: ${arc.closingImage}\n` : '') +
    (next ? `The next act ("${next.title}") follows: ${next.summary}\n` : 'This is the final act: resolve the story.\n') +
    (previous
      ? `PREVIOUS SCENE (the last of act ${act.index}): ${previous.action}${previous.location ? ` — at ${previous.location}` : ''}. ` +
        `It ended on: ${previous.endState || previous.action}. Scene ${first} opens exactly there.\n`
      : 'This is the opening of the film.\n') +
    `Brief (for intent only — the bible wins): ${text(input.brief, 1200)}\n` +
    `Spoken language: ${text(input.language, 20) || 'en'}` +
    (input.dialogue && text(input.dialogue, 1000) ? `\nUser-supplied dialogue (speak verbatim where it fits this act): ${text(input.dialogue, 1000)}` : '') +
    `\n\nWrite EXACTLY ${act.sceneCount} scenes: scene ${first}${last > first ? ` to scene ${last}` : ''}.`
  );
}

// ── Shot + clip request ──────────────────────────────────────────────────────────────────────────────────────

/** The film-wide look as one style clause (compileShotPrompt merges it into the Style section). */
export function bibleStyleGuide(bible: LongformBible): string {
  return [
    bible.look.colorGrade,
    bible.look.cameraStyle,
    bible.look.palette.length ? `palette of ${bible.look.palette.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/** The structured shot, with the subject = the on-screen characters' LOCKED bible descriptions, verbatim. */
export function buildShot(scene: Pick<DraftScene, 'characters' | 'action' | 'location' | 'camera' | 'lighting' | 'mood' | 'dialogue' | 'sfxPrompt'>, bible: LongformBible, ordinal: number): ShotSpec {
  const cast = scene.characters
    .map((id) => bible.characters.find((c) => c.id === id))
    .filter((c): c is LongformCharacter => !!c);
  const subject = cast.map((c) => c.description).join('; and ');
  const lighting = scene.lighting || bible.look.lighting;
  return {
    ordinal,
    subject,
    action: scene.action,
    ...(scene.location ? { setting: scene.location } : {}),
    camera: scene.camera,
    ...(lighting ? { lighting } : {}),
    ...(scene.mood ? { mood: scene.mood } : {}),
    audio: { dialogue: scene.dialogue, ...(scene.sfxPrompt ? { sfx: scene.sfxPrompt } : {}) },
    hasStartImage: false,
    // ⚠️ Long-form joins are hard cuts: the stitch is a stream copy (stitch.ts), which cannot dissolve.
    transitionOut: 'cut',
  };
}

export interface SceneRenderContext {
  jobId: string;
  bible: LongformBible;
  tier: VeoTier;
  format: OutputFormat;
  resolution?: VeoResolution;
  generateAudio: boolean;
  /** One seed for the whole film = continuity (not determinism). Null/undefined = free sampling. */
  seed?: number | null;
  /** The user's own negative prompt. */
  negativePrompt?: string | null;
  /** The previous act's last frame (stateMachine seed frame). Ignored when reference images are used. */
  startImageUrl?: string | null;
  /** Up to 3 identity references (the user's uploads). Exclusive with a first frame (capabilities §3). */
  referenceImageUrls?: readonly string[];
}

const isHttpsUrl = (u: unknown): u is string => typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u.trim());

/**
 * One scene → the request lib/veo/engine.createVeoClip takes. Compiled HERE, at submit time, because whether the
 * clip animates from the previous act's last frame (→ Google's "prompt for motion only" i2v shape) is only known
 * once that frame exists.
 */
export function buildSceneClipInput(scene: Pick<LongformScene, 'ordinal' | 'shot'>, ctx: SceneRenderContext): CreateVeoClipInput {
  const refs = (ctx.referenceImageUrls ?? []).filter(isHttpsUrl).slice(0, 3);
  const start = refs.length === 0 && isHttpsUrl(ctx.startImageUrl) ? ctx.startImageUrl.trim() : null;
  const shot: ShotSpec = { ...scene.shot, ordinal: scene.ordinal, hasStartImage: start !== null };
  // Film-specific exclusions first: normalizeNegativePrompt cuts at 800 chars, and the generic drift list is long.
  const negatives = [ctx.bible.look.negativePrompt, ctx.negativePrompt ?? '', FILM_DRIFT_NEGATIVE].filter((s) => s && s.trim());
  const compiled = compileShotPrompt(shot, {
    framingHint: framingHintFor(ctx.format),
    styleGuide: bibleStyleGuide(ctx.bible),
    negativePrompt: negatives,
  });
  const seed = typeof ctx.seed === 'number' && Number.isFinite(ctx.seed) && ctx.seed >= 0 ? Math.floor(ctx.seed) : undefined;
  return {
    request: {
      prompt: compiled.prompt,
      ...(compiled.negativePrompt ? { negativePrompt: compiled.negativePrompt } : {}),
      aspect: ctx.format,
      durationSec: LONGFORM_SCENE_SEC,
      ...(ctx.resolution ? { resolution: ctx.resolution } : {}),
      generateAudio: ctx.generateAudio,
      ...(seed !== undefined ? { seed } : {}),
      ...(start
        ? { startImage: { kind: 'url' as const, url: start } }
        : refs.length
          ? { referenceImages: refs.map((url) => ({ kind: 'url' as const, url })) }
          : {}),
    },
    tier: ctx.tier,
    // Groups the film's GCS inputs/outputs (gcs.ts sanitises it); the ordinal is part of the Vertex output prefix.
    sessionId: `longform-${ctx.jobId}`,
    ordinal: scene.ordinal,
  };
}

// ── The Director ─────────────────────────────────────────────────────────────────────────────────────────────

const BIBLE_MAX_TOKENS = 3000;
/** Per-act budget: a 12-scene act stays at 6600, comfortably under the 8000 ceiling a whole film used to hit. */
const actMaxTokens = (scenes: number): number => Math.min(8000, 1200 + 450 * scenes);

async function callOnce(generate: DirectorGenerate, prompt: string, opts: DirectorCallOptions): Promise<unknown> {
  let reply: string | null;
  try {
    reply = await generate(prompt, opts);
  } catch {
    reply = null;
  }
  return parseModelJson(reply);
}

/**
 * Run the Director: bible, then each act in order (each with the bible and the previous act's last scene).
 * Never throws; a second bad reply for the bible or any act fails the storyboard with the act it failed on.
 */
export async function runLongformDirector(input: DirectorInput, generate: DirectorGenerate): Promise<DirectorResult> {
  const sceneCount = longformSceneCount(input.seconds);
  if (sceneCount === null) {
    return { ok: false, error: 'invalid_duration', detail: `${String(input.seconds)} s is not a long-form length`, calls: 0 };
  }
  const acts = planActs(sceneCount);
  let calls = 0;

  // 1. Bible.
  const bibleBase = buildBiblePrompt(input, acts);
  let bible: LongformBible | null = null;
  for (let attempt = 1; attempt <= 2 && !bible; attempt++) {
    calls++;
    const raw = await callOnce(generate, attempt === 1 ? bibleBase : bibleBase + RETRY_NOTE, {
      system: BIBLE_SYSTEM_PROMPT, maxTokens: BIBLE_MAX_TOKENS, temperature: 0.7, json: true, purpose: 'bible', attempt,
    });
    bible = coerceBible(raw, acts.length, input);
  }
  if (!bible) return { ok: false, error: 'bible_unparseable', detail: 'the bible reply was not usable after one retry', calls };
  const locked: LongformBible = bible;

  // 2. Acts, sequentially — act N+1 is written from act N's last scene.
  const scenes: LongformScene[] = [];
  const actsOut: LongformStoryboard['acts'] = [];
  for (const act of acts) {
    const previous = scenes[scenes.length - 1] ?? null;
    const base = buildActPrompt(input, locked, act, acts.length, previous);
    let drafts: DraftScene[] | null = null;
    let attempts = 0;
    for (let attempt = 1; attempt <= 2 && !drafts; attempt++) {
      calls++;
      attempts = attempt;
      const raw = await callOnce(generate, attempt === 1 ? base : base + RETRY_NOTE, {
        system: ACT_SYSTEM_PROMPT, maxTokens: actMaxTokens(act.sceneCount), temperature: 0.6, json: true, purpose: 'act', act: act.index, attempt,
      });
      drafts = coerceActScenes(raw, act.sceneCount, locked, input.language);
    }
    if (!drafts) {
      return { ok: false, error: 'act_unparseable', act: act.index, detail: `act ${act.index + 1} was not usable after one retry`, calls };
    }
    drafts.forEach((d, i) => {
      const ordinal = act.firstOrdinal + i;
      const prev = scenes[scenes.length - 1];
      const camera = d.camera;
      const sceneCamera = camera.move === 'auto' && camera.shot === 'auto' && camera.angle === 'auto' && camera.lens === 'auto'
        ? undefined
        : { move: camera.move, shot: camera.shot, angle: camera.angle, lens: camera.lens };
      scenes.push({
        sceneNumber: ordinal + 1,
        location: d.location,
        action: d.action,
        cameraShot: d.cameraShot,
        mood: d.mood,
        ...(sceneCamera ? { camera: sceneCamera } : {}),
        ...(d.lighting ? { lighting: d.lighting } : {}),
        imagePrompt: d.imagePrompt,
        ...(d.sfxPrompt ? { sfxPrompt: d.sfxPrompt } : {}),
        ordinal,
        act: act.index,
        characters: d.characters,
        dialogue: d.dialogue,
        endState: d.endState,
        continuity: {
          previousEndState: prev ? prev.endState || prev.action : null,
          seedFromPreviousActLastFrame: i === 0 && act.index > 0,
        },
        shot: buildShot(d, locked, ordinal),
      });
    });
    actsOut.push({ ...act, attempts });
  }

  return { ok: true, storyboard: { bible: locked, acts: actsOut, scenes, calls } };
}
