/**
 * R2 — the duplicate guard in the database, for when Redis cannot answer.
 *
 * When Upstash cannot answer (Production's old host stopped resolving in 2026-09), `claimIdempotencyKey` used to answer
 * "first" to every call and the 60 s guard of the paid film assembly and the per-user paid-dispatch lock were open on
 * every instance. Every instance shares the Supabase database, so the same guard is one row there:
 * `claim_request_idempotency` inserts (owner, key) or takes over an expired row in ONE statement, and the primary key
 * decides between concurrent callers (supabase/migrations/20261013a_request_idempotency.sql, in Production since
 * 2026-10-13).
 *
 * On a database without that migration (a local or older one) the functions do not exist: the first call learns so,
 * every call answers 'unavailable' for the next 10 minutes without asking again, and the caller fails open, as before
 * R2. Any other database error is 'unavailable' too: a guard that cannot be read must never block a paying user (the
 * durable ledger debit is the money guard).
 */
import 'server-only';

export type StoreAnswer = 'claimed' | 'held' | 'unavailable';

const MISSING_RECHECK_MS = 10 * 60_000;
let missingUntil = 0;

type RpcError = { code?: string; message?: string } | null;
interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
}

// Loaded on first use, not at import: dozens of routes and their unit tests import ./idempotency, and the Supabase
// client pulls in the env schema. A client that cannot be built is 'unavailable', like any other failure.
async function serviceRoleClient(): Promise<RpcClient> {
  const { createServiceRoleClient } = await import('@/lib/supabase/server');
  return createServiceRoleClient() as unknown as RpcClient;
}

let clientFactory: () => RpcClient | Promise<RpcClient> = serviceRoleClient;

/** Tests only: the client the store talks to. */
export function __setStoreClientForTests(factory: (() => RpcClient) | null): void {
  clientFactory = factory ?? serviceRoleClient;
  missingUntil = 0;
}

function configured(): boolean {
  return Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** PostgREST's "no such function" (PGRST202) or Postgres' undefined function/table: the migration is not applied. */
function notProvisioned(error: RpcError): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || /could not find the function/i.test(error.message ?? '');
}

export async function storeClaim(owner: string, key: string, windowSec: number): Promise<StoreAnswer> {
  if (!configured() || Date.now() < missingUntil) return 'unavailable';
  const window = Math.min(3600, Math.max(1, Math.round(windowSec)));
  try {
    const { data, error } = await (await clientFactory()).rpc('claim_request_idempotency', { p_owner: owner, p_key: key, p_window_sec: window });
    if (error) {
      if (notProvisioned(error)) missingUntil = Date.now() + MISSING_RECHECK_MS;
      return 'unavailable';
    }
    if (data === true) return 'claimed';
    if (data === false) return 'held';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function storeRelease(owner: string, key: string): Promise<void> {
  if (!configured() || Date.now() < missingUntil) return;
  try {
    const { error } = await (await clientFactory()).rpc('release_request_idempotency', { p_owner: owner, p_key: key });
    if (notProvisioned(error)) missingUntil = Date.now() + MISSING_RECHECK_MS;
  } catch {
    // A key that could not be freed expires on its own window.
  }
}
