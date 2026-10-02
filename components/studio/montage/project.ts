/**
 * components/studio/montage/project.ts — the montage editor's project, as pure data.
 *
 * Everything the CapCut-style editor does to an edit is a function here: add, split, trim, reorder,
 * duplicate, delete, transitions, captions, format, music, grade. No React and no DOM, so the timeline
 * arithmetic — the part that silently plays or exports the wrong footage when it is wrong — is unit-tested
 * (project.test.ts).
 *
 * Two halves on purpose:
 *  · `MediaSource` — an imported file or a library item, with its upload state. NOT undoable: an upload
 *    finishing is not an edit, and undo must never "un-upload" a clip.
 *  · `Edit` — the timeline the user shapes. Undoable (see `History`).
 *
 * The export is the existing /api/v2/montage/render contract (lib/services/montage/montagePlan), so the
 * numbers this file checks are the server's own limits, imported rather than restated.
 */
import {
  MAX_SHOTS,
  MAX_SHOT_SEC,
  MAX_TOTAL_SEC,
  MIN_SHOT_SEC,
  timelineDuration,
  type MontageAspect,
  type MontageCaptionPos,
  type MontageGrade,
  type MontageShot,
  type MontageTransition,
} from '@/lib/services/montage/montagePlan';

export type MediaKind = 'video' | 'image' | 'audio';
export type UploadState = 'uploading' | 'ready' | 'error';

export interface MediaSource {
  id: string;
  kind: MediaKind;
  name: string;
  /** What the browser plays and draws: a blob: URL for a local file, the signed URL for a library item. */
  previewUrl: string;
  /** Storage path once a local file has uploaded (the route signs it), or the library item's https URL. */
  ref: string | null;
  status: UploadState;
  /** Localized upload failure, shown on the clip. */
  error?: string;
  /** Why it failed: 'auth' is fixed by signing in, not by changing the file. */
  errorKind?: 'auth' | 'rate' | 'too-large' | 'fail';
  /** Source length in seconds; 0 when the browser could not decode it (the server measures those). */
  durationSec: number;
}

export interface Clip {
  id: string;
  sourceId: string;
  /** Trim window into the source. A photo uses `endSec - startSec` as how long it stays on screen. */
  startSec: number;
  endSec: number;
  muted: boolean;
  /** Transition INTO this clip. Meaningless on the first clip, so the export sends 'cut' there. */
  transition: MontageTransition;
  caption: string;
  captionPos: MontageCaptionPos;
}

export interface Edit {
  clips: Clip[];
  aspect: MontageAspect;
  /** A MediaSource of kind 'audio', laid under the whole edit. */
  musicId: string | null;
  /** The clips' own sound. Off with music = music only; off without music = a silent edit. */
  originalSound: boolean;
  grade: MontageGrade;
  /** The look that set `grade`, or 'custom' once a slider has moved it. */
  filterId: string;
}

export const NEUTRAL_GRADE: MontageGrade = { saturation: 100, contrast: 100, brightness: 100, temperature: 0 };

/** How long a photo stays on screen when it lands on the timeline — CapCut's default beat. */
export const PHOTO_DEFAULT_SEC = 3;
/** The longest a photo can be stretched. Ken Burns past ten seconds is a slideshow nobody watches. */
export const PHOTO_MAX_SEC = 10;
/** A clip whose length the browser could not read gets this window until the server measures it. */
export const UNKNOWN_VIDEO_SEC = 5;

export const emptyEdit = (aspect: MontageAspect = '9:16'): Edit => ({
  clips: [],
  aspect,
  musicId: null,
  originalSound: true,
  grade: NEUTRAL_GRADE,
  filterId: 'original',
});

