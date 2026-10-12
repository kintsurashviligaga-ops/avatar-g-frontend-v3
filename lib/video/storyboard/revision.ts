/**
 * lib/video/storyboard/revision.ts — the storyboard as a numbered, fingerprinted revision (pure, no I/O, browser-safe).
 *
 * Video Core v1.0 §5: every change the user makes on the board — an edited caption, a re-rolled frame, a reorder, an added
 * or deleted scene, a swapped base image, a whole regeneration — is a revision; the render is approved FROM a revision, and
 * the approval names it (number + fingerprint), so a delivered film can be traced to the exact board the user saw and
 * a render whose board changed after the approval can be refused instead of silently rendering something else.
 *
 * What is fingerprinted is what the render reads: the scenes' ordinals, beats, captions, frames, edited/anchored marks, the
 * per-scene scripts, the seed and the clip length. Not fingerprinted: React keys (uid), in-flight `pending`, per-scene base
 * images (they only steer the next re-roll; the frame they produce is), frame prompts.
 *
 * A change that changes nothing is not a revision: snapshotRevision returns the parent itself when the fingerprint holds.
 *
 * This is also the shape the proposed table stores (docs/handoffs/video-core/proposals/20261012a_storyboard_revisions.sql —
 * a PROPOSAL, not a migration). Nothing here reads or writes a database.
 */
import { SCENE_SEC } from '@/lib/video/duration';

export type RevisionOrigin =
  | 'plan' | 'enrich' | 'frames' | 'edit_caption' | 'reroll_frame' | 'reorder' | 'add_scene' | 'delete_scene' | 'base_image' | 'regenerate';

export const REVISION_ORIGINS: readonly RevisionOrigin[] = [
  'plan', 'enrich', 'frames', 'edit_caption', 'reroll_frame', 'reorder', 'add_scene', 'delete_scene', 'base_image', 'regenerate',
];

export interface RevisionScene {
  ordinal: number;
  beat: string;
  prompt: string;
  frameUrl: string | null;
  edited: boolean;
  anchored: boolean;
}

/** The slice of the studio's StoryboardState a revision is taken from (structural, so the component's type need not be imported). */
export interface BoardLike {
  seed: number;
  clipSec?: number;
  scenes: readonly { ordinal: number; beat: string; prompt: string; frameUrl: string | null; edited?: boolean; anchored?: boolean }[];
  sceneScripts?: readonly (string | null)[] | null;
}

export interface StoryboardRevision {
  /** 1-based, +1 per real change on this board. */
  revision: number;
  parentRevision: number | null;
  origin: RevisionOrigin;
  createdAt: string;
  seed: number;
  clipSec: number;
  sceneCount: number;
  /** The board's native length: sceneCount × clipSec (the grid the render is planned on). */
  nativeSec: number;
  scenes: RevisionScene[];
  sceneScripts: (string | null)[] | null;
  /** 16 hex chars over the canonical board (see fingerprintBoard). */
  fingerprint: string;
}

/** What the render is approved from — the number and the fingerprint, nothing the board could lose. */
export interface RevisionApproval {
  revision: number;
  fingerprint: string;
  sceneCount: number;
  nativeSec: number;
  approvedAt: string;
}

export interface RevisionDiff {
  /** Ordinals (of `b`) with no counterpart in `a` — the board grew. */
  added: number[];
  /** Ordinals (of `a`) with no counterpart in `b` — the board shrank. */
  removed: number[];
  changedCaption: number[];
  changedFrame: number[];
  reordered: boolean;
  scriptsChanged: boolean;
  same: boolean;
}

const normScene = (s: BoardLike['scenes'][number]): RevisionScene => ({
  ordinal: Math.trunc(Number(s.ordinal)),
  beat: String(s.beat ?? ''),
  prompt: String(s.prompt ?? ''),
  frameUrl: typeof s.frameUrl === 'string' && s.frameUrl ? s.frameUrl : null,
  edited: s.edited === true,
  anchored: s.anchored === true,
});

export function normalizeScenes(board: BoardLike): RevisionScene[] {
  return [...board.scenes].map(normScene).sort((a, b) => a.ordinal - b.ordinal);
}

export function normalizeScripts(board: BoardLike): (string | null)[] | null {
  if (!Array.isArray(board.sceneScripts)) return null;
  return board.sceneScripts.map((s) => (typeof s === 'string' && s.trim() ? s : null));
}

