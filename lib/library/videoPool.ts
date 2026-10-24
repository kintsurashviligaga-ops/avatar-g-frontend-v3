'use client';

/**
 * lib/library/videoPool — the Library films' <video> elements set aside between two showings of the same card
 * (components/library/PooledVideo; MASTER TASK v3.1 §4.2.5). A kept element is paused and still loaded, so the card
 * that comes back for the same work shows its first frame and length at once and reads nothing again.
 *
 * Few (MAX_KEPT, the oldest let go first, their file released) and private by account: a key is `${owner}:${work id}`,
 * and when the account changes every other owner's element is let go (libraryQuery's useLibraryOwner). An element
 * whose file failed to load is never kept, so a retry starts from scratch.
 */

const MAX_KEPT = 48;
const kept = new Map<string, HTMLVideoElement>(); // oldest first
// Elements whose file failed to load (their error event; a browser also sets `error`), until pointed at another link.
const broken = new WeakSet<HTMLVideoElement>();

/** The pool key of a work's film: the owner first. */
export const videoKey = (owner: string, id: string) => `${owner}:${id}`;

function release(el: HTMLVideoElement) {
  try {
    if (!el.paused) el.pause();
    if (el.hasAttribute('src')) { el.removeAttribute('src'); el.load(); } // lets the browser drop what it read
  } catch { /* an element already gone */ }
}

/** This work's kept element, taken out of the pool (null if none). */
export function takeKeptVideo(key: string): HTMLVideoElement | null {
  const el = kept.get(key) ?? null;
  if (el) kept.delete(key);
  return el;
}

/** The element's file would not load: when its card goes it is let go, not kept. */
export function videoFailed(el: HTMLVideoElement) { broken.add(el); }
/** The element was pointed at another link: that one gets its chance. */
export function videoRetried(el: HTMLVideoElement) { broken.delete(el); }

/** Set a card's element aside for the next card of the same work (paused; never one that failed). */
export function keepVideo(key: string, el: HTMLVideoElement) {
  try { if (!el.paused) el.pause(); } catch { /* an element already gone */ }
  if (el.error || broken.has(el)) { release(el); return; }
  const was = kept.get(key);
  if (was && was !== el) release(was);
  kept.delete(key);
  kept.set(key, el);
  while (kept.size > MAX_KEPT) {
    const [oldest, old] = kept.entries().next().value as [string, HTMLVideoElement];
    kept.delete(oldest);
    release(old);
  }
}

/** Let go of every kept element that is not `owner`'s (all of them when `owner` is null). */
export function releaseKeptVideosExcept(owner: string | null) {
  for (const [key, el] of [...kept.entries()]) {
    if (owner && key.startsWith(`${owner}:`)) continue;
    kept.delete(key);
    release(el);
  }
}

/** How many elements are set aside now (tests). */
export const keptVideoCount = () => kept.size;
