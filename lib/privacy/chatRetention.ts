/**
 * lib/privacy/chatRetention.ts — chat history of inactive accounts (v5.1 Phase 6, GG decision R-2, 2026-11-13 16:47Z).
 * PREPARED, NOT WIRED: the purge runs as the SQL function in docs/v5.1-phase6/sql/02_purge_inactive_chats_DRAFT.sql,
 * called by a cron after GG applies it; until then nothing is deleted.
 *
 * Rule: if a user has not signed in for 365 days, their chat sessions and messages may be purged. The account, the
 * wallet, the ledger and BOG history are kept. An unknown last sign-in never counts as inactive (no purge on a guess).
 */
export const CHAT_INACTIVE_DAYS = 365;
const DAY_MS = 86_400_000;

export function chatPurgeCutoff(now: Date = new Date(), days = CHAT_INACTIVE_DAYS): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** True only when we know the last sign-in and it is older than the cutoff. */
export function isChatPurgeDue(lastSignInAt: string | Date | null | undefined, now: Date = new Date(), days = CHAT_INACTIVE_DAYS): boolean {
  if (!lastSignInAt) return false;
  const t = new Date(lastSignInAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t < chatPurgeCutoff(now, days).getTime();
}
