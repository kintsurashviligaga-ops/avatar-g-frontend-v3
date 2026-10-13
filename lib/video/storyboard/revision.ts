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

// ── The approval on the wire, and its check (Video Core v1.0 §5, code level — no table) ───────────────────────────────
//
// The studio approves a render FROM a revision (approveRevision) and sends the approval WITH the board it was taken from
// (`RenderApprovalWire`). The server does not trust the fingerprint on its own: it re-fingerprints the board it was handed
// and checks the render it is asked to make against that board — the scene count, the clip length, every frame, every
// script. A render whose inputs are not the approved board is refused before any clip is dispatched or charged
// (`validateRenderApproval`). The same functions run in the browser, so the studio can refuse first, with the same words.

/** The exact per-scene texts the render reads from a board: an edited scene's own words, else its script, else its prompt.
 *  Null when the board has no scripts and no edit (the render then writes its own). One function for the studio and the server. */
export function renderScriptsFor(board: BoardLike): string[] | null {
  const scenes = normalizeScenes(board);
  const scripts = normalizeScripts(board);
  const anyEdited = scenes.some((s) => s.edited);
  if (!scripts && !anyEdited) return null;
  return scenes.map((s, i) => (s.edited && s.prompt.trim() ? s.prompt.trim() : (scripts?.[i] ?? s.prompt)));
}

/** The origin of `next` given the board before it (null → the first snapshot, 'plan'), read off the diff. */
export function inferOrigin(prev: BoardLike | null, next: BoardLike): RevisionOrigin {
  if (!prev) return 'plan';
  const d = diffRevisions(prev, next);
  if (d.same) return 'plan';
  if (d.added.length && !d.removed.length) return 'add_scene';
  if (d.removed.length && !d.added.length) return 'delete_scene';
  if (d.reordered) return 'reorder';
  if (d.changedFrame.length && !d.changedCaption.length) return normalizeScenes(prev).every((s) => s.frameUrl === null) ? 'frames' : 'reroll_frame';
  if (d.changedCaption.length) return 'edit_caption';
  if (d.scriptsChanged) return 'enrich';
  return 'regenerate';
}

/** The approval as the render request carries it: the approval, plus the board it was taken from (what the server re-fingerprints). */
export interface RenderApprovalWire extends RevisionApproval {
  board: BoardLike;
}

/** The approval of `rev`, with the board slice the server needs to check it (only what is fingerprinted rides). */
export function approvalForRender(rev: StoryboardRevision, board: BoardLike, nowMs: number = Date.now()): RenderApprovalWire {
  return {
    ...approveRevision(rev, nowMs),
    board: { seed: Math.trunc(Number(board.seed)) || 0, clipSec: boardClipSec(board), scenes: normalizeScenes(board), sceneScripts: normalizeScripts(board) },
  };
}

/** What the render asks for, as the orchestrate request says it. */
export interface RenderInputs {
  sceneFrames?: readonly string[] | null;
  sceneScripts?: readonly string[] | null;
  sceneCount?: number | null;
  clipSec?: number | null;
}

export type ApprovalMismatch = 'bad_fingerprint' | 'board_changed' | 'scene_count' | 'clip_sec' | 'frames_differ' | 'scripts_differ';

export type ApprovalVerdict =
  | { ok: true; revision: number; fingerprint: string; sceneCount: number }
  | { ok: false; reason: ApprovalMismatch; detail: string; revision: number; fingerprint: string };

/**
 * Is `render` the approved board? Checked on the server before any dispatch (and in the studio before it posts):
 *   · the fingerprint is well-formed and is the fingerprint of the board sent (`board_changed` otherwise — the board
 *     was edited after the approval, or the approval belongs to another board);
 *   · the scene count the approval names is the board's, and the render's when it pins one;
 *   · the render's clip length is the board's;
 *   · the frames the render anchors on are the board's frames, in order, when it sends any;
 *   · the scripts the clips render from are exactly renderScriptsFor(board), when it sends any.
 */
