/**
 * lib/video/directorsWorkflow/types.ts — the Director's Workflow (Phase 8.2 / 8.3) data model.
 *
 * A project is a STORYBOARD of 1–10 SCENE CARDS. Each card is exactly one direct clip (lib/video/directClip): 4, 6, 8 or
 * 10 seconds, rendered by the same engines and the same price book as a single clip from the Video service. Nothing here
 * is a new engine: a scene with a Georgian line goes to Gemini Omni (each character in their own voice, no narrator), a
 * scene without one goes to Veo, exactly as directClipEngine decides for a single clip today.
 *
 * AUDIO PER SCENE is part of the card, not a track laid over the finished film: the dialogue is said in the scene by the
 * characters on screen, the ambience and sound effects are asked of the engine for that scene, and music is OFF unless
 * the card asks for it (GG 2026-10-26: no music unless asked).
 *
 * Type-only and client-safe: the scene-card UI and the server read the same shapes.
 */
import type { DirectClipAspect, DirectClipResolution, DirectClipSeconds } from '@/lib/video/directClip';

/** GG 2026-11-14: 1–10 scenes. */
export const DW_MIN_SCENES = 1;
export const DW_MAX_SCENES = 10;
/** At most 3 people per project; Omni keeps voices apart best with few speakers, and a card names who is in it. */
export const DW_MAX_CHARACTERS = 3;
/** At most 4 lines per scene: more than that never fits even a 10 s clip at a natural pace (clipSpeechFits). */
export const DW_MAX_LINES_PER_SCENE = 4;
export const DW_TITLE_MAX = 80;
export const DW_ACTION_MAX = 1_200;
export const DW_SOUND_MAX = 200;

export type DwVoice = 'male' | 'female';

/** A person who appears in the film. The look is reused word for word in every scene they are in (consistency). */
export interface DwCharacter {
  id: string;
  /** The name the user sees on the card („ნინო"). */
  name: string;
  /** What they look like (face, hair, clothes, age). Never the background: the scene sets that (GG 2026-10-22). */
  look: string;
  voice: DwVoice;
  /** An uploaded photo of this person, as the media store names it. Used as a reference image. */
  photoId?: string;
}

/** One spoken line, said in the scene by a character on screen, in their own voice. */
export interface DwLine {
  characterId: string;
  text: string;
}

/** How a scene sounds. Everything is asked of the engine for THIS scene; nothing is mixed on top afterwards. */
export interface DwSceneAudio {
  lines: DwLine[];
  /** Background sound („rain on the window, distant traffic"). Empty = the engine's natural sound for the picture. */
  ambience: string;
  /** Short sound effects („a door slams"). */
  effects: string[];
  /** A music cue for this scene, or null = no music (the default). */
  music: string | null;
}

/** Where a scene's first frame comes from. */
export type DwFirstFrame =
  /** The previous scene's last frame: the cut is continuous (lib/video/lastFrame). Not allowed on scene 1. */
  | 'previous'
  /** A photo the user uploaded for this scene (`photoId`). */
  | 'photo'
  /** The engine draws it from the description. */
  | 'none';

export interface DwScene {
  id: string;
  /** 1-based position. The storyboard's order; renders and the final cut follow it. */
  order: number;
  title: string;
  /** What happens on screen, in the user's words. */
  action: string;
  /** Optional camera note („close-up on Nino, slow push in"). */
  camera: string;
  seconds: DirectClipSeconds;
  /** Who is on screen. Every line's speaker must be one of them. */
  characterIds: string[];
  audio: DwSceneAudio;
  firstFrame: DwFirstFrame;
  photoId?: string;
}

export type DwStatus = 'draft' | 'approved';

export interface DwProject {
  id: string;
  title: string;
  /** The one-line idea the storyboard came from. */
  logline: string;
  aspect: DirectClipAspect;
  /** Omni resolution for scenes that speak Georgian (720p / 1080p). Veo scenes follow directClipResolution. */
  resolution: DirectClipResolution;
  characters: DwCharacter[];
  scenes: DwScene[];
  status: DwStatus;
  /** Bumped on every edit; an approval is for one version only. */
  version: number;
}
