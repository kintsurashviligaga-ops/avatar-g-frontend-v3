/**
 * lib/pipeline/storyboardBridge.ts
 * ================================
 * PHASE 29 (VECTOR 2) — the "Export Full Storyboard to Video Studio" bridging PROTOCOL.
 *
 * A PURE, unit-testable serializer (no React, no zustand, no fetch — data in, data out, mirroring the
 * "pure helpers" convention in lib/chat/filmStudioClient.ts) that turns an authored storyboard matrix
 * (the N-scene grid compiled in the Image Studio) into the EXACT payload the Video Studio's scene lanes
 * already consume — so an "Export to Video Studio" macro pre-populates every scene slot with its
 * dedicated reference frame + shot prompt, and the downstream render-dispatch path is 100% unchanged.
 *
 * The identity contract is preserved end-to-end: the same per-scene frame anchors + the same
 * all-or-nothing sceneFrames gate the render pipeline was built around (never a partial anchor set).
 */

/** One authored scene in the storyboard grid. */
export interface StoryboardMatrixCell {
  /** 1-based scene position. */
  ordinal: number;
  /** The chosen/generated still for this scene (null when the frame isn't compiled yet). */
  frameUrl: string | null;
  /** The scene's action / shot description. */
  prompt: string;
  /** Optional richer per-scene script (wins over `prompt` when present). */
  script?: string;
  beat?: string;
}

/** The full authored grid handed to the "Export to Video Studio" button. */
export interface StoryboardMatrix {
  /** The film brief / theme the script was compiled from. */
  theme: string;
  cells: StoryboardMatrixCell[];
  orientation?: 'landscape' | 'vertical';
  /** Total runtime seconds (30 → 6 scenes, 60 → 12); derived from cells when absent. */
  duration?: number;
  /** The locked character appearance fragment, if one was established. */
  character?: string;
  /** A clean character portrait URL (front-facing), if one exists. */
  characterPortraitUrl?: string;
  musicVideoMode?: boolean;
}

/** The exact shape the Video Studio scene lanes + render-dispatch consume. */
export interface VideoScenePayload {
  /** The film brief (script folded in) the video pipeline drives from. */
  filmPrompt: string;
  orientation: 'landscape' | 'vertical';
  /** Per-scene identity-lock frames → videoCharacterRefs (index i anchors scene i+1). */
  characterRefs: string[];
  /** All-or-nothing: the positional render array only accepts a COMPLETE set (never holes). */
  sceneFrames: string[] | undefined;
  /** Per-scene scripts (index-aligned) → override the AI-authored scene text when present. */
  sceneScripts: string[] | undefined;
  /** Per-scene shot prompts, always populated → feeds the pre-review scene lanes. */
  scenePrompts: string[];
  characterLock?: string;
  characterPortrait?: string;
  musicVideoMode?: boolean;
  /** 6 | 30 | 60 — maps to the existing videoDuration control. */
  duration: number;
  /** The authored numbered-scene script → videoMasterScript (the video mode folds it into its SCRIPT
   *  block so the render follows the storyboard). Empty when the cells carry no text. */
  masterScript: string;
}

/** Derive the runtime seconds from a scene count, matching the pipeline's sceneFrameCount formula. */
export function durationForSceneCount(n: number): number {
  if (n <= 1) return 6;
  if (n <= 6) return 30;
  return 60;
}

/**
 * Serialize an authored storyboard matrix → the video scene-slot payload. PURE.
 *
 * - Cells are ordered by `ordinal`.
 * - `sceneFrames` is set ONLY when EVERY cell has a frame (the all-or-nothing gate the positional render
 *   array requires — a partial set must NOT silently anchor only some scenes).
 * - `sceneScripts` is set only when at least one cell carries real text.
 * - `scenePrompts` is ALWAYS populated (drives the pre-review lanes even when frames are deferred).
 * - `characterRefs` prefers a clean portrait, else the first framed cell (identity seed for i2v).
 */
export function serializeStoryboardMatrix(matrix: StoryboardMatrix): VideoScenePayload {
  const cells = [...(matrix.cells ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const orientation: 'landscape' | 'vertical' = matrix.orientation === 'landscape' ? 'landscape' : 'vertical';

  const allFramed = cells.length > 0 && cells.every((c) => typeof c.frameUrl === 'string' && !!c.frameUrl);
  const sceneFrames = allFramed ? cells.map((c) => c.frameUrl as string) : undefined;

  const scenePrompts = cells.map((c) => (c.prompt ?? '').trim());
  const anyScript = cells.some((c) => (c.script ?? c.prompt ?? '').trim().length > 0);
  const sceneScripts = anyScript ? cells.map((c) => (c.script ?? c.prompt ?? '').trim()) : undefined;

  const portrait = matrix.characterPortraitUrl && /^https?:\/\//i.test(matrix.characterPortraitUrl)
    ? matrix.characterPortraitUrl
    : null;
  const firstFramed = cells.find((c) => typeof c.frameUrl === 'string' && !!c.frameUrl)?.frameUrl ?? null;
  const characterRefs = portrait ? [portrait] : firstFramed ? [firstFramed] : [];

  const duration = matrix.duration && matrix.duration > 0 ? matrix.duration : durationForSceneCount(cells.length);

  // The brief that drives the video pipeline: the theme + the script folded into the SCRIPT block the
  // filmPrompt builder already recognises, so the render follows the authored scenes exactly.
  const scriptBody = cells
    .filter((c) => (c.script ?? c.prompt ?? '').trim().length > 0) // drop body-less scenes (ordinal-width-safe)
    .map((c) => `Scene ${c.ordinal}: ${(c.script ?? c.prompt ?? '').trim()}`)
    .join('\n');
  const filmPrompt = scriptBody
    ? `${(matrix.theme || '').trim()}\n\nSCRIPT (follow this EXACTLY — do not invent different characters, era, or setting):\n${scriptBody}`.trim()
    : (matrix.theme || '').trim();

  return {
    filmPrompt,
    orientation,
    characterRefs,
    sceneFrames,
    sceneScripts,
    scenePrompts,
    ...(matrix.character?.trim() ? { characterLock: matrix.character.trim() } : {}),
    ...(portrait ? { characterPortrait: portrait } : {}),
    ...(matrix.musicVideoMode ? { musicVideoMode: true } : {}),
    duration,
    masterScript: scriptBody,
  };
}
