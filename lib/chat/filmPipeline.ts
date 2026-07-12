/**
 * lib/chat/filmPipeline.ts
 * ========================
 * PHASE 42 §1 — The "30-Second Film" Master Agent planning core.
 *
 * The 30-second film is a full automated production, not a single API call. The
 * Master Agent decomposes one brief into a deterministic production plan that
 * downstream sub-agents execute:
 *
 *   1. Storyboard Agent  → split the brief into N sequential 6-second scenes
 *   2. Continuity Agent  → stamp EVERY scene with the SAME seed + character
 *                          anchor so the protagonist (or the user's avatar)
 *                          never mutates across the 30 seconds
 *   3. Editor Agent      → concatenate the N clips into one seamless stream
 *   4. Audio/Foley Agent → bind a cohesive track / voiceover across the timeline
 *
 * This module is the PURE, dependency-light core of that plan. It imports only
 * the already-pure scene splitter (`script-breakdown`) and prompt-trait helpers
 * — never a provider SDK, network client, or `server-only` boundary — so the
 * whole production matrix is exhaustively unit-testable and can NEVER trigger a
 * paid render. The server fan-out lives in `filmComposite.ts`.
 */

import {
  deterministicBreakdown,
  planSegmentCount,
} from '@/lib/orchestrator/script-breakdown';
import { SEGMENT_DURATION_SEC } from '@/lib/orchestrator/types';
import { extractPromptTraits, enrichVideoPrompt } from './promptTraits';

/** The flagship runtime: a full 30-second film. */
export const FILM_TOTAL_SEC = 30;
/** The film runs at a 5-second scene cadence (vs. the generic video 6s default),
 *  so 30s decomposes into SIX sequential beats. With the hard-cut stitch this also
 *  lands the master at EXACTLY 30s (6 × 5 − 0 overlap) — no pad-freeze. */
export const FILM_CLIP_SEC = 5;
/** 30s / 5s = 6 sequential scenes. Derived (not hardcoded) so it stays honest. */
export const FILM_SCENE_COUNT = planSegmentCount(FILM_TOTAL_SEC, FILM_CLIP_SEC);

// ─── Intent detection ────────────────────────────────────────────────────────
// Deliberately conservative: matches explicit "30-second film / short film /
// mini-movie" language, NOT a bare "video". Music videos are intentionally left
// to the music-video composite (which owns lyrics + beat), so the router checks
// that path first. A false negative here just falls back to a normal video job.

const DURATION_RX = /\b(?:30|thirty)[\s-]?(?:second|sec|secs|s)\b/i;
const FILM_NOUN_RX = /\b(film|movie|cinematic\s+(?:short|sequence|story|piece)|short\s+film|mini[\s-]?(?:movie|film))\b/i;

export function isThirtySecondFilm(message: string): boolean {
  if (!message) return false;
  const m = String(message);
  // Compact forms: "30s film", "30-sec film".
  if (/\b30\s*s?\s*film\b/i.test(m)) return true;
  // Named short-form productions.
  if (/\bshort\s+film\b/i.test(m) || /\bmini[\s-]?(?:movie|film)\b/i.test(m)) return true;
  // "a 30 second film/movie/cinematic sequence".
  if (DURATION_RX.test(m) && FILM_NOUN_RX.test(m)) return true;
  return false;
}

// ─── Character / continuity consistency ──────────────────────────────────────

/**
 * Deterministic 32-bit FNV-1a seed derived from the brief. The SAME seed is
 * stamped on all N clips so the diffusion model re-anchors the protagonist's
 * face/wardrobe/palette instead of re-rolling a new character every shot. Pure
 * and stable: identical briefs always yield the identical seed (idempotent
 * retries reproduce the same film).
 */
