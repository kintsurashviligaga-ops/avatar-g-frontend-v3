import { ARCHIVE_PREFIX } from '@/lib/auth/sessionCleanup';

/**
 * Where a user's conversation archive lives on this device.
 *
 * ⚠️ TWO SEPARATE DEFECTS MEET IN THIS ONE STRING, AND BOTH ARE DATA LOSS.
 *
 * 1. THE KEY WAS NOT USER-SCOPED. `myavatar-omni-conversations` is a single global slot, so two accounts
 *    sharing a browser read and overwrite each other's history — and each sees the other's threads. That
 *    is a data-loss bug and a privacy leak in the same line.
 * 2. THE KEY WAS INSIDE THE SIGN-OUT WIPE. Every `myavatar*` key is cleared on sign-out (correctly, for
 *    session state). Because Supabase has never actually persisted a chat — `chat_sessions` is empty,
 *    0 rows, because `createSession()` selects a column that does not exist — that wipe was deleting the
 *    ONLY copy. Signing out destroyed every conversation the user had ever had.
 *
 * Scoping the key by uid fixes both at once: the archive is unreachable by the next account on this
 * browser (privacy), and it sits under ARCHIVE_PREFIX, which sign-out preserves (durability).
 *
 * ⚠️ MIGRATION IS NOT OPTIONAL HERE. Changing a storage key normally orphans whatever is under the old
 * one — which would mean this fix, whose entire purpose is to stop losing history, opened by losing
 * everyone's history exactly once. `adoptLegacyArchive` moves the existing data across on first read.
 */

/** The pre-uid global slot. Read once per user, then left alone. */
export const LEGACY_CONVERSATIONS_KEY = 'myavatar-omni-conversations';

/**
 * The archive key for a user. Signed-out visitors get a shared anonymous slot — their work is not
 * attached to an identity yet, and it is still better kept than dropped.
 */
export function conversationsKey(uid?: string | null): string {
  return `${ARCHIVE_PREFIX}conversations::${uid || 'anon'}`;
}

/**
 * The signed-in uid, as published on <html data-uid> by ChatChrome.
 *
 * Read from the DOM rather than plumbed through props because the archive is touched from two components
 * that do not share a provider (OmniStudio and ChatChrome's sidebar), and a stale uid in either would
 * split one user's history across two keys — the failure this module exists to prevent.
 */
export function currentUid(): string | null {
  if (typeof document === 'undefined') return null;
  const v = document.documentElement.dataset.uid;
  return v && v !== '0' ? v : null;
}

/**
 * Move a pre-existing global archive into this user's scoped key, once.
 *
 * Only ever fills an EMPTY destination, so it can never clobber a real archive, and it is safe to call
 * on every read. The legacy key is deliberately NOT deleted: if two accounts share this browser the
 * first to sign in would otherwise consume history that may belong to the other, and leaving a stale
 * copy behind is cheaper than being wrong about whose it was. Sign-out clears it anyway (it carries no
 * ARCHIVE_PREFIX), which is the correct outcome for a slot whose owner is genuinely unknown.
 */
export function adoptLegacyArchive(uid?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const dest = conversationsKey(uid);
    const existing = window.localStorage.getItem(dest);
    if (existing && existing !== '[]') return;
    const legacy = window.localStorage.getItem(LEGACY_CONVERSATIONS_KEY);
    if (!legacy || legacy === '[]') return;
    window.localStorage.setItem(dest, legacy);
  } catch { /* private mode / quota — nothing to migrate into */ }
}
