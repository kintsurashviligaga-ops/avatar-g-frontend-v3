/**
 * lib/music/producer/videoTargets.ts — the films a Music Producer track can go into ("Use in Video"). Client-safe store.
 *
 * The Director's Workflow (#349–#355) registers a film here when its final cut is ready (`registerFilmTarget`), and the
 * Music Card / Agent G's plan card read it. This keeps the two pipelines apart until both are merged: the video side
 * needs ONE call after a cut, the music side never imports the video code. Kept in memory and in sessionStorage (this
 * tab only, best effort), never in the database.
 */
import type { PlacementScene } from './placement';

export interface FilmTarget {
  projectId: string;
  title: string;
  /** Our own storage link to the cut film (the place route refuses anything else). */
  filmUrl: string;
  scenes: PlacementScene[];
  /** Scene titles by 1-based position, for the picker ("Scene 3 · The rooftop"). */
  sceneTitles?: string[];
  at: number;
}

const KEY = 'mp.filmTargets.v1';
const MAX = 5;
let targets: FilmTarget[] | null = null;
/** The sorted list, rebuilt only on a change (a stable snapshot for useSyncExternalStore). */
let snapshot: FilmTarget[] | null = null;
const subs = new Set<() => void>();

function load(): FilmTarget[] {
  if (targets) return targets;
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as FilmTarget[]) : [];
    targets = Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.filmUrl === 'string' && Array.isArray(t.scenes)) : [];
  } catch { targets = []; }
  return targets;
}

function save() {
  snapshot = null;
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify(targets ?? [])); } catch { /* best effort */ }
  subs.forEach((f) => f());
}

/** Newest first. The same array until the next change. */
export const filmTargets = (): FilmTarget[] => (snapshot ??= [...load()].sort((a, b) => b.at - a.at));

export function registerFilmTarget(t: Omit<FilmTarget, 'at'> & { at?: number }): void {
  const list = load().filter((x) => x.projectId !== t.projectId);
  targets = [{ ...t, at: t.at ?? Date.now() }, ...list].slice(0, MAX);
  save();
}

export function subscribeFilmTargets(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

/** Tests only. */
export function resetFilmTargets(): void { targets = []; save(); }
