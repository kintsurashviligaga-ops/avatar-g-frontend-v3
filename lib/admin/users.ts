/**
 * lib/admin/users.ts — admin user management (server-only, service-role).
 *
 * Read + a single privileged write (credit grant). Both are FAIL-OPEN on read and FAIL-SAFE on write
 * (a grant only reports success when the ledger row actually landed). MUST be called with the
 * service-role client, and ONLY from an admin-gated route/page — nothing here re-checks admin.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface AdminUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  credits_balance: number;
  created_at: string;
}

export interface AdminUserPage {
  users: AdminUserRow[];
  total: number;
}

export const USERS_PAGE_SIZE = 25;

/** List/search users from `profiles`, newest first, paginated. Fail-open → empty page. */
export async function listUsers(client: Client, opts: { q?: string; page?: number } = {}): Promise<AdminUserPage> {
  const page = Math.max(0, Math.floor(opts.page ?? 0));
  const from = page * USERS_PAGE_SIZE;
  const to = from + USERS_PAGE_SIZE - 1;
  const q = (opts.q ?? '').trim();

  try {
    let query = client
      .from('profiles')
      .select('id, email, full_name, credits_balance, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // Search by email or name. Escape for PostgREST `ilike` — backslash FIRST so it can't double-escape
    // a following metachar, then the ilike wildcards (%,_) and the or()-splitting chars (,()).
    if (q) {
      const safe = q.replace(/[\\%_,()]/g, (c) => `\\${c}`);
      query = query.or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`);
    }

    const { data, count, error } = await query;
    if (error || !Array.isArray(data)) return { users: [], total: 0 };
    const users = (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      email: (r.email as string | null) ?? null,
      full_name: (r.full_name as string | null) ?? null,
      credits_balance: Number(r.credits_balance) || 0,
      created_at: String(r.created_at),
    }));
    return { users, total: typeof count === 'number' ? count : users.length };
  } catch {
    return { users: [], total: 0 };
  }
}

export interface GrantResult {
  ok: boolean;
  newBalance: number | null;
  error?: string;
}

/** Max a single admin grant can add — a guardrail against a fat-finger million-credit grant. */
export const MAX_GRANT = 100_000;

/**
 * Grant `amount` credits to a user by appending a `credit_ledger` row with reason `admin_adjustment`
 * (a constraint-valid reason — unlike the buggy `wallet_topup`), letting the balance trigger apply the
 * delta. Returns the new balance. Validates the amount server-side (positive integer, capped).
 */
export async function grantCredits(client: Client, userId: string, amount: number, actorId: string): Promise<GrantResult> {
  const amt = Math.floor(Number(amount));
  if (!userId || !Number.isFinite(amt) || amt <= 0 || amt > MAX_GRANT) {
    return { ok: false, newBalance: null, error: 'invalid_amount' };
  }
  try {
    // Confirm the target exists before crediting (never grant to a phantom id).
    const { data: target } = await client.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!target) return { ok: false, newBalance: null, error: 'user_not_found' };

    const { error } = await client.from('credit_ledger').insert({
      user_id: userId,
      delta: amt,
      reason: 'admin_adjustment',
      metadata: { source: 'admin_grant', actor: actorId, ref: `admin:grant:${randomUUID()}` },
    });
    if (error) return { ok: false, newBalance: null, error: error.message };

    const { data } = await client.from('profiles').select('credits_balance').eq('id', userId).maybeSingle();
    return { ok: true, newBalance: data ? Number((data as { credits_balance?: number }).credits_balance) || 0 : null };
  } catch (e) {
    return { ok: false, newBalance: null, error: e instanceof Error ? e.message : 'grant_failed' };
  }
}

/**
 * Adjust a user's credits BY EMAIL by a signed integer delta (v358 #2 — admin increment/decrement).
 * |delta| is capped at MAX_GRANT. A DECREMENT goes through the existing `deduct_credits` RPC, which locks the
 * balance row FOR UPDATE and rejects (insufficient_credits) when it would drop below zero — so concurrent
 * debits can NEVER drive a wallet negative (no app-side TOCTOU). A grant is a raw constraint-valid
 * `admin_adjustment` ledger row (a grant can't underflow). The email is matched case-insensitively with LIKE
 * metacharacters ESCAPED, so a % / _ in the address can never wildcard-match a different account.
 */
export async function adjustCreditsByEmail(client: Client, email: string, amount: number, actorId: string): Promise<GrantResult> {
  const em = (email ?? '').trim().toLowerCase();
  const amt = Math.trunc(Number(amount));
  if (!em || !Number.isFinite(amt) || amt === 0 || Math.abs(amt) > MAX_GRANT) {
    return { ok: false, newBalance: null, error: 'invalid_amount' };
  }
  try {
    // Exact, case-insensitive match: escape LIKE wildcards so the address is treated literally.
    const safeEmail = em.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: target } = await client.from('profiles').select('id, credits_balance').ilike('email', safeEmail).maybeSingle();
    if (!target) return { ok: false, newBalance: null, error: 'user_not_found' };
    const userId = (target as { id: string }).id;
    const current = Number((target as { credits_balance?: number }).credits_balance) || 0;
    const ref = `admin:adjust:${randomUUID()}`;

    if (amt < 0) {
      // Atomic locked debit (FOR UPDATE + insufficient_credits floor) — no read-then-insert race.
      const { data, error } = await client.rpc('deduct_credits', { p_user_id: userId, p_amount: -amt, p_ref: ref });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('insufficient')) return { ok: false, newBalance: current, error: 'insufficient_balance' };
        return { ok: false, newBalance: null, error: error.message || 'adjust_failed' };
      }
      return { ok: true, newBalance: Number(data) || 0 };
    }

    const { error } = await client.from('credit_ledger').insert({
      user_id: userId,
      delta: amt,
      reason: 'admin_adjustment',
      metadata: { source: 'admin_grant', actor: actorId, ref },
    });
    if (error) return { ok: false, newBalance: null, error: error.message };

    const { data } = await client.from('profiles').select('credits_balance').eq('id', userId).maybeSingle();
    return { ok: true, newBalance: data ? Number((data as { credits_balance?: number }).credits_balance) || 0 : null };
  } catch (e) {
    return { ok: false, newBalance: null, error: e instanceof Error ? e.message : 'adjust_failed' };
  }
}
