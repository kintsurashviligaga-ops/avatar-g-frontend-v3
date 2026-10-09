/**
 * lib/video/director/fromStudio.ts — the studio's approved storyboard (scenes on the board) as the director's Storyboard,
 * for the user's Approve when director runs are on. Pure; the browser builds it and the runs route validates and freezes it.
 *
 * What carries over, and nothing else (V6 — no silent adaptation):
 *   · one shot per scene, in board order; the prompt is the scene's text exactly as the board would render it (the user's
 *     edit when they edited it, else the story script, else the scene prompt) — never trimmed or translated (V3);
 *   · the board's clip length for every shot, its orientation as the locked aspect ratio, the Veo tier picked in the panel;
 *   · the first attached photo as the character reference, and one seed for every shot when "one seed" is on (V4).
 * A board the director cannot render as it stands (a square frame, a reference on a clip shorter than 8 s) is NOT
 * reshaped here: the runs route answers with every rule it breaks, and the user decides.
 */
import type { Storyboard } from './types';

export interface StudioBoardScene {
  ordinal: number;
  beat: string;
  prompt: string;
  edited?: boolean;
}

export interface StudioBoard {
  filmPrompt: string;
  refs: string[];
  orientation: 'landscape' | 'vertical' | 'square' | 'portrait';
  scenes: StudioBoardScene[];
  sceneScripts?: (string | null)[] | null;
  clipSec?: number;
}

const ASPECT: Record<StudioBoard['orientation'], string> = { landscape: '16:9', vertical: '9:16', portrait: '9:16', square: '1:1' };

/** The text the studio's own render would send for scene `i`. Empty only when the board has none. */
function scenePrompt(board: StudioBoard, i: number): string {
  const scene = board.scenes[i];
  if (!scene) return '';
  if (scene.edited && scene.prompt.trim()) return scene.prompt;
  return board.sceneScripts?.[i] ?? scene.prompt;
}

export function studioToDirectorStoryboard(
  board: StudioBoard,
  opts: { id: string; quality: string; clipSec: number; seed?: number; now?: Date },
): Storyboard {
  const durationSeconds = board.clipSec ?? opts.clipSec;
  const aspectRatio = ASPECT[board.orientation];
  const reference = board.refs.find((r) => typeof r === 'string' && r.length > 0);
  const shots = board.scenes.map((scene, i) => ({
    id: `s${i + 1}`,
    order: i + 1,
    description: scene.beat || `Scene ${i + 1}`,
    prompt: scenePrompt(board, i),
    durationSeconds,
    aspectRatio,
    quality: opts.quality,
  }));
  return {
    id: opts.id,
    title: board.filmPrompt.slice(0, 120) || 'Untitled film',
    totalDurationSeconds: shots.reduce((sum, s) => sum + s.durationSeconds, 0),
    shots,
    consistencyLock: {
      aspectRatio,
      enforceAcrossShots: true,
      ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      ...(reference ? { characterReference: reference } : {}),
    },
    createdAt: (opts.now ?? new Date()).toISOString(),
    createdBy: 'user',
    // The user pressed Approve on this board; the server still checks every rule before it freezes it.
    approvedByUser: true,
  };
}
