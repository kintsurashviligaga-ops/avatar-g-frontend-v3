/**
 * lib/studio/pendingEdit.ts — a Library file the person asked to edit, carried from /library to the studio's editor.
 *
 * GG's 2026-10-18 UI/UX plan: the Library lets a person search, filter, download AND edit. The Library is its own page
 * (app/[locale]/library), and the editor lives inside the studio, so the file rides over in sessionStorage (this tab
 * only, gone with it) and the studio opens it in the editor once, on mount — the same editor a result's ✂ button in the
 * chat opens: Montage for a video, the Surgical Editor's studios for a picture or a sound. Nothing is generated or
 * charged by opening it.
 *
 * The link is a signed storage URL, so it never goes in the address bar; it expires after 30 min here (its own
 * signature lasts longer), and only an https or same-origin link is taken back.
 */

export type EditKind = 'video' | 'image' | 'audio';

export interface PendingEdit {
  url: string;
  kind: EditKind;
  at: number;
}

const KEY = 'myavatar:pending-edit';
export const PENDING_EDIT_MAX_AGE_MS = 30 * 60_000;

/** Which editor a Library file opens in, from its `service_type` (GET /api/studio/library). A 3D model (.glb, filed as
 *  'image') has no editor here: null. */
export function editKindFor(kind: string, url: string): EditKind | null {
  if (/\.glb(\?|#|$)/i.test(url || '')) return null;
  if (kind === 'film' || kind === 'avatar') return 'video';
  if (kind === 'image' || kind === 'interior') return 'image';
  if (kind === 'music' || kind === 'voice') return 'audio';
  return null;
}

const isEditKind = (k: unknown): k is EditKind => k === 'video' || k === 'image' || k === 'audio';
// https, or a path on this site; never `//host`, `javascript:` or `data:`.
const isSafeUrl = (u: unknown): u is string => typeof u === 'string' && (/^https:\/\//i.test(u) || /^\/(?!\/)/.test(u));

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Keep the file the person tapped "edit" on. Returns false when nothing could be kept (blocked storage, a bad link). */
export function stashPendingEdit(url: string, kind: EditKind, now: number = Date.now()): boolean {
  const s = store();
  if (!s || !isSafeUrl(url) || !isEditKind(kind)) return false;
  try { s.setItem(KEY, JSON.stringify({ url, kind, at: now })); return true; } catch { return false; }
}

/** The kept file, ONCE: reading removes it. Null when there is none, it is malformed or older than 30 min. */
export function takePendingEdit(now: number = Date.now()): PendingEdit | null {
  const s = store();
  if (!s) return null;
  let raw: string | null = null;
  try { raw = s.getItem(KEY); s.removeItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingEdit>;
    const at = typeof p.at === 'number' ? p.at : NaN;
    if (!isSafeUrl(p.url) || !isEditKind(p.kind) || !(now - at >= 0 && now - at <= PENDING_EDIT_MAX_AGE_MS)) return null;
    return { url: p.url, kind: p.kind, at };
  } catch {
    return null;
  }
}
