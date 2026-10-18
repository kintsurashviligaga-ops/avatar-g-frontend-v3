/**
 * components/studio/montage/draft.ts — the montage edit survives a reload (GG's audit, 2026-10-17: "a finished video
 * is saved, the editable project is not").
 *
 * What is kept, on this device only (localStorage, per viewer): the edit itself (clips, cuts, text, transitions, the
 * song and where it starts, the look, the format) and the media it uses — by the stored reference each one already has
 * (the caller's own upload path, or a Library URL with its token cut off). A file still uploading, or one that failed,
 * has nothing to come back to after a reload, so its clips are left out. Coming back, the references are signed again
 * by /api/upload/resign; one that no longer signs (deleted, another account) drops its clips, and the editor says how
 * many.
 *
 * Pure apart from the storage wrappers at the bottom, which never throw.
 */
import { isMontageAspect, isMontageTransition } from '@/lib/services/montage/montagePlan';
import type { Clip, Edit, MediaKind, MediaSource } from './project';

export const DRAFT_KEY = 'myavatar:montage-draft:v1';
/** A week: past it, a draft is more likely forgotten than wanted, and Library links may be gone. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export interface DraftSource { id: string; kind: MediaKind; name: string; ref: string; durationSec: number }
export interface MontageDraft { v: 1; savedAt: number; edit: Edit; sources: DraftSource[] }

const KINDS: readonly MediaKind[] = ['video', 'image', 'audio'];

/** A stored reference as it is kept: a path as it is, a URL without its query (no signing token at rest). */
export function storableRef(ref: string): string {
  return /^https?:\/\//i.test(ref) ? ref.split(/[?#]/)[0]! : ref;
}

/** The edit and the media it can come back with; null when there is nothing to come back to. */
export function draftOf(edit: Edit, sources: Readonly<Record<string, MediaSource>>, now = Date.now()): MontageDraft | null {
  const keep = (id: string | null): MediaSource | null => {
    const s = id ? sources[id] : undefined;
    return s && s.status === 'ready' && s.ref ? s : null;
  };
  const clips = edit.clips.filter((c) => keep(c.sourceId));
  const music = keep(edit.musicId);
  if (clips.length === 0 && !music) return null;
  const used = new Map<string, MediaSource>();
  for (const c of clips) used.set(c.sourceId, sources[c.sourceId]!);
  if (music) used.set(music.id, music);
  return {
    v: 1,
    savedAt: now,
    edit: { ...edit, clips, musicId: music ? music.id : null, musicStartSec: music ? edit.musicStartSec : 0 },
    sources: [...used.values()].map((s) => ({ id: s.id, kind: s.kind, name: s.name, ref: storableRef(s.ref!), durationSec: s.durationSec })),
  };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

function validClip(c: unknown): c is Clip {
  const o = c as Record<string, unknown> | null;
  return !!o && isStr(o.id) && isStr(o.sourceId) && isNum(o.startSec) && isNum(o.endSec) && o.endSec > o.startSec
    && typeof o.muted === 'boolean' && isMontageTransition(o.transition) && isStr(o.caption) && (o.captionPos === 'bottom' || o.captionPos === 'center');
}

/** A stored draft read back, or null when it is missing, malformed, from another version or too old. */
export function parseDraft(raw: string | null, now = Date.now()): MontageDraft | null {
  if (!raw) return null;
  let d: Partial<MontageDraft> | null;
  try { d = JSON.parse(raw) as Partial<MontageDraft>; } catch { return null; }
  if (!d || d.v !== 1 || !isNum(d.savedAt) || now - d.savedAt > DRAFT_MAX_AGE_MS || now < d.savedAt - 60_000) return null;
  const e = d.edit as Partial<Edit> | undefined;
  if (!e || !Array.isArray(e.clips) || !e.clips.every(validClip) || !isMontageAspect(e.aspect)) return null;
  if (!Array.isArray(d.sources)) return null;
  const sources = d.sources.filter((s): s is DraftSource => !!s && isStr(s.id) && KINDS.includes(s.kind) && isStr(s.name) && isStr(s.ref) && s.ref.length > 0 && isNum(s.durationSec));
  const ids = new Set(sources.map((s) => s.id));
  const clips = e.clips.filter((c) => ids.has(c.sourceId));
  const musicId = isStr(e.musicId) && ids.has(e.musicId) ? e.musicId : null;
  if (clips.length === 0 && !musicId) return null;
  return {
    v: 1,
    savedAt: d.savedAt,
    edit: {
      clips,
      aspect: e.aspect,
      musicId,
      musicStartSec: musicId && isNum(e.musicStartSec) ? e.musicStartSec : 0,
      originalSound: e.originalSound !== false,
      grade: e.grade && isNum(e.grade.saturation) && isNum(e.grade.contrast) && isNum(e.grade.brightness) && isNum(e.grade.temperature)
        ? e.grade : { saturation: 100, contrast: 100, brightness: 100, temperature: 0 },
      filterId: isStr(e.filterId) ? e.filterId : 'original',
    },
    sources,
  };
}

/**
 * The draft as an edit again, with `urls` the fresh playable URL for each kept reference (null: it no longer signs).
 * A source that did not sign is dropped with its clips; `dropped` counts the clips (and the song) that went with it.
 */
export function restoreDraft(draft: MontageDraft, urls: Readonly<Record<string, string | null>>): {
  edit: Edit; sources: Record<string, MediaSource>; dropped: number;
} {
  const sources: Record<string, MediaSource> = {};
  for (const s of draft.sources) {
    const url = urls[s.ref];
    if (!url) continue;
    // A Library item plays and renders from its signed URL; an upload keeps its path (the render route signs it).
    sources[s.id] = { id: s.id, kind: s.kind, name: s.name, previewUrl: url, ref: /^https?:\/\//i.test(s.ref) ? url : s.ref, status: 'ready', durationSec: s.durationSec };
  }
  const clips = draft.edit.clips.filter((c) => sources[c.sourceId]);
  const musicId = draft.edit.musicId && sources[draft.edit.musicId] ? draft.edit.musicId : null;
  const dropped = (draft.edit.clips.length - clips.length) + (draft.edit.musicId && !musicId ? 1 : 0);
  return { edit: { ...draft.edit, clips, musicId, musicStartSec: musicId ? draft.edit.musicStartSec : 0 }, sources, dropped };
}

// ─── This device's copy (never throws: a private window or blocked storage just means no draft) ─────────────────

export function loadDraft(now = Date.now()): MontageDraft | null {
  try { return parseDraft(window.localStorage.getItem(DRAFT_KEY), now); } catch { return null; }
}

export function saveDraft(draft: MontageDraft | null): void {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch { /* full or blocked: the edit simply is not kept */ }
}

/** Fresh URLs for a draft's references; null when the editor cannot reach the route (the draft stays for next time). */
export async function resignDraftRefs(refs: readonly string[], signal?: AbortSignal): Promise<Record<string, string | null> | null> {
  try {
    const res = await fetch('/api/upload/resign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refs }),
      signal: signal ?? AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { urls?: unknown } | null;
    const list = j && Array.isArray(j.urls) ? (j.urls as unknown[]) : null;
    if (!list || list.length !== refs.length) return null;
    return Object.fromEntries(refs.map((r, i) => [r, typeof list[i] === 'string' ? (list[i] as string) : null]));
  } catch {
    return null;
  }
}
