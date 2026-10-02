/**
 * lib/studio/musicLibrary.ts — the Create screen's two small "saved" lists: lyrics, and styles (a description plus the
 * chips that went with it).
 *
 * Device-local on purpose: localStorage, scoped to the signed-in user's id and kept under the sign-out-surviving archive
 * prefix (lib/auth/sessionCleanup `ARCHIVE_PREFIX`) — the same rule the chat archive follows — so the next account on
 * this browser cannot read it through the UI and signing out does not delete what someone wrote. EVERY storage access is
 * inside try/catch (private mode, blocked storage and quota all degrade to "nothing saved", never to an exception), and
 * every value read back is re-validated and re-capped, because anything in localStorage is user-editable.
 *
 * Pure apart from the `Storage` it is handed (default: window.localStorage), so the whole thing is unit-tested.
 */
import { ARCHIVE_PREFIX } from '@/lib/auth/sessionCleanup';
import { currentUid } from '@/lib/chat/historyKeys';
import { cleanStyles } from '@/lib/ai/musicControls';

export type LibraryKind = 'lyrics' | 'styles';

export interface LibraryItem {
  id: string;
  /** The lyrics, or the style description (possibly empty when only chips were saved). */
  text: string;
  /** Styles only: the chips that were picked. */
  chips?: string[];
  savedAt: number;
}

/** Newest first; the oldest fall off past this. */
export const LIBRARY_MAX_ITEMS = 30;
/** Same caps as the fields they come from (OmniStudio's lyrics box is 1200; a style description is a short brief). */
export const LIBRARY_TEXT_MAX: Readonly<Record<LibraryKind, number>> = { lyrics: 1200, styles: 600 };

export const libraryKey = (kind: LibraryKind, uid?: string | null): string => `${ARCHIVE_PREFIX}music-library::${kind}::${uid || 'anon'}`;

function defaultStore(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

function validItem(raw: unknown, kind: LibraryKind): LibraryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { id?: unknown; text?: unknown; chips?: unknown; savedAt?: unknown };
  if (typeof r.id !== 'string' || !r.id || r.id.length > 40 || typeof r.text !== 'string') return null;
  const text = r.text.slice(0, LIBRARY_TEXT_MAX[kind]);
  const chips = kind === 'styles' ? cleanStyles(r.chips) : [];
  if (!text.trim() && !chips.length) return null;
  return { id: r.id, text, ...(chips.length ? { chips } : {}), savedAt: typeof r.savedAt === 'number' && Number.isFinite(r.savedAt) ? r.savedAt : 0 };
}

/** The saved list, newest first. Unreadable / corrupt storage is an empty list. */
export function readLibrary(kind: LibraryKind, uid: string | null | undefined = currentUid(), store: Storage | null = defaultStore()): LibraryItem[] {
  try {
    const raw = store?.getItem(libraryKey(kind, uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, LIBRARY_MAX_ITEMS).map((x) => validItem(x, kind)).filter((x): x is LibraryItem => !!x);
  } catch {
    return [];
  }
}

function write(kind: LibraryKind, uid: string | null | undefined, items: LibraryItem[], store: Storage | null): boolean {
  try {
    if (!store) return false;
    store.setItem(libraryKey(kind, uid), JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export type SaveResult =
  | { ok: true; items: LibraryItem[]; duplicate: boolean }
  | { ok: false; reason: 'empty' | 'storage' };

/**
 * Save the current text (and chips). An identical entry is not added twice — it moves to the top instead.
 */
export function saveToLibrary(
  kind: LibraryKind,
  input: { text: string; chips?: readonly string[] },
  uid: string | null | undefined = currentUid(),
  store: Storage | null = defaultStore(),
): SaveResult {
  const text = input.text.trim().slice(0, LIBRARY_TEXT_MAX[kind]);
  const chips = kind === 'styles' ? cleanStyles([...(input.chips ?? [])]) : [];
  if (!text && !chips.length) return { ok: false, reason: 'empty' };
  const current = readLibrary(kind, uid, store);
  const same = (i: LibraryItem) => i.text.trim() === text && (i.chips ?? []).join(',') === chips.join(',');
  const duplicate = current.some(same);
  const item: LibraryItem = { id: newId(), text, ...(chips.length ? { chips } : {}), savedAt: Date.now() };
  const items = [item, ...current.filter((i) => !same(i))].slice(0, LIBRARY_MAX_ITEMS);
  return write(kind, uid, items, store) ? { ok: true, items, duplicate } : { ok: false, reason: 'storage' };
}

/** Drop one entry; returns the list as it now stands (unchanged when the id is unknown or storage refuses). */
export function removeFromLibrary(
  kind: LibraryKind,
  id: string,
  uid: string | null | undefined = currentUid(),
  store: Storage | null = defaultStore(),
): LibraryItem[] {
  const current = readLibrary(kind, uid, store);
  const items = current.filter((i) => i.id !== id);
  if (items.length === current.length) return current;
  return write(kind, uid, items, store) ? items : current;
}