export function validateRenderApproval(a: RenderApprovalWire, render: RenderInputs): ApprovalVerdict {
  const revision = Math.trunc(Number(a.revision)) || 0;
  const fingerprint = String(a.fingerprint ?? '');
  const no = (reason: ApprovalMismatch, detail: string): ApprovalVerdict => ({ ok: false, reason, detail, revision, fingerprint });
  if (!isFingerprint(fingerprint)) return no('bad_fingerprint', 'the approval carries no 16-hex fingerprint');
  if (!a.board || !Array.isArray(a.board.scenes) || a.board.scenes.length === 0) return no('board_changed', 'the approval carries no board');
  const actual = fingerprintBoard(a.board);
  if (actual !== fingerprint) return no('board_changed', `the board fingerprints to ${actual}, the approval names ${fingerprint}`);
  const scenes = normalizeScenes(a.board);
  if (Math.trunc(Number(a.sceneCount)) !== scenes.length) return no('scene_count', `the approval says ${String(a.sceneCount)} scenes, the board has ${scenes.length}`);
  if (typeof render.sceneCount === 'number' && render.sceneCount !== scenes.length) return no('scene_count', `the render asks ${render.sceneCount} scenes, the approved board has ${scenes.length}`);
  const clipSec = boardClipSec(a.board);
  if (typeof render.clipSec === 'number' && render.clipSec !== clipSec) return no('clip_sec', `the render asks ${render.clipSec} s scenes, the approved board is on ${clipSec} s`);
  if (render.sceneFrames && render.sceneFrames.length) {
    const boardFrames = scenes.map((s) => s.frameUrl);
    const sent = [...render.sceneFrames];
    if (sent.length !== boardFrames.length || sent.some((f, i) => f !== boardFrames[i])) {
      return no('frames_differ', `the render anchors on ${sent.length} frame(s) that are not the approved board's ${boardFrames.filter(Boolean).length}`);
    }
  }
  if (render.sceneScripts && render.sceneScripts.length) {
    const expected = renderScriptsFor(a.board);
    const sent = [...render.sceneScripts];
    if (!expected || sent.length !== expected.length || sent.some((s, i) => s !== expected[i])) {
      return no('scripts_differ', `the render's ${sent.length} scene text(s) are not the approved board's`);
    }
  }
  return { ok: true, revision, fingerprint, sceneCount: scenes.length };
}

/** The refusal in the user's words (ka · en · ru): what changed, and that nothing was rendered or charged. */
export function describeApprovalRefusal(v: Extract<ApprovalVerdict, { ok: false }>, locale: 'ka' | 'en' | 'ru' = 'ka'): string {
  const what: Record<ApprovalMismatch, Record<'ka' | 'en' | 'ru', string>> = {
    bad_fingerprint: { ka: 'დადასტურებას არ ახლავს რევიზიის ანაბეჭდი', en: 'the approval carries no revision fingerprint', ru: 'в подтверждении нет отпечатка ревизии' },
    board_changed: { ka: 'სთორიბორდი დადასტურების შემდეგ შეიცვალა', en: 'the storyboard changed after it was approved', ru: 'раскадровка изменилась после подтверждения' },
    scene_count: { ka: 'სცენების რაოდენობა დადასტურებულს არ ემთხვევა', en: 'the scene count is not the approved one', ru: 'число сцен не совпадает с подтверждённым' },
    clip_sec: { ka: 'სცენის ხანგრძლივობა დადასტურებულს არ ემთხვევა', en: 'the scene length is not the approved one', ru: 'длительность сцены не совпадает с подтверждённой' },
    frames_differ: { ka: 'კადრები დადასტურებული სთორიბორდის არ არის', en: 'the frames are not the approved storyboard’s', ru: 'кадры не из подтверждённой раскадровки' },
    scripts_differ: { ka: 'სცენების ტექსტი დადასტურებული სთორიბორდის არ არის', en: 'the scene texts are not the approved storyboard’s', ru: 'тексты сцен не из подтверждённой раскадровки' },
  };
  const tail = {
    ka: `რევიზია ${v.revision} · ${v.fingerprint}. არაფერი არ დარენდერდა და არ ჩამოიჭრა — დაადასტურეთ სთორიბორდი თავიდან.`,
    en: `revision ${v.revision} · ${v.fingerprint}. Nothing was rendered or charged — approve the storyboard again.`,
    ru: `ревизия ${v.revision} · ${v.fingerprint}. Ничего не отрендерено и не списано — подтвердите раскадровку снова.`,
  };
  return `${what[v.reason][locale]} (${tail[locale]})`;
}