let idSeq = 0;
/** Stable ids for React keys and for addressing clips; never sent to the server. */
export function newId(prefix = 'c'): string {
  idSeq += 1;
  const rnd = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}${idSeq}-${rnd}`;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const clipDuration = (c: Pick<Clip, 'startSec' | 'endSec'>): number => Math.max(0, c.endSec - c.startSec);

/** The longest a clip from this source may run: its own length, the server's per-shot cap, a photo's cap. */
export function maxClipSec(src: MediaSource | undefined): number {
  if (!src) return MAX_SHOT_SEC;
  if (src.kind === 'image') return PHOTO_MAX_SEC;
  return src.durationSec > 0 ? Math.min(src.durationSec, MAX_SHOT_SEC) : MAX_SHOT_SEC;
}

/**
 * The clip a freshly imported source becomes. A video longer than the per-shot cap starts as its first
 * minute (the user trims to choose another) instead of being refused at export.
 */
export function clipForSource(src: MediaSource): Clip {
  const dur = src.kind === 'image'
    ? PHOTO_DEFAULT_SEC
    : src.durationSec > 0 ? Math.min(src.durationSec, MAX_SHOT_SEC) : UNKNOWN_VIDEO_SEC;
  return {
    id: newId('clip'),
    sourceId: src.id,
    startSec: 0,
    endSec: round3(dur),
    muted: false,
    transition: 'cut',
    caption: '',
    captionPos: 'bottom',
  };
}

// ── TIMELINE ─────────────────────────────────────────────────────────────────────────────────────────

export interface Placed { id: string; index: number; t0: number; t1: number }

/**
 * Where each clip sits on the editor's timeline: back to back, in seconds. This is the PREVIEW clock —
 * transitions are drawn as markers on a boundary, not as overlaps, so a clip's width is its own length.
 * The exported master is slightly shorter wherever a crossfade overlaps (`exportDurationSec`).
 */
export function layout(clips: readonly Clip[]): Placed[] {
  let t = 0;
  return clips.map((c, index) => {
    const t0 = t;
    t += clipDuration(c);
    return { id: c.id, index, t0: round3(t0), t1: round3(t) };
  });
}

export function totalSec(clips: readonly Clip[]): number {
  return round3(clips.reduce((a, c) => a + clipDuration(c), 0));
}

/** The clip under timeline time `t`, and how far into it. The very end belongs to the last clip. */
export function clipAt(clips: readonly Clip[], t: number): { index: number; local: number } | null {
  if (!clips.length) return null;
  const placed = layout(clips);
  for (const p of placed) {
    if (t < p.t1) return { index: p.index, local: Math.max(0, t - p.t0) };
  }
  const last = placed[placed.length - 1]!;
  return { index: last.index, local: last.t1 - last.t0 };
}

/** Timeline time of a clip's first frame. */
export function clipStartTime(clips: readonly Clip[], id: string): number {
  return layout(clips).find((p) => p.id === id)?.t0 ?? 0;
}

// ── EDITS (pure: Edit in, Edit out) ──────────────────────────────────────────────────────────────────

const mapClip = (e: Edit, id: string, fn: (c: Clip) => Clip): Edit => ({
  ...e,
  clips: e.clips.map((c) => (c.id === id ? fn(c) : c)),
});

/** Insert clips after `afterIndex` (default: at the end). Stops at the shot cap and says how many fit. */
export function insertClips(e: Edit, clips: readonly Clip[], afterIndex?: number): { edit: Edit; added: number } {
  const room = Math.max(0, MAX_SHOTS - e.clips.length);
  const take = clips.slice(0, room);
  if (!take.length) return { edit: e, added: 0 };
  const at = afterIndex === undefined ? e.clips.length : clamp(afterIndex + 1, 0, e.clips.length);
  return { edit: { ...e, clips: [...e.clips.slice(0, at), ...take, ...e.clips.slice(at)] }, added: take.length };
}

export function removeClip(e: Edit, id: string): Edit {
  return { ...e, clips: e.clips.filter((c) => c.id !== id) };
}

export function duplicateClip(e: Edit, id: string): Edit {
  if (e.clips.length >= MAX_SHOTS) return e;
  const i = e.clips.findIndex((c) => c.id === id);
  const c = e.clips[i];
  if (!c) return e;
  // The copy follows the original with a hard cut — a transition between a clip and itself reads as a glitch.
  const copy: Clip = { ...c, id: newId('clip'), transition: 'cut' };
  return { ...e, clips: [...e.clips.slice(0, i + 1), copy, ...e.clips.slice(i + 1)] };
}

export function moveClip(e: Edit, id: string, dir: -1 | 1): Edit {
  const i = e.clips.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= e.clips.length) return e;
  const clips = [...e.clips];
  [clips[i], clips[j]] = [clips[j]!, clips[i]!];
  return { ...e, clips };
}

/** Can the clip be cut `local` seconds in? Both halves must still be a real shot. */
export function canSplit(c: Clip | undefined, local: number): boolean {
  if (!c) return false;
  return local >= MIN_SHOT_SEC && clipDuration(c) - local >= MIN_SHOT_SEC;
}

/**
 * Cut a clip in two at `local` seconds into it. Both halves keep the caption, mute and source; the second
 * starts with a hard cut, so playing through the split looks exactly like before it.
 */
export function splitClip(e: Edit, id: string, local: number): { edit: Edit; secondId: string | null } {
  if (e.clips.length >= MAX_SHOTS) return { edit: e, secondId: null };
  const i = e.clips.findIndex((c) => c.id === id);
  const c = e.clips[i];
  if (!c || !canSplit(c, local)) return { edit: e, secondId: null };
  const cut = round3(c.startSec + local);
  const first: Clip = { ...c, endSec: cut };
  const second: Clip = { ...c, id: newId('clip'), startSec: cut, transition: 'cut' };
  return { edit: { ...e, clips: [...e.clips.slice(0, i), first, second, ...e.clips.slice(i + 1)] }, secondId: second.id };
}

/**
 * Move one edge of a clip. A video's window stays inside its source and never shorter than a shot; a photo
 * has no source timeline, so either edge just changes how long it is shown.
 */
export function trimClip(e: Edit, id: string, edge: 'start' | 'end', value: number, src: MediaSource | undefined): Edit {
  return mapClip(e, id, (c) => {
    if (src?.kind === 'image') {
      const dur = clamp(edge === 'end' ? value - c.startSec : c.endSec - value, MIN_SHOT_SEC, PHOTO_MAX_SEC);
      return { ...c, startSec: 0, endSec: round3(dur) };
    }
    const sourceEnd = src && src.durationSec > 0 ? src.durationSec : Number.POSITIVE_INFINITY;
    if (edge === 'start') {
      const lo = Math.max(0, c.endSec - MAX_SHOT_SEC);
      return { ...c, startSec: round3(clamp(value, lo, c.endSec - MIN_SHOT_SEC)) };
    }
    const hi = Math.min(sourceEnd, c.startSec + MAX_SHOT_SEC);
    return { ...c, endSec: round3(clamp(value, c.startSec + MIN_SHOT_SEC, hi)) };
  });
}

/** A photo's on-screen length, from the duration control. */
export function setPhotoDuration(e: Edit, id: string, sec: number): Edit {
  return mapClip(e, id, (c) => ({ ...c, startSec: 0, endSec: round3(clamp(sec, MIN_SHOT_SEC, PHOTO_MAX_SEC)) }));
}

export function setTransition(e: Edit, id: string, t: MontageTransition): Edit {
  return mapClip(e, id, (c) => ({ ...c, transition: t }));
}

/** The same transition into every clip after the first — CapCut's „Apply to all". */
export function setTransitionAll(e: Edit, t: MontageTransition): Edit {
  return { ...e, clips: e.clips.map((c, i) => (i === 0 ? c : { ...c, transition: t })) };
}

export const MAX_CAPTION_CHARS = 120;

export function setCaption(e: Edit, id: string, caption: string, pos?: MontageCaptionPos): Edit {
  return mapClip(e, id, (c) => ({ ...c, caption: caption.slice(0, MAX_CAPTION_CHARS), ...(pos ? { captionPos: pos } : {}) }));
}

export function toggleMute(e: Edit, id: string): Edit {
  return mapClip(e, id, (c) => ({ ...c, muted: !c.muted }));
}

// ── HISTORY ──────────────────────────────────────────────────────────────────────────────────────────

/** Undo/redo over `Edit` snapshots. Capped, so a long session cannot grow it without bound. */
export interface History { past: Edit[]; present: Edit; future: Edit[] }

export const HISTORY_CAP = 60;

export const startHistory = (e: Edit): History => ({ past: [], present: e, future: [] });

/** Record a new present. An edit that changes nothing is not a step (no dead undo presses). */
export function commit(h: History, next: Edit): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_CAP), present: next, future: [] };
}

/** Change the present WITHOUT a step — a trim handle mid-drag; the drag's start was the step. */
export function replacePresent(h: History, next: Edit): History {
  return next === h.present ? h : { ...h, present: next };
}

export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  const next = h.future[0];
  if (!next) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

// ── EXPORT ───────────────────────────────────────────────────────────────────────────────────────────

/** Length of the master the server will produce — crossfades overlap, so this is ≤ the preview clock. */
export function exportDurationSec(edit: Edit, sources: Record<string, MediaSource>): number {
  return timelineDuration(toShots(edit, sources));
}

function toShots(edit: Edit, sources: Record<string, MediaSource>): MontageShot[] {
  const silent = !edit.originalSound;
  return edit.clips.map((c, i) => {
    const src = sources[c.sourceId];
    const kind = src?.kind === 'image' ? 'image' : 'video';
    const caption = c.caption.trim();
    return {
      url: src?.ref ?? '',
      kind,
      startSec: kind === 'image' ? 0 : c.startSec,
      endSec: kind === 'image' ? clipDuration(c) : c.endSec,
      muted: kind === 'image' ? true : silent || c.muted,
      transition: i === 0 ? 'cut' : c.transition,
      ...(caption ? { caption, ...(c.captionPos === 'center' ? { captionPos: 'center' as const } : {}) } : {}),
    };
  });
}

const sameGrade = (a: MontageGrade, b: MontageGrade) =>
  a.saturation === b.saturation && a.contrast === b.contrast && a.brightness === b.brightness && a.temperature === b.temperature;

/** The /api/v2/montage/render body. Only call once `blockers` is empty. */
export function buildRenderBody(edit: Edit, sources: Record<string, MediaSource>): Record<string, unknown> {
  const music = edit.musicId ? sources[edit.musicId] : undefined;
  const musicRef = music?.status === 'ready' ? music.ref : null;
  return {
    shots: toShots(edit, sources),
    aspect: edit.aspect,
    ...(musicRef ? { musicUrl: musicRef, musicOnly: !edit.originalSound } : {}),
    ...(sameGrade(edit.grade, NEUTRAL_GRADE) ? {} : { grade: edit.grade }),
  };
}

export type Blocker =
  | { kind: 'empty' }
  | { kind: 'uploading'; count: number }
  | { kind: 'failed'; count: number }
  | { kind: 'tooLong'; totalSec: number }
  | { kind: 'musicUploading' }
  | { kind: 'musicFailed' };

/**
 * Why Export cannot run yet — in the order the user should fix them. Empty means ready. These mirror the
 * server's own validation, so the button never sends a request the route would refuse.
 */
export function blockers(edit: Edit, sources: Record<string, MediaSource>): Blocker[] {
  if (!edit.clips.length) return [{ kind: 'empty' }];
  const out: Blocker[] = [];
  const used = new Set(edit.clips.map((c) => c.sourceId));
  let uploading = 0;
  let failed = 0;
  for (const id of used) {
    const s = sources[id];
    if (!s || s.status === 'error' || (s.status === 'ready' && !s.ref)) failed += 1;
    else if (s.status === 'uploading') uploading += 1;
  }
  if (failed) out.push({ kind: 'failed', count: failed });
  if (uploading) out.push({ kind: 'uploading', count: uploading });
  const music = edit.musicId ? sources[edit.musicId] : undefined;
  if (music?.status === 'uploading') out.push({ kind: 'musicUploading' });
  if (music?.status === 'error') out.push({ kind: 'musicFailed' });
  const total = exportDurationSec(edit, sources);
  if (total > MAX_TOTAL_SEC) out.push({ kind: 'tooLong', totalSec: total });
  return out;
}

export { MAX_SHOTS, MAX_SHOT_SEC, MAX_TOTAL_SEC, MIN_SHOT_SEC };
