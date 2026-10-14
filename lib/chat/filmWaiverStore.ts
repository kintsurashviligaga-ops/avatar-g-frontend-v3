/**
 * The film's payment waiver, in the database (proposals/20261014a_film_payment_waivers.sql) and — before that migration
 * exists — read from the credit ledger.
 *
 * A film is paid when it STARTS; /api/video/assemble, another serverless function, must learn that without Redis (whose
 * Production host stopped resolving: defect 44). Three answers, from the most to the least durable:
 *   1. the waiver table's three RPCs (record / consume / restore): one UPDATE decides which of N concurrent assembles
 *      spends the waiver, and the paid kind is only recorded against a real ledger debit;
 *   2. with the table not yet applied: the ledger itself. The up-front debit is under `${tokenId}:charge`
 *      (lib/chat/filmComposite), so `netDebitedForRef(user, ref) > 0` proves the payment, and the ONE spend is a claim in
 *      request_idempotency (in Production since 2026-10-13, 1 h window). ⚠️ An expired claim row is TAKEN OVER, not held,
 *      so the ledger only vouches while the charge itself is younger than the window: every earlier claim was made after
 *      the charge and is provably still alive. Older than that → 'unavailable' (Redis decides; failing it, billed);
 *   3. nothing answers: 'unavailable' — the caller keeps its Redis markers, and failing everything it bills the stitch.
 *
 * Every error is 'unavailable', never a waiver: a store that cannot be read must not give a film away.
 */
import 'server-only';
import { firstDebitAtForRef, netDebitedForRef } from '@/lib/orchestrator/ledger';
import { storeClaim, storeRelease } from '@/lib/orchestrator/idempotencyStore';

export type WaiverAnswer = 'paid' | 'free' | 'spent' | 'void' | 'none' | 'unavailable';

type RpcError = { code?: string; message?: string } | null;
interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
}

const MISSING_RECHECK_MS = 10 * 60_000;
const CLAIM_WINDOW_SEC = 3600;
/** Margin for the app server's clock against the database's `now()`. */
const CLAIM_SKEW_MS = 5 * 60_000;
let missingUntil = 0;

async function serviceRoleClient(): Promise<RpcClient> {
  const { createServiceRoleClient } = await import('@/lib/supabase/server');
  return createServiceRoleClient() as unknown as RpcClient;
}
let clientFactory: () => RpcClient | Promise<RpcClient> = serviceRoleClient;

/** Tests only. */
export function __setWaiverClientForTests(factory: (() => RpcClient) | null): void {
  clientFactory = factory ?? serviceRoleClient;
  missingUntil = 0;
}

function configured(): boolean {
  return Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function notProvisioned(error: RpcError): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || /could not find the function/i.test(error.message ?? '');
}

/** The ledger ref of a film's up-front debit — derivable from the token, so any instance can find it. */
export function filmChargeRefFor(tokenId: string): string {
  return `${tokenId}:charge`;
}

const claimKey = (tokenId: string) => `film-waiver:${tokenId}`;

// The RPC name is written out at each call site (not passed in): the schema-drift scanner reads literal names.
async function call(run: (c: RpcClient) => PromiseLike<{ data: unknown; error: RpcError }>): Promise<{ data: unknown; ok: boolean; missing: boolean }> {
  if (!configured() || Date.now() < missingUntil) return { data: null, ok: false, missing: Date.now() < missingUntil };
  try {
    const { data, error } = await run(await clientFactory());
    if (error) {
      const missing = notProvisioned(error);
      if (missing) missingUntil = Date.now() + MISSING_RECHECK_MS;
      return { data: null, ok: false, missing };
    }
    return { data, ok: true, missing: false };
  } catch {
    return { data: null, ok: false, missing: false };
  }
}

/** Record a waiver for a film just paid. Never throws; true when the table holds it. */
export async function recordFilmWaiver(
  tokenId: string,
  userId: string,
  waiver: { kind: 'paid'; credits: number; ref: string } | { kind: 'free' },
): Promise<boolean> {
  const r = await call((c) =>
    c.rpc('record_film_waiver', {
      p_token: tokenId,
      p_user: userId,
      p_kind: waiver.kind,
      p_credits: waiver.kind === 'paid' ? Math.round(waiver.credits) : 0,
      p_ref: waiver.kind === 'paid' ? waiver.ref : null,
    }),
  );
  return r.ok;
}

/**
 * Spend the film's waiver for `userId`. 'paid' / 'free' = this call spent it: do not charge the stitch.
 * Anything else = charge as usual — except 'unavailable' (nothing could answer), where the caller falls back to its Redis
 * markers.
 */
export async function consumeFilmWaiver(tokenId: string, userId: string): Promise<WaiverAnswer> {
  const r = await call((c) => c.rpc('consume_film_waiver', { p_token: tokenId, p_user: userId }));
  if (r.ok) {
    return r.data === 'paid' || r.data === 'free' || r.data === 'spent' || r.data === 'void' || r.data === 'none' ? r.data : 'unavailable';
  }
  if (!r.missing) return 'unavailable';
  // No table: the ledger proves a paid film; request_idempotency makes the spend single-use.
  const net = await netDebitedForRef(userId, filmChargeRefFor(tokenId)).catch(() => null);
  if (net === null) return 'unavailable';
  if (net <= 0) return 'none';
  const chargedAt = await firstDebitAtForRef(userId, filmChargeRefFor(tokenId)).catch(() => null);
  if (!chargedAt || Date.now() - chargedAt >= CLAIM_WINDOW_SEC * 1000 - CLAIM_SKEW_MS) return 'unavailable';
  const claim = await storeClaim(userId, claimKey(tokenId), CLAIM_WINDOW_SEC);
  if (claim === 'claimed') return 'paid';
  return claim === 'held' ? 'spent' : 'unavailable';
}

/** Hand a spent waiver back — the stitch that spent it failed. Never throws. */
export async function restoreFilmWaiver(tokenId: string, userId: string): Promise<void> {
  const r = await call((c) => c.rpc('restore_film_waiver', { p_token: tokenId, p_user: userId }));
  if (r.ok) return;
  if (r.missing) await storeRelease(userId, claimKey(tokenId));
}