export function boardClipSec(board: BoardLike, fallback: number = SCENE_SEC): number {
  const c = Number(board.clipSec);
  return Number.isFinite(c) && c > 0 ? c : fallback;
}

/** Canonical JSON of what the render reads, in a fixed key order — equal boards give equal strings whatever their key order. */
export function canonicalBoard(board: BoardLike): string {
  const scenes = normalizeScenes(board).map((s) => [s.ordinal, s.beat, s.prompt, s.frameUrl, s.edited ? 1 : 0, s.anchored ? 1 : 0]);
  return JSON.stringify({ seed: Math.trunc(Number(board.seed)) || 0, clipSec: boardClipSec(board), scenes, scripts: normalizeScripts(board) });
}

/** FNV-1a, 32-bit, over UTF-16 code units — small, dependency-free, the same in a browser and in node. */
function fnv1a32(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 16 hex characters: two independent FNV-1a passes (different offsets) over the canonical board. */
export function fingerprintBoard(board: BoardLike): string {
  const c = canonicalBoard(board);
  const a = fnv1a32(c, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a32(`${c.length}:${c}`, 0x9747b28c).toString(16).padStart(8, '0');
  return a + b;
}

export const isFingerprint = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);

/**
 * The next revision of this board after `origin`, or `parent` itself when nothing the render reads changed.
 * The first snapshot (parent null) is revision 1 whatever its origin.
 */
export function snapshotRevision(board: BoardLike, origin: RevisionOrigin, parent: StoryboardRevision | null, nowMs: number = Date.now()): StoryboardRevision {
  const fingerprint = fingerprintBoard(board);
  if (parent && parent.fingerprint === fingerprint) return parent;
  const scenes = normalizeScenes(board);
  const clipSec = boardClipSec(board);
  return {
    revision: (parent?.revision ?? 0) + 1,
    parentRevision: parent?.revision ?? null,
    origin,
    createdAt: new Date(nowMs).toISOString(),
    seed: Math.trunc(Number(board.seed)) || 0,
    clipSec,
    sceneCount: scenes.length,
    nativeSec: scenes.length * clipSec,
    scenes,
    sceneScripts: normalizeScripts(board),
    fingerprint,
  };
}

export function approveRevision(rev: StoryboardRevision, nowMs: number = Date.now()): RevisionApproval {
  return { revision: rev.revision, fingerprint: rev.fingerprint, sceneCount: rev.sceneCount, nativeSec: rev.nativeSec, approvedAt: new Date(nowMs).toISOString() };
}

/** True only while the board the render is about to read is the board that was approved. */
export function approvalMatches(approval: Pick<RevisionApproval, 'fingerprint'>, board: BoardLike): boolean {
  return isFingerprint(approval.fingerprint) && fingerprintBoard(board) === approval.fingerprint;
}

/** What changed between two revisions (or two boards), by scene content — ordinals are positions, content identifies a scene. */
export function diffRevisions(a: BoardLike, b: BoardLike): RevisionDiff {
  const as = normalizeScenes(a);
  const bs = normalizeScenes(b);
  const key = (s: RevisionScene) => `${s.beat}\u0000${s.prompt}`;
  const aKeys = as.map(key);
  const bKeys = bs.map(key);
  const added: number[] = [];
  const removed: number[] = [];
  const changedCaption: number[] = [];
  const changedFrame: number[] = [];
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const sa = as[i];
    const sb = bs[i];
    if (sa && !sb) { removed.push(sa.ordinal); continue; }
    if (!sa && sb) { added.push(sb.ordinal); continue; }
    if (!sa || !sb) continue;
    if (sa.prompt !== sb.prompt || sa.beat !== sb.beat) changedCaption.push(sb.ordinal);
    if (sa.frameUrl !== sb.frameUrl) changedFrame.push(sb.ordinal);
  }
  // A reorder: the same multiset of scenes in a different order (checked on the overlap, so an add/delete is not "reordered").
  const overlap = Math.min(as.length, bs.length);
  const sameSet = [...aKeys].sort().join('\u0001') === [...bKeys].sort().join('\u0001');
  const reordered = sameSet && aKeys.slice(0, overlap).some((k, i) => k !== bKeys[i]);
  const scriptsChanged = JSON.stringify(normalizeScripts(a)) !== JSON.stringify(normalizeScripts(b));
  const same = fingerprintBoard(a) === fingerprintBoard(b);
  return { added, removed, changedCaption: reordered ? [] : changedCaption, changedFrame: reordered ? [] : changedFrame, reordered, scriptsChanged, same };
}
