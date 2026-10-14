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
import { boardClipSec, fingerprintBoard, normalizeScenes, type ApprovalVerdict, type RenderApprovalWire } from '@/lib/video/storyboard/revision';
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

/** What the prompt rule needs of a board: the studio's StudioBoard and the approval's BoardLike both fit. */
export interface ScenePromptSource {
  scenes: readonly { prompt: string; edited?: boolean }[];
  sceneScripts?: readonly (string | null)[] | null;
}

/**
 * The text the studio's own render would send for scene `i`: the user's own words when they edited the scene (untouched,
 * V3), else the story script, else the scene prompt. Empty only when the board has none. ONE rule, used to build the
 * director storyboard in the browser and to check it on the server (checkStoryboardApproval).
 */
export function scenePrompt(board: ScenePromptSource, i: number): string {
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

/**
 * Round 3 (P1) — the server's side of the approval: is `storyboard` the director form of the board the user approved?
 * `approval` is the studio's RenderApprovalWire (revision number, fingerprint, the board it was taken from). The board is
 * re-fingerprinted; then every shot, in the director's order, must carry the approved scene's text (scenePrompt, the same
 * rule the browser used) and the approved clip length, and there must be exactly one shot per approved scene.
 *
 * A storyboard that is not the approved revision — a scene edited, added, removed or moved after the tap, a stale approval
 * replayed on a new board, another clip length — is refused (ok false) BEFORE it is frozen, stored or charged; the reason
 * codes are the revision module's (describeApprovalRefusal says them in the user's words).
 */
export function checkStoryboardApproval(storyboard: Pick<Storyboard, 'shots'>, approval: RenderApprovalWire): ApprovalVerdict {
  const revision = Math.trunc(Number(approval?.revision)) || 0;
  const fingerprint = String(approval?.fingerprint ?? '');
  const no = (reason: Extract<ApprovalVerdict, { ok: false }>['reason'], detail: string): ApprovalVerdict => ({ ok: false, reason, detail, revision, fingerprint });
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) return no('bad_fingerprint', 'the approval carries no 16-hex fingerprint');
  const board = approval.board;
  if (!board || !Array.isArray(board.scenes) || board.scenes.length === 0) return no('board_changed', 'the approval carries no board');
  const actual = fingerprintBoard(board);
  if (actual !== fingerprint) return no('board_changed', `the board fingerprints to ${actual}, the approval names ${fingerprint}`);
  const scenes = normalizeScenes(board);
  if (Math.trunc(Number(approval.sceneCount)) !== scenes.length) return no('scene_count', `the approval says ${String(approval.sceneCount)} scenes, the board has ${scenes.length}`);
  const shots = Array.isArray(storyboard?.shots) ? [...storyboard.shots].sort((a, b) => a.order - b.order) : [];
  if (shots.length !== scenes.length) return no('scene_count', `the run asks ${shots.length} shot(s), the approved board has ${scenes.length} scene(s)`);
  const clipSec = boardClipSec(board);
  const offLength = shots.find((s) => s.durationSeconds !== clipSec);
  if (offLength) return no('clip_sec', `shot ${offLength.order} asks ${offLength.durationSeconds} s, the approved board is on ${clipSec} s`);
  const source: ScenePromptSource = { scenes, sceneScripts: board.sceneScripts ?? null };
  const differs = shots.findIndex((s, i) => s.prompt !== scenePrompt(source, i));
  if (differs >= 0) return no('scripts_differ', `shot ${shots[differs]!.order}'s text is not the approved board's scene ${differs + 1}`);
  return { ok: true, revision, fingerprint, sceneCount: scenes.length };
}