export function buildConsistencySeed(prompt: string): number {
  const s = String(prompt || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Unsigned, clamped into a provider-safe positive 31-bit seed range.
  return (h >>> 0) % 2_147_483_647;
}

/**
 * The continuity clause appended to every scene prompt. When the user supplies
 * their custom avatar, the anchor locks to THAT identity; otherwise it locks the
 * first shot's protagonist as the canonical one to reproduce.
 */
export function buildCharacterAnchor(prompt: string, opts: FilmPlanOptions = {}): string {
  const lock = typeof opts.characterLock === 'string' ? opts.characterLock.trim() : '';
  // A source/reference IMAGE is the GROUND TRUTH for identity (image-to-video) and MUST win over
  // any text-extracted character. A generic brief ("30s blues clip") bridged over a photo of a
  // singing woman was letting the text-side lock invent an arbitrary "50-year-old man" and destroy
  // the identity. When an image is present, anchor to the image; a text lock only ADDS secondary
  // detail — it never replaces the person shown.
  if (opts.avatarReference) {
    const base = 'the EXACT person shown in the reference image — identical face, age, ethnicity, hair, build and wardrobe in every shot; never replace them with a different person';
    return lock ? `${base} (also: ${lock})` : base;
  }
  // No image: the Prompt-Agent's detailed extracted appearance (age, ethnicity, hair, eyes,
  // wardrobe) repeated VERBATIM is the strongest text-side anti-drift lever.
  if (lock) return `${lock} — the EXACT same person, identical face, hair and wardrobe in every shot`;
  return 'the same primary character — identical face, wardrobe, palette and styling in every shot';
}

/**
 * PHASE 44 §2 — The rigid VISUAL STYLE GUIDE stamped, verbatim, on every scene.
 *
 * The seed locks the diffusion noise; this clause locks the *semantics* the seed
 * alone can't guarantee — wardrobe, palette, lighting, lens, grain, character
 * design. Appended identically to all N clips so that, even as the camera and
 * composition change shot-to-shot, the world and protagonist do not. This is the
 * "rigid visual style guide" continuity contract the Master Agent enforces.
 */
export function buildStyleGuide(shared: FilmShared): string {
  const aesthetic = shared.style ? `${shared.style} aesthetic` : 'a single consistent cinematic aesthetic';
  const refCount = shared.referenceImages?.length ?? 0;
  const identity = refCount > 0
    ? `the exact subject from the user's ${refCount} uploaded reference image${refCount > 1 ? 's' : ''} (same face, hair, wardrobe)`
    : shared.avatarReference
      ? "the user's custom avatar (same face, hair, wardrobe)"
      : 'the same character design (same face, hair, wardrobe)';
  return (
    `Rigid visual style guide — identical in every shot: ${aesthetic}; one consistent color palette; `
    + `consistent key and rim lighting; the same lens, depth of field and film grain; unchanged props and set dressing; `
    + `${identity}. The SAME single protagonist appears in every shot — never swap the person, face, age or wardrobe between shots. `
    + `Use only lighting and elements that belong to the world of the brief: NO neon, glowing light-streaks, lens flares, HUD overlays or sci-fi effects unless the brief explicitly asks for them. `
    // VECTOR 3 — immutable color science on every clip so the model stops emitting a muddy yellow/sepia cast.
    + `COLOR SCIENCE: professional grade, ARRI Alexa color science, neutral white balance, crisp 8K, sharp focus — NO yellow, sepia, amber or muddy over-warm tint.`
  );
}

/**
 * WORLD-only continuity guide — for SCRIPT-DRIVEN scenes (a real per-scene script
 * supplied). Locks the era, palette, lighting, lens and film grain across the whole
 * film WITHOUT the "same single protagonist in every shot" clause. A film trailer's
 * scenes have DIFFERENT subjects (an aerial city, a radio close-up, a crowd, another
 * character); forcing the protagonist into all of them is exactly what collapsed the
 * trailer into "one man in every shot". Here the SCRIPT decides who/what is in frame;
 * this only keeps the world coherent.
 */
export function buildWorldStyleGuide(shared: FilmShared): string {
  const aesthetic = shared.style ? `${shared.style} aesthetic` : 'a single consistent cinematic aesthetic';
  return (
    `Rigid visual world — identical across every shot: ${aesthetic}; one consistent colour palette and grade; `
    + `consistent lighting; the same lens family, depth of field and film grain; period-accurate props and set dressing. `
    + `Render EXACTLY the subject and action THIS scene describes — do not add a person, performer or singer the scene does not call for. `
    + `Use only lighting and elements that belong to the world of the brief: NO neon, glowing light-streaks, lens flares, HUD overlays or sci-fi effects unless the brief explicitly asks for them.`
  );
}

// ─── Cinematic shot progression (the real Storyboard arc) ────────────────────
//
// PHASE 44 §2 / Task 5 — Without a Claude scene-writer the planner used to emit
// identical prompts (differing only by " — shot N of N"), so every clip rendered
// as the same beat: continuity was perfect but the film was a monotone loop. This
// deterministic 6-BEAT grammar gives each scene a distinct composition + camera
// move (a genuine establishing → resolution arc) WITHOUT touching the seed or the
// style guide — so the protagonist holds while the cinematography actually
// progresses. The six beats are the user's named per-scene "context agents":
//
//   1. Establishing   — wide reveal, the world + the artist enter frame
//   2. Medium Close-Up — eye-level performance, gimbal-tracked
//   3. Orbit          — 360° circle, neon pulsing on the beat (music-video energy)
//   4. Extreme Close-Up — 85mm on the face + LIPS (the lip-sync anchor)
//   5. Drone          — sweeping aerial pull-away, epic scale
//   6. Outro          — crane pull-back, the scene resolves on a confident beat
//
// Beats 1 and 6 are the fixed bookends (establish / resolve); beat 4's extreme
// close-up doubles as a continuity anchor (it re-asserts the face mid-film) and
// is where a future lip-sync pass keys the mouth to the vocal.

interface CinematicBeat {
  /** Short label for the beat — surfaced to the user as the per-scene "agent". */
  name: string;
  /** Composition + camera direction folded into one render-ready framing phrase. */
  framing: string;
  /** One of script-breakdown's CAMERA_MOTIONS, kept honest for the segment record. */
  cameraMotion: string;
}

// PROFESSIONAL NARRATIVE cinematography — generic to ANY film (drama, period,
// action, documentary), NOT a music video. The previous beats hardcoded "the
// artist", "perform the vocal" and literal "neon accents / lights pulsing on the
// beat / light-trails", which injected nonsensical blue light-streaks and a
// performer framing into every render. These reference "the protagonist", use
// motivated practical light only, and explicitly forbid artificial streaks.
const CINEMATIC_BEATS: readonly CinematicBeat[] = [
  { name: 'Establishing', framing: 'Epic wide establishing shot on an anamorphic lens, a slow cinematic dolly push-in that reveals the location and the protagonist within it — deep focus, motivated natural key light, gentle atmospheric depth', cameraMotion: 'zoom_in' },
  { name: 'Medium Tracking', framing: 'Eye-level medium shot tracking smoothly alongside the protagonist on a gimbal — 35mm lens, shallow depth of field, soft rim light separating subject from background, grounded naturalistic tone', cameraMotion: 'dolly' },
  { name: 'Arc Reveal', framing: 'A controlled camera arc moving around the protagonist to reveal the space and depth — 28mm lens, deliberate parallax, motivated PRACTICAL lighting only, absolutely no neon and no artificial light-streaks', cameraMotion: 'pan_right' },
  { name: 'Close-Up', framing: 'Intimate close-up on an 85mm portrait lens, a slow controlled push on the protagonist’s face capturing a real, present emotional beat — creamy bokeh, soft Rembrandt lighting', cameraMotion: 'pan_left' },
  { name: 'Wide Reveal', framing: 'A sweeping high aerial wide shot rising and pulling away over the scene — expansive composition, volumetric natural light, the protagonist small against an epic backdrop', cameraMotion: 'zoom_out' },
  { name: 'Resolution', framing: 'A crane pull-back rising as the protagonist and the scene resolve — expansive composition, warm cinematic colour grade, a confident, conclusive final beat', cameraMotion: 'zoom_out' },
];

/**
 * Select the cinematic beat for scene `index` of `count`. The first scene always
 * establishes and the last always resolves; the middle scenes spread evenly
 * across the remaining beats, so any scene count (1–8) yields a coherent arc.
 * At the flagship 6-scene count every named beat is used exactly once.
 */
export function sceneBeat(index: number, count: number): CinematicBeat {
  const last = CINEMATIC_BEATS.length - 1;
  if (count <= 1) return CINEMATIC_BEATS[0]!;
  const pos = Math.min(1, Math.max(0, index / (count - 1)));
  return CINEMATIC_BEATS[Math.round(pos * last)]!;
}

// ─── Structured-script splitter ──────────────────────────────────────────────
//
// When the user ATTACHES a real screenplay/shot-list, its scenes must reach the
// render verbatim — NOT be lost to a flaky/timed-out LLM scene-writer (the failure
// that made an attached 10-scene trailer render as the deterministic music-video
// orbit). If the brief carries explicit scene markers (🎬 სცენა N / Scene N /
// Сцена N / SHOT N), split on them deterministically and hand each scene's VISUAL
// description straight through as a per-scene render prompt.

/** Strip a scene block down to its visual description (drop the header, timecode,
 *  title and the audio/lighting/tempo metadata a shot-list carries).
 *
 *  Two script shapes are handled:
 *   • TIMELINE-TABLE shot-lists — rows like "00:00–00:02 S1.1 Drone aerial <ACTION>". Here the real
 *     visual content lives in the trailing ACTION column and the "Visual:" line is a COLOUR-GRADE note
 *     (e.g. "Golden hour, amber, anamorphic flares"). We build the prompt from the row ACTIONS and append
 *     the grade as a style hint. (Before this, the cleaner kept only the grade note → every scene rendered
 *     as a generic golden-hour image with none of the scripted subjects — the "generic visuals" bug.)
 *   • SINGLE-LINE format — "🎬 სცენა N (t) — „title" ვიზუალი: <DESCRIPTION> … metadata". Here "Visual:"/
 *     "ვიზუალი:" IS the description, so we prefer it and cut the trailing SFX/lighting/tempo metadata.
 */
function cleanSceneBlock(block: string): string {
  // TIMELINE-TABLE: pull the ACTION tail from every "TC  [shot]  [camera]  ACTION" row (a leading
  // timecode range at line-start), stripping the timecode + an optional "S1.1" shot code.
  const rowRx = /^[^\S\n]*\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}\s+(\S.*)$/gm;
  const actions: string[] = [];
  for (const m of block.matchAll(rowRx)) {
    const tail = (m[1] ?? '').trim().replace(/^S\d+(?:\.\d+)?\b[\s.:—–-]*/i, '');
    if (tail.length >= 8) actions.push(tail);
  }
  if (actions.length >= 1) {
    let out = actions.join('. ');
    const grade = block.match(/(?:ვიზუალი|visual|визуал)\s*[:：]\s*([^\n]+)/i);
    if (grade && grade[1]) out += ` — ${grade[1].trim()}`;
    return out.replace(/\s+/g, ' ').trim();
  }

  // SINGLE-LINE format: strip the marker/timecode/title, then prefer the explicit Visual section.
  let b = block
    // drop the leading marker "🎬 სცენა 3 (0:12–0:18) — „title"" or "Scene 3: „title" (translation)"
    .replace(/^\s*(?:🎬|🎥|🎞️?)?\s*(?:სცენა|сцена|scene|shot|кадр)\s*#?\s*\d+\s*/i, '')
    .replace(/^\s*[:：]\s*/, '') // "Scene 3:" colon
    .replace(/^\s*\([^)]*\)\s*/, '') // timecode "(0:12–0:18)"
    .replace(/^\s*[—–-]+\s*/, '')
    .replace(/^\s*[„"“][^"”“]{0,80}["”“»«]\s*/, '') // scene title in quotes
    .replace(/^\s*\([^)]*\)\s*/, ''); // trailing "(English translation)"
  // Prefer the explicit VISUAL section when present.
  const vis = b.match(/(?:ვიზუალი|visual|визуал)\s*[:：]?\s*([\s\S]+)/i);
  if (vis && vis[1]) b = vis[1];
  // Cut off the non-visual metadata that follows (SFX / lighting / tempo / colour / camera specs).
  b = b.split(/🔊|🎵|\bSFX\b|\bVFX\b|განათება|ტემპი|ფერ[ია]|დიალოგ|კამერა\s*[:：]|lighting\s*[:：]|camera\s*[:：]|tempo\s*[:：]|color\s*grade|музык|звук/i)[0] ?? b;
  return b.replace(/\s+/g, ' ').trim();
}

/**
 * Split a structured script into up to `maxScenes` per-scene visual prompts.
 * Returns null when the text has no explicit multi-scene structure (so the caller
 * falls back to the LLM scene-writer / deterministic beats).
 */
export function splitStructuredScript(text: string, maxScenes: number): string[] | null {
  if (!text || maxScenes < 2) return null;
  const markerRx = /(?:🎬|🎥|🎞️?)?\s*(?:სცენა|сцена|scene|shot|кадр)\s*#?\s*\d+\b/gi;
  const idxs: number[] = [];
  for (const m of text.matchAll(markerRx)) if (typeof m.index === 'number') idxs.push(m.index);
  if (idxs.length < 2) return null; // not a structured multi-scene script
  idxs.push(text.length);
  const scenes: string[] = [];
  for (let i = 0; i < idxs.length - 1 && scenes.length < maxScenes; i++) {
    const block = cleanSceneBlock(text.slice(idxs[i]!, idxs[i + 1]!)).slice(0, 600);
    if (block.length >= 20) scenes.push(block);
  }
  return scenes.length >= 2 ? scenes : null;
}

// ─── Storyboard caption enrichment ───────────────────────────────────────────
//
// The storyboard board opens INSTANTLY on the deterministic camera beats (planOnly),
// then the Prompt/Script Agent's per-scene STORY shots arrive a few seconds later
// (scriptsOnly). Those story shots always drove the RENDER, but the on-screen editable
// captions used to keep the generic beat framing for a TYPED brief — so a WWII teaser's
// captions read identically to a coffee ad's. This merge folds the story shots into the
// captions for every brief, positionally (index = scene slot), WITHOUT ever clobbering a
// scene the user has already edited or a slot whose script came back blank.

/** A storyboard scene as far as caption-merging is concerned. */
export interface CaptionMergeScene {
  ordinal: number;
  prompt: string;
  /** True once the user has hand-edited this scene's description (textarea). */
  edited?: boolean;
}

/**
 * Return `scenes` with each non-edited scene's `prompt` replaced by its positional story
 * script (`scripts[i]`). Scenes are left untouched when: the user edited them (`edited`),
 * the caller's `isEdited(ordinal)` predicate is true (a per-scene action the user typed
 * before the board opened), or the script slot is empty/blank. Pure — no mutation.
 */
export function mergeSceneCaptions<T extends CaptionMergeScene>(
  scenes: readonly T[],
  scripts: readonly (string | null | undefined)[],
  isEdited: (ordinal: number) => boolean = () => false,
): T[] {
  return scenes.map((s, i) => {
    const script = scripts[i]?.trim();
    if (s.edited || isEdited(s.ordinal) || !script) return s;
    return { ...s, prompt: script };
  });
}

// ─── Plan model ──────────────────────────────────────────────────────────────

/** PHASE 45 §2/§3 — a film accepts up to THREE user reference images that lock
 *  the protagonist's identity into the LTX character-reference / IP-Adapter array. */
export const FILM_MAX_REFERENCE_IMAGES = 3;

/**
 * Normalise an arbitrary multimodal reference-image payload into a clean, capped,
 * de-duplicated array of 0–`max` non-empty string refs (data URLs / https URLs /
 * asset ids). Tolerates a single string, an array, JSON-encoded arrays, comma
 * lists, and null/undefined — the composer and the orchestrator both feed this.
 */
export function normalizeReferenceImages(input: unknown, max = FILM_MAX_REFERENCE_IMAGES): string[] {
  let raw: unknown[] = [];
  if (Array.isArray(input)) {
    raw = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try { const parsed = JSON.parse(trimmed); raw = Array.isArray(parsed) ? parsed : [trimmed]; }
      catch { raw = [trimmed]; }
    } else if (trimmed.includes(',') && !trimmed.startsWith('data:')) {
      // Comma lists are unsafe for data: URLs (which contain commas) — only split plain refs.
      raw = trimmed.split(',');
    } else {
      raw = [trimmed];
    }
  } else if (input != null) {
    raw = [input];
  }
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export interface FilmPlanOptions {
  /** A reference to the user's custom avatar (image URL / id) to lock identity. */
  avatarReference?: string | null;
  /** PHASE 45 §2 — 1–3 user-uploaded reference images for multimodal identity lock. */
  referenceImages?: unknown;
  /** Optional aesthetic/genre override (e.g. "cyberpunk", "noir"). */
  style?: string | null;
  /** PHASE 2 L1 — user camera controls. `cameraMove` overrides the per-beat camera
   *  move in the PROMPT (auto/undefined keeps the storyboard's per-scene variety);
   *  `motionIntensity` (1–10) adds a paced movement directive. Both purely additive. */
  cameraMove?: 'auto' | 'pan_left' | 'pan_right' | 'zoom_in' | 'zoom_out' | 'tilt_up' | 'tilt_down' | null;
  motionIntensity?: number | null;
  /** PROMPT-AGENT character LOCK — one detailed appearance fragment (age, hair, eyes,
   *  wardrobe) prepended VERBATIM to every scene's continuity so the protagonist never
   *  drifts, even with no uploaded selfie. Supplied by the Master Prompt Agent. */
  characterLock?: string | null;
  /** Override total runtime; defaults to FILM_TOTAL_SEC (30s). */
  totalSec?: number;
  /** Frame orientation — drives the per-clip aspect ratio. Default landscape. */
  orientation?: 'landscape' | 'vertical';
  /**
   * LLM-written, brief-specific scene descriptions (one per scene, in order) from
   * the Script Agent. When present they REPLACE the deterministic camera-beat
   * framings as each scene's content — a real story instead of generic angles —
   * while the seed + style guide + character anchor still lock continuity.
   */
  sceneScripts?: string[];
  /**
   * V1 SHARED CONTEXT — the Screenwriter agent's per-scene metadata, index-aligned with
   * sceneScripts. Previously the rich MasterFilmScene (cameraShot/mood/location/timecode) was
   * FLATTENED to the imagePrompt string and the Camera stage RE-DERIVED its move from the
   * deterministic beat ladder — so the visual camera ignored the script's shot direction. Threading
   * this lets the Camera stage HONOR the screenwriter's exact cameraShot, and carries each scene's
   * timecode window so downstream (lip-sync/duck) can join a visual scene to its dialogue span.
   * Fully optional → undefined keeps the prior beat-ladder behaviour byte-identical.
   */
  sceneMeta?: SceneScreenwriterMeta[];
  /** Music-Video mode → open with a cinematic INTRO: scene 1 is an aerial/drone
   *  establishing shot over the city and scene 2 moves into the venue, before the
   *  performance begins. Gives the 30s/60s music video a real "drone → singer" edit. */
  musicVideo?: boolean;
  /** PHASE 22 (VECTOR 1) — the Master Prompt Agent's scene-tailored "what to avoid" string
   *  (MasterFilmVisualStyle.negativePrompt). Previously computed then DROPPED; now threaded so it
   *  reaches the provider's native negative field (Kling) — where negatives are weighted far more
   *  than in-prompt "no x" — to suppress sepia/yellow tints, muddy gradients and deformations. */
  negativePrompt?: string | null;
}

/** Screenwriter provenance for ONE scene (index-aligned with FilmPlanOptions.sceneScripts). */
export interface SceneScreenwriterMeta {
  /** The screenwriter's exact shot direction (e.g. "slow dolly push-in on the protagonist's face"),
   *  injected VERBATIM as the camera line so the visual matches the script's intent. */
  cameraShot?: string;
  mood?: string;
  location?: string;
  /** Timecode window on the master timeline — lets a visual scene join its dialogue span. */
  startSec?: number;
  endSec?: number;
}

/** Parameters shared identically across every clip — the continuity contract. */
export interface FilmShared {
  seed: number;
  characterAnchor: string;
  avatarReference: string | null;
  /** PHASE 45 §2 — 0–3 reference images mapped into the LTX characterReference array. */
  referenceImages: string[];
  style: string | null;
  sceneCount: number;
  totalSec: number;
  /** Frame orientation, identical across all clips so the cut never changes shape. */
  orientation: 'landscape' | 'vertical';
  /** PHASE 22 (VECTOR 1) — the provider negative prompt, identical across every clip. Always a
   *  strong drift-suppression baseline, merged with the Director's scene-tailored negative when
   *  one was supplied. buildFilmClipRequest maps it onto selectedOptions.negativePrompt. */
  negativePrompt: string;
}

/** PHASE 22 (VECTOR 1) — always-on drift/artifact suppression, merged ahead of the Director's
 *  scene-specific negative. Directly targets the documented failures: yellow/sepia LUT tint,
 *  muddy gradients, warped faces/hands, and cartoon/illustration drift on a photoreal brief. */
export const FILM_DRIFT_NEGATIVE =
  'yellow tint, sepia, oversaturated, muddy colours, amber cast, colour banding, deformed face, ' +
  'distorted face, extra fingers, extra limbs, mutated hands, disfigured, cartoon, anime, illustration, ' +
  '3d render, low quality, blurry, watermark, text, subtitles';

/**
 * PHASE 47 §3 — Nano Banano's visual contingency plan for a single scene.
 *
 * When a clip is dropped by a transient provider failure and a fallback variant
 * must be mounted in its place, the editor needs that fallback to cosmetically
 * MATCH its neighbours — same protagonist, same seed, same palette — so the
 * 30-second cut reads as one continuous film, not an abrupt swap. Nano Banano
 * (the storyboard architect) emits this contingency alongside the primary prompt
 * and it rides in the clip's asset payload metadata. It deliberately re-asserts
 * the SAME continuity levers as the primary render (seed + character anchor +
 * reference) plus a motion-light "safe" framing that blends between the adjacent
 * shots instead of introducing a new camera move.
 */
export interface FilmSceneContingency {
  /** Identical to the primary render so a fallback re-anchors the same noise. */
  seed: number;
  /** Neutral, low-motion framing safe to swap in without a jarring camera move. */
  fallbackFraming: string;
  /** Ordinals of the adjacent scenes whose look the fallback must match. */
  matchNeighbors: number[];
  /** The shared character anchor the fallback must preserve verbatim. */
  characterAnchor: string;
  /** The primary character reference (avatar / first uploaded image), if any. */
  characterReference: string | null;
}

export interface FilmScene {
  /** 0-based render index. */
  index: number;
  /** 1-based ordinal for UI copy ("clip 1 of 5"). */
  ordinal: number;
  durationSec: number;
  cameraMotion: string;
  /** The named cinematic beat this scene plays (Establishing · Medium Close-Up ·
   *  Orbit · Extreme Close-Up · Drone · Outro) — the per-scene "context agent". */
  beat: string;
  /** Fully enriched, continuity-anchored prompt for this clip. */
  prompt: string;
  /** SAME across all scenes (continuity). */
  seed: number;
  /** PHASE 47 §3 — the visual fallback plan that keeps a dropped clip on-model. */
  contingency: FilmSceneContingency;
}

/**
 * PHASE 47 §3 — Derive a scene's contingency plan. The fallback framing leans on
 * the neighbours' established look: an interior scene blends the previous and
 * next beats so a swapped-in clip never jumps the eyeline. Pure + deterministic.
 */
export function buildSceneContingency(
  index: number,
  count: number,
  shared: FilmShared,
): FilmSceneContingency {
  const ordinal = index + 1;
  const matchNeighbors = [ordinal - 1, ordinal + 1].filter((n) => n >= 1 && n <= count);
  const characterReference = shared.avatarReference ?? shared.referenceImages[0] ?? null;
  const fallbackFraming =
    'Steady, low-motion continuity shot holding the established framing — '
    + `${shared.characterAnchor}; identical palette, lighting and lens as the surrounding scenes `
    + `(consistency seed ${shared.seed}). No new camera move; blend seamlessly between adjacent shots.`;
  return { seed: shared.seed, fallbackFraming, matchNeighbors, characterAnchor: shared.characterAnchor, characterReference };
}

export interface FilmPlan {
  shared: FilmShared;
  scenes: FilmScene[];
}

/**
 * Decompose a brief into a complete, continuity-locked film plan. Reuses the
 * already-tested `deterministicBreakdown` shot splitter for the scene boundaries
 * and camera grammar, then stamps each scene with the shared seed + character
 * anchor and folds the brief's directorial traits (camera/style/lighting/mood)
 * back into the clip prompt via `enrichVideoPrompt`.
 */
export function planFilmScenes(prompt: string, opts: FilmPlanOptions = {}): FilmPlan {
  const totalSec = opts.totalSec && opts.totalSec > 0 ? opts.totalSec : FILM_TOTAL_SEC;
  // The film runs at a 5-second scene cadence → six beats over the 30s runtime.
  const segments = deterministicBreakdown(prompt, totalSec, FILM_CLIP_SEC);
  const seed = buildConsistencySeed(prompt);
  // PHASE 45 §2 — fold uploaded reference images into the identity lock. The
  // explicit avatarReference wins; otherwise the FIRST reference image becomes
  // the primary character anchor so the storyboard agent treats the upload as
  // the canonical protagonist.
  const referenceImages = normalizeReferenceImages(opts.referenceImages);
  const avatarReference = opts.avatarReference ?? referenceImages[0] ?? null;
  const characterAnchor = buildCharacterAnchor(prompt, { ...opts, avatarReference });
  // Raw locked-appearance fragment (without the "in every shot" clause) — used to
  // keep the protagonist consistent WHERE the script places them, without forcing
  // them into scenes that don't feature them.
  const lockText = typeof opts.characterLock === 'string' ? opts.characterLock.trim() : '';
  const traits = extractPromptTraits(prompt, { defaultAudio: true });
  // The core subject, stripped of the splitter's " — shot N of N" suffix so each
  // scene reframes the SAME subject under a different cinematic beat.
  const subject = String(prompt || '').trim().replace(/\s*—\s*shot\s+\d+\s+of\s+\d+\s*$/i, '')
    || 'cinematic establishing shot';

  // PHASE 22 (VECTOR 1) — merge the always-on drift baseline with the Director's scene-tailored
  // negative (deduped-ish by simple concat; the provider tolerates overlap). Cap so a runaway brief
  // negative can't blow the provider's field bound.
  const briefNegative = typeof opts.negativePrompt === 'string' ? opts.negativePrompt.trim() : '';
  const negativePrompt = (briefNegative ? `${FILM_DRIFT_NEGATIVE}, ${briefNegative}` : FILM_DRIFT_NEGATIVE).slice(0, 600);

  const shared: FilmShared = {
    seed,
    characterAnchor,
    avatarReference,
    referenceImages,
    style: opts.style ?? null,
    sceneCount: segments.length,
    totalSec,
    orientation: opts.orientation === 'vertical' ? 'vertical' : 'landscape',
    negativePrompt,
  };

  const styleGuide = buildStyleGuide(shared);

  // The per-beat camera move was computed but never reached the video model, so the
  // clips came out near-static. Map each beat to an explicit, strong motion directive.
  const cameraDirectiveFor = (m: string | null | undefined): string => {
    switch (m) {
      case 'zoom_in': return 'Camera: slow continuous cinematic dolly push-in toward the subject';
      case 'dolly': return 'Camera: smooth lateral gimbal/dolly tracking move alongside the subject';
      case 'pan_right': return 'Camera: controlled arc panning to the right around the subject';
      case 'pan_left': return 'Camera: slow controlled push and pan across the subject';
      case 'zoom_out': return 'Camera: sweeping crane pull-back and zoom-out reveal';
      // PHASE 2 L1 — user camera controls add explicit tilt moves.
      case 'tilt_up': return 'Camera: smooth vertical tilt rising up across the subject';
      case 'tilt_down': return 'Camera: smooth vertical tilt craning down toward the subject';
      default: return 'Camera: continuous deliberate camera movement';
    }
  };
  // PHASE 2 L1 — a motion-intensity suffix (1–10) the user dials in. Absent/0 → no
  // change (the per-beat directive stays exactly as before). Strictly additive.
  const motionSuffix = (() => {
    const n = Number(opts.motionIntensity);
    if (!Number.isFinite(n) || n <= 0) return '';
    const pace = n >= 8 ? ', fast energetic kinetic movement' : n <= 3 ? ', very subtle slow gentle movement' : ', steady moderate movement';
    return ` (motion intensity ${Math.round(n)}/10${pace})`;
  })();
  // When the user picks an explicit camera move it overrides the per-beat default
  // FOR THE PROMPT ONLY (the stored scene.cameraMotion is unchanged for downstream use).
  const promptMoveFor = (beatMotion: string): string =>
    (opts.cameraMove && opts.cameraMove !== 'auto' ? opts.cameraMove : beatMotion);
  // V1 SHARED CONTEXT — the camera line prefers, in order: (1) the user's explicit global
  // cameraMove override, (2) the SCREENWRITER's exact per-scene cameraShot (script intent,
  // injected verbatim), (3) the deterministic beat ladder. So the visual camera now HONORS the
  // script's shot direction instead of re-deriving it. sceneCam absent → identical to before.
  const cameraLineFor = (beatMotion: string, sceneCam?: string): string => {
    if (opts.cameraMove && opts.cameraMove !== 'auto') return cameraDirectiveFor(opts.cameraMove);
    if (sceneCam && sceneCam.trim()) return `Camera: ${sceneCam.trim()}`;
    return cameraDirectiveFor(beatMotion);
  };
  const scenes: FilmScene[] = segments.map((seg) => {
    // §2 — vary the COMPOSITION per scene (real storyboard arc)…
    const beat = sceneBeat(seg.index, segments.length);
    const styled = shared.style ? `, ${shared.style} style` : '';
    // Prefer the LLM Script Agent's brief-specific scene (a real story beat with
    // its own camera + shot-size direction). Fall back to the deterministic
    // camera-beat framing when no script was supplied.
    const llmScene = opts.sceneScripts?.[seg.index]?.trim();
    // V1 — the screenwriter's exact shot direction for THIS scene (if the brief carried one).
    const sceneCam = opts.sceneMeta?.[seg.index]?.cameraShot;
    // Music-Video INTRO: force the first one/two scenes to a cinematic drone/venue
    // establishing sequence (NO protagonist) so the clip opens with a real aerial
    // intro, then cuts to the singer — overrides any per-scene LLM script for these.
    const mvIntro = opts.musicVideo && segments.length >= 4 && seg.index <= 1;
    const placeHint = /tbilisi|თბილის/i.test(subject) ? 'the old town of Tbilisi' : 'a city';
    const head = mvIntro
      ? (seg.index === 0
          ? `Cinematic aerial drone shot at night flying high over ${placeHint}, glowing streets, rooftops and warm windows, slowly descending toward a lively music venue — atmospheric wide establishing shot, NO people in frame, neon and golden light, photorealistic${styled}`
          : `Cinematic camera move arriving INTO a warm, lively bar at night — golden string lights, exposed brick, a small crowd with drinks, a stage with a vintage microphone, anticipation just before the performance${styled}`)
      : (llmScene && llmScene.length > 0 ? llmScene : `${beat.framing} — ${subject}${styled}`);
    // SCRIPT-DRIVEN scene: a real per-scene script decides who/what is in frame. Lock
    // only the WORLD and keep the protagonist consistent CONDITIONALLY (wherever the
    // script places them) — never force the "same protagonist in every shot" clause,
    // which turned an aerial / a radio close-up / a crowd into the same man performing.
    const scriptDriven = Boolean(llmScene && llmScene.length > 0) && !mvIntro;
    const conditionalCharacter = lockText
      ? ` Character consistency: whenever the film's protagonist appears, they are ${lockText}; keep any recurring person's face, hair and wardrobe consistent across shots — but only feature the people this scene actually describes.`
      : '';
    // …while the seed + style/world guide hold the world CONSTANT.
    const continuity = scriptDriven
      ? `${buildWorldStyleGuide(shared)}${conditionalCharacter} (consistency seed ${seed}).`
      : `${styleGuide} Continuity: ${characterAnchor}; match every other shot exactly (consistency seed ${seed}).`;
    // Inject the explicit camera move + subject energy + a clean-frame guard (no
    // AI-burned text/titles), so the model actually MOVES and doesn't paint captions.
    // Music-Video INTRO scenes are a PURE establishing location (drone over the city,
    // then the venue) with NO performer — so they must NOT get the "subject performs"
    // energy line or the character anchor, which were turning the drone shot into a
    // person on a street. Everything else keeps the performer + continuity contract.
    const enriched = mvIntro
      ? enrichVideoPrompt(
          `${head}. ${cameraDirectiveFor(promptMoveFor(beat.cameraMotion))}${motionSuffix}, slow cinematic camera movement, atmospheric and immersive. NO people, NO performer, NO singer anywhere in frame — a pure establishing location shot only. No on-screen text, titles, captions, subtitles, watermarks or logos. ${styleGuide} (consistency seed ${seed}).`,
          traits, 1700,
        )
      : scriptDriven
        // Trailer/film scene: play the scene the SCRIPT describes. No "subject performs
        // with energy" (that forced a singer into every frame) — the action comes from
        // the scene text itself; only the camera + clean-frame + world-continuity ride along.
        ? enrichVideoPrompt(
            `${head}. ${cameraLineFor(beat.cameraMotion, sceneCam)}${motionSuffix}, continuous cinematic camera movement true to the scene, never a static frozen frame. No on-screen text, titles, captions, subtitles, watermarks or logos. ${continuity}`,
            traits, 1700,
          )
        // PHASE 28 (VECTOR 1) — HARD IDENTITY CLAUSE. On the character-brief (non-script) path the
        // protagonist appears in EVERY shot, so an EXPLICIT same-person assertion (identical face,
        // skin tone, gender, hair, build and wardrobe) rides alongside the continuity anchor — directly
        // forbidding the shot-to-shot drift the client reported (an Asian/white-sweater lead morphing
        // into an African-American/blue-dress one between scenes). The full appearance anchor stays in
        // the continuity clause (well within the 1700-char clamp on this path, so it is never truncated).
        : enrichVideoPrompt(
            `${head}. ${cameraLineFor(beat.cameraMotion, sceneCam)}${motionSuffix}, continuous movement, never a static frozen frame. The subject moves and performs with genuine, believable emotion, expressive but natural acting, lifelike facial expression, gaze and body language true to the moment, and is the SAME person in every scene — identical face, skin tone, gender, hair, build and wardrobe, never a different-looking person. No on-screen text, titles, captions, subtitles, watermarks or logos. ${continuity}`,
            traits, 1700, // raised from 1200 so the camera+clean-frame directives don't truncate the continuity seed
          );
    return {
      index: seg.index,
      ordinal: seg.index + 1,
      durationSec: seg.durationSec,
      cameraMotion: beat.cameraMotion,
      beat: beat.name,
      prompt: enriched,
      seed,
      // PHASE 47 §3 — Nano Banano stamps each scene with its on-model fallback.
      contingency: buildSceneContingency(seg.index, segments.length, shared),
    };
  });

  return { shared, scenes };
}

// ─── Provider request shaping ────────────────────────────────────────────────

export interface FilmClipRequest {
  userPrompt: string;
  selectedOptions: Record<string, string>;
}

/**
 * Shape a single scene into a ServiceManager/LTX request. The seed is passed
 * explicitly (the primary continuity lever) and per-clip audio is OFF — the
 * Audio/Foley agent binds one cohesive track across the full stitched timeline
 * rather than five disjoint 6-second stings.
 */
export function buildFilmClipRequest(scene: FilmScene, shared: FilmShared): FilmClipRequest {
  const selectedOptions: Record<string, string> = {
    duration: String(scene.durationSec),
    fps: '24',
    // Aspect ratio follows the user's chosen orientation — IDENTICAL across every
    // clip so the stitched cut never changes shape mid-film. (Was hardcoded 9:16,
    // which fought a landscape stitch and made the format "change mid-video".)
    aspectRatio: shared.orientation === 'vertical' ? '9:16' : '16:9',
    seed: String(scene.seed),
    generate_audio: 'false',
  };
  // PHASE 45 §2 — map the 1–3 reference images into the LTX character-reference /
  // IP-Adapter array. The primary ref stays in `characterReference` for the
  // single-image path; the full set rides in `characterReferences` (JSON) so the
  // Director Agent can lock identity across all clips when multiple are supplied.
  const refs = shared.referenceImages?.length
    ? shared.referenceImages
    : (shared.avatarReference ? [shared.avatarReference] : []);
  const primaryRef = refs[0];
  if (primaryRef) selectedOptions.characterReference = primaryRef;
  if (refs.length > 0) selectedOptions.characterReferences = JSON.stringify(refs);
  if (shared.style) selectedOptions.style = shared.style;
  // PHASE 22 (VECTOR 1) — carry the provider negative so ServiceManager maps it onto the Kling
  // native negative_prompt (and LTX's in-prompt drift clause). This is the wire that stops the
  // Director's negative from being silently dropped before the render.
  if (shared.negativePrompt) selectedOptions.negativePrompt = shared.negativePrompt;
  // PHASE 47 §3 — carry Nano Banano's on-model fallback plan in the asset payload
  // metadata so the Director/Editor can swap in a continuity-matched variant if
  // this leg drops, without re-rolling a fresh (off-model) character.
  selectedOptions.contingency = JSON.stringify(scene.contingency);
  return { userPrompt: scene.prompt, selectedOptions };
}

// ─── Progressive transparency (§4) ───────────────────────────────────────────

export interface FilmStageLabel {
  key: string;
  label: { en: string; ka: string; ru: string };
}

/**
 * The ordered, human-readable agent timeline surfaced to the user while the
 * film renders — Storyboard → per-clip render (with the character-consistency
 * reassurance) → Stitch → Audio → Finalize. Kept multilingual so the client
 * can render `label[lang]` directly.
 */
export function filmProgressStages(sceneCount: number = FILM_SCENE_COUNT): FilmStageLabel[] {
  const count = Number.isFinite(sceneCount) && sceneCount > 0 ? Math.floor(sceneCount) : FILM_SCENE_COUNT;
  const stages: FilmStageLabel[] = [
    {
      key: 'storyboard',
      label: {
        en: 'Storyboard Agent writing scenes…',
        ka: 'სცენარის აგენტი წერს სცენებს…',
        ru: 'Агент раскадровки пишет сцены…',
      },
    },
  ];
  for (let i = 1; i <= count; i++) {
    stages.push({
      key: `clip_${i}`,
      label: {
        en: `Rendering clip ${i} of ${count} · maintaining character consistency`,
        ka: `კლიპის რენდერი ${i}/${count} · პერსონაჟის თანმიმდევრულობა`,
        ru: `Рендер клипа ${i} из ${count} · сохранение персонажа`,
      },
    });
  }
  stages.push({
    key: 'stitch',
    label: {
      en: 'Editor Agent stitching the final film…',
      ka: 'მონტაჟის აგენტი ასრულებს ფილმს…',
      ru: 'Агент-монтажёр собирает финальный фильм…',
    },
  });
  stages.push({
    key: 'audio',
    label: {
      en: 'Audio Agent binding music & voiceover…',
      ka: 'აუდიო აგენტი ურთავს მუსიკას და ხმას…',
      ru: 'Аудио-агент привязывает музыку и озвучку…',
    },
  });
  stages.push({
    key: 'finalize',
    label: {
      en: 'Finalizing output…',
      ka: 'შედეგის დასრულება…',
      ru: 'Финализация результата…',
    },
  });
  return stages;
}
