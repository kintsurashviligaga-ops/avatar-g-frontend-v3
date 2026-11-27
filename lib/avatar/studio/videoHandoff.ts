/**
 * lib/avatar/studio/videoHandoff.ts — "Use in Video": a presenter scene (or the whole presentation) offered to the
 * Director's Workflow as a ready scene. Client-safe store, the same seam as lib/music/producer/videoTargets: the
 * Director's Workflow (#349–#355, not merged) reads `studioClips()` when its storyboard opens and offers them as scenes;
 * the Studio never imports the video code. This tab only (sessionStorage, best effort), never the database.
 * Montage, which IS in production, takes a clip through lib/studio/pendingEdit instead.
 */
export interface StudioClip {
  /** `${projectId}:${sceneIndex}` or `${projectId}:all`. */
  key: string;
  url: string;
  durationSec: number;
  title: string;
  /** The words said, for the scene card and subtitles. */
  text: string;
  format: '16:9' | '9:16';
  at: number;
}

const KEY = 'vs.studioClips.v1';
const MAX = 10;
let clips: StudioClip[] | null = null;
let snapshot: StudioClip[] | null = null;
const subs = new Set<() => void>();
const isHttps = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//i.test(u);

function load(): StudioClip[] {
  if (clips) return clips;
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as StudioClip[]) : [];
    clips = Array.isArray(parsed) ? parsed.filter((c) => c && isHttps(c.url) && typeof c.key === 'string') : [];
  } catch { clips = []; }
  return clips;
}

function save() {
  snapshot = null;
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify(clips ?? [])); } catch { /* best effort */ }
  subs.forEach((f) => f());
}

/** Newest first; the same array until the next change. */
export const studioClips = (): StudioClip[] => (snapshot ??= [...load()].sort((a, b) => b.at - a.at));

/** Offers a clip (replacing an older offer of the same scene). Refuses anything but an https link. */
export function offerToVideo(c: Omit<StudioClip, 'at'> & { at?: number }): boolean {
  if (!isHttps(c.url) || !(c.durationSec > 0)) return false;
  clips = [{ ...c, at: c.at ?? Date.now() }, ...load().filter((x) => x.key !== c.key)].slice(0, MAX);
  save();
  return true;
}

/** The Director's Workflow takes one when it adds it as a scene. */
export function takeStudioClip(key: string): StudioClip | null {
  const found = load().find((c) => c.key === key) ?? null;
  if (found) { clips = load().filter((c) => c.key !== key); save(); }
  return found;
}

export function subscribeStudioClips(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

/** Tests only. */
export function resetStudioClips(): void { clips = []; save(); }
