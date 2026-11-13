/**
 * lib/privacy/accountDeletion.ts — account deletion that removes the person but keeps the money trail
 * (v5.1 Phase 6, GG decision R-1, 2026-11-13 16:47Z). Wired into POST /api/account/delete behind ACCOUNT_DELETE_V2=on;
 * off by default, so today's route is unchanged until GG turns it on.
 *
 * Why it must change: every payment table (credits_ledger, bog_orders, subscriptions, allowance grants, tax invoices,
 * wallet top-ups) is `user_id … REFERENCES auth.users ON DELETE CASCADE`. A hard delete of the auth user therefore wipes the
 * BOG payment history and the ledger, which GG needs for accounting, tax and BOG reconciliation.
 *
 * What v2 does, in this order:
 *   1. storage: removes the user's files under `<uid>/` in each per-user bucket (best effort, every miss reported);
 *   2. personal rows: deletes profile, chats, memories, avatars, business profile, jobs — never a financial table;
 *   3. auth: SOFT-deletes the auth user (Supabase `deleteUser(id, true)`): the login, email, phone and identities are
 *      removed or obfuscated and the account can never sign in again, but the row (only a random UUID now) stays, so
 *      nothing cascades. The ledger and BOG rows remain, keyed by that UUID and no longer linked to a name or email.
 * A failure in 1–2 is reported and deletion continues (the person asked to leave); a failure in 3 fails the request.
 * No schema change, no change to ledger or BOG code.
 */

export const ACCOUNT_DELETE_V2_FLAG = 'ACCOUNT_DELETE_V2';

/** Personal content: deleted. `col` is the column holding the auth user id. */
export const PERSONAL_TABLES: readonly { table: string; col: string }[] = [
  { table: 'chat_messages', col: 'user_id' },
  { table: 'chat_sessions', col: 'user_id' },
  { table: 'agent_g_memory', col: 'user_id' },
  { table: 'avatars', col: 'user_id' },
  { table: 'business_profiles', col: 'user_id' },
  { table: 'jobs', col: 'user_id' },
  { table: 'profiles', col: 'id' },
];

/** Financial records: kept, pseudonymous (keyed only by the UUID of a soft-deleted user). Never in PERSONAL_TABLES. */
export const FINANCIAL_TABLES: readonly string[] = [
  'credits', 'credits_ledger', 'credit_transactions', 'bog_orders', 'subscriptions', 'subscription_allowance_grants',
  'wallet_topups', 'invoices', 'invoice_items', 'tax_accounting_records',
];

/** Buckets whose objects live under `<uid>/…`. Buckets keyed by job or prediction id are cleaned by retention, not here. */
export const USER_PREFIX_BUCKETS: readonly string[] = ['avatars', 'twins', 'workspaces', 'studio', 'job-artifacts'];

export function accountDeleteV2Enabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return String(env[ACCOUNT_DELETE_V2_FLAG] || '').trim().toLowerCase() === 'on';
}

type Err = { message?: string } | null | undefined;
export interface DeletionDeps {
  /** Paths (relative to the bucket) of every object under `<uid>/`, or null when listing failed. */
  listUserFiles(bucket: string, uid: string): Promise<string[] | null>;
  removeFiles(bucket: string, paths: string[]): Promise<{ error?: Err }>;
  deleteRows(table: string, col: string, uid: string): Promise<{ error?: Err }>;
  softDeleteAuthUser(uid: string): Promise<{ error?: Err }>;
}

export type DeletionProblem = { step: 'storage' | 'rows' | 'auth'; target: string; reason: string };
export type DeletionResult = { ok: boolean; removedFiles: number; problems: DeletionProblem[] };

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)).slice(0, 200);

export async function runAccountDeletion(uid: string, deps: DeletionDeps): Promise<DeletionResult> {
  const problems: DeletionProblem[] = [];
  let removedFiles = 0;
  if (!/^[0-9a-f-]{36}$/i.test(uid)) return { ok: false, removedFiles, problems: [{ step: 'auth', target: 'user', reason: 'bad_user_id' }] };

  for (const bucket of USER_PREFIX_BUCKETS) {
    try {
      const paths = await deps.listUserFiles(bucket, uid);
      if (paths === null) { problems.push({ step: 'storage', target: bucket, reason: 'list_failed' }); continue; }
      const own = paths.filter((p) => p.startsWith(`${uid}/`)); // never anything outside the user's own prefix
      for (let i = 0; i < own.length; i += 100) {
        const batch = own.slice(i, i + 100);
        const { error } = await deps.removeFiles(bucket, batch);
        if (error) problems.push({ step: 'storage', target: bucket, reason: reasonOf(error) });
        else removedFiles += batch.length;
      }
    } catch (e) {
      problems.push({ step: 'storage', target: bucket, reason: reasonOf(e) });
    }
  }

  for (const { table, col } of PERSONAL_TABLES) {
    try {
      const { error } = await deps.deleteRows(table, col, uid);
      if (error) problems.push({ step: 'rows', target: table, reason: reasonOf(error) });
    } catch (e) {
      problems.push({ step: 'rows', target: table, reason: reasonOf(e) });
    }
  }

  try {
    const { error } = await deps.softDeleteAuthUser(uid);
    if (error) {
      problems.push({ step: 'auth', target: 'user', reason: reasonOf(error) });
      return { ok: false, removedFiles, problems };
    }
  } catch (e) {
    problems.push({ step: 'auth', target: 'user', reason: reasonOf(e) });
    return { ok: false, removedFiles, problems };
  }
  return { ok: true, removedFiles, problems };
}
