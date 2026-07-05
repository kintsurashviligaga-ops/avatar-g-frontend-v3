/**
 * Wallet + onboarding server lifecycle (server-only).
 *
 * Thin, fail-OPEN wrappers over the SECURITY DEFINER RPCs from
 * 20260523_wallet_and_onboarding.sql, called with the service-role client so they
 * run above RLS (webhook + produce routes have no user session). Every helper
 * degrades cleanly when the RPC/migration isn't present yet — callers fall back
 * to existing behavior, so this is strictly additive (zero regression).
 */

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

function client(): ReturnType<typeof createServiceRoleClient> | null {
  try { return createServiceRoleClient(); } catch { return null; }
}

/**
 * Idempotently credit `amountGel` to the user's GEL balance (via credit_ledger).
 * `ref` (e.g. `stripe:<session_id>`) makes a re-delivered webhook a no-op.
 * Returns the new balance, or null when unavailable (fail-open).
 */
export async function creditWalletGel(userId: string, amountGel: number, ref: string): Promise<number | null> {
  const sb = client();
  if (!sb || !Number.isFinite(amountGel) || amountGel <= 0) return null;
  try {
    const { data, error } = await sb.rpc('credit_wallet_gel', { p_user_id: userId, p_amount: amountGel, p_ref: ref });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Atomically consume one free avatar response.
 *   >= 0 → a free slot was burned (new remaining count)
 *   -1   → none remaining (caller should charge)
 *   null → RPC/migration absent or errored (caller keeps existing behavior)
 */
export async function consumeFreeAvatarChat(userId: string): Promise<number | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('consume_free_avatar_chat', { p_user_id: userId });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Atomically consume the user's one free 30-second film.
 *   >= 0 → the free film was burned (new remaining count) → caller WAIVES the charge
 *   -1   → none remaining → caller charges normally
 *   null → RPC/migration absent or errored → caller charges normally (fail-SAFE:
 *          we only ever waive the charge when the DB positively confirms a slot,
 *          so a missing migration can never create an infinite free loophole)
 */
export async function consumeFreeFilm(userId: string): Promise<number | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('consume_free_film', { p_user_id: userId });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Compensation for consumeFreeFilm: returns the free slot when a render that
 * consumed it later fails (saga rollback). Best-effort — a miss here only means
 * the user keeps having spent their free film, never a charge. Returns the new
 * remaining count, or null when unavailable.
 */
export async function restoreFreeFilm(userId: string): Promise<number | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('restore_free_film', { p_user_id: userId });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Compensation for consumeFreeAvatarChat: returns a free avatar-chat slot when a render that consumed it
 * later fails (saga rollback). Best-effort + fail-open — if the `restore_free_avatar_chat` RPC isn't
 * provisioned yet this simply no-ops (the user keeps having spent the slot, never a charge). Returns the
 * new remaining count, or null when unavailable.
 */
export async function restoreFreeAvatarChat(userId: string): Promise<number | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('restore_free_avatar_chat', { p_user_id: userId });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/** Persist the avatar name + flip is_avatar_named server-side. Best-effort. */
export async function setAvatarName(userId: string, name: string): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  try {
    const { error } = await sb.rpc('set_avatar_name', { p_user_id: userId, p_name: name.slice(0, 40) });
    return !error;
  } catch {
    return false;
  }
}

export interface OnboardingState {
  avatarName: string | null;
  isAvatarNamed: boolean;
  freeRemaining: number;
  /** Free 30-second films left (starter grant, default 3 since 2026-06-23; was 1).
   *  Drives the honest "0.00 GEL · N Free Videos Remaining" ledger on the studio home. */
  freeFilmsRemaining: number;
}

/** Read the authed user's onboarding state from their profile row. Fail-open null. */
export async function getOnboardingState(userId: string): Promise<OnboardingState | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('avatar_name,is_avatar_named,free_avatar_chats_remaining,free_films_remaining')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      avatar_name?: string | null;
      is_avatar_named?: boolean | null;
      free_avatar_chats_remaining?: number | null;
      free_films_remaining?: number | null;
    };
    return {
      avatarName: row.avatar_name ?? null,
      isAvatarNamed: Boolean(row.is_avatar_named),
      freeRemaining: typeof row.free_avatar_chats_remaining === 'number' ? row.free_avatar_chats_remaining : 3,
      freeFilmsRemaining: typeof row.free_films_remaining === 'number' ? row.free_films_remaining : 0,
    };
  } catch {
    return null;
  }
}
