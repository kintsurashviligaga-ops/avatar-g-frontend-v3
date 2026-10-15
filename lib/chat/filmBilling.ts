/**
 * lib/chat/filmBilling.ts — a film's paid status in DURABLE storage (Video Core v1.0 final hardening, Phase 1).
 *
 * A film is charged ONCE, when it starts (lib/chat/filmComposite), at its quote. /api/video/assemble must then stitch it
 * without charging again — and that decision used to rest on Redis alone (lib/chat/filmStatusStore: a 6 h key with a
 * per-instance memory fallback). Redis down, expired, flushed or on another instance → no marker → the stitch was billed
 * a second time (defect 44). A waiver spent by a stitch that then crashed was never handed back either.
 *
 * Now:
 *   · THE PAYMENT is read from the credit ledger. The film's debit is taken under `filmChargeRef(token)`, so the ledger alone
 *     — durable, owner-bound, never expiring — says whether this user paid for this film and how much of it is still held
 *     (net of any dispatch refund).
 *   · THE WAIVERS (what the payment still covers: the stitch + one re-stitch for a paid film, the stitch for a free one) live
 *     in `film_billing` (proposal 20261014a). A stitch LEASES a waiver for longer than the route can run, SPENDS it only when
 *     it delivered a master, and hands it back otherwise; a crashed stitch's lease simply expires.
 *   · REDIS is a cache: consulted only when the durable table cannot answer (a database without 20261014a, a free film whose
 *     row could not be written, a film started before this change).
 *   · UNCERTAINTY STOPS. A ledger that cannot be read, or a film the ledger says is paid whose waiver state nothing can
 *     vouch for, gets a refusal with nothing charged and nothing rendered — never a second charge, never a paid call.
 */
import 'server-only';
import { hashPayload } from '@/lib/orchestrator/idempotency';
import { netDebitedForRef } from '@/lib/orchestrator/ledger';
import { consumeFilmBilling, getFilmPaid, getFilmStatus, isFilmPaidUpstream } from '@/lib/chat/filmStatusStore';

/** Longer than /api/video/assemble can run (maxDuration 600 s): a live stitch never loses its lease or its claim. */
export const FILM_WAIVER_LEASE_SEC = 660;

/** lib/chat/filmStatusStore deriveFilmTokenId: 'f' + 16 hex. */
export const FILM_TOKEN_RE = /^f[0-9a-f]{16}$/;

/** The ledger ref of a film's up-front charge. Its refunds are `${ref}:refund` / `${ref}:refund:dispatch` / `${ref}:refund:scene:<n>`. */
export function filmChargeRef(tokenId: string): string {
  return `filmpay:${tokenId}`;
}

export type FilmKind = 'paid' | 'free';
export type LeaseAnswer =
  | { state: 'leased'; kind: FilmKind }
  | { state: 'busy' | 'spent' | 'none' | 'unavailable' };

type RpcError = { code?: string; message?: string } | null;
interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
}

async function serviceRoleClient(): Promise<RpcClient> {
  const { createServiceRoleClient } = await import('@/lib/supabase/server');
  return createServiceRoleClient() as unknown as RpcClient;
}

let clientFactory: () => RpcClient | Promise<RpcClient> = serviceRoleClient;
const MISSING_RECHECK_MS = 10 * 60_000;
let missingUntil = 0;

/** Tests only: the client the store talks to. */
export function __setFilmBillingClientForTests(factory: (() => RpcClient) | null): void {
  clientFactory = factory ?? serviceRoleClient;
  missingUntil = 0;
}

function configured(): boolean {
  return Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** PostgREST's "no such function" (PGRST202) or Postgres' undefined function/table: 20261014a is not applied. */
function notProvisioned(error: RpcError): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || /could not find the function/i.test(error.message ?? '');
}

/** One RPC (each caller names its function literally, so the schema-drift ratchet can read it). */
async function call(rpc: (c: RpcClient) => PromiseLike<{ data: unknown; error: RpcError }>): Promise<{ ok: true; data: unknown } | { ok: false }> {
  if (!configured() || Date.now() < missingUntil) return { ok: false };
  try {
    const { data, error } = await rpc(await clientFactory());
    if (error) {
      if (notProvisioned(error)) missingUntil = Date.now() + MISSING_RECHECK_MS;
      return { ok: false };
    }
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

/** Written by the film start. 'exists' = a replay; the first record stands. A 'paid' row must match a ledger debit. */
export async function recordFilmBilling(input: { uid: string; tokenId: string; kind: FilmKind; credits: number; ref: string | null }): Promise<'recorded' | 'exists' | 'unavailable'> {
  if (!FILM_TOKEN_RE.test(input.tokenId)) return 'unavailable';
  const res = await call((c) => c.rpc('record_film_billing', {
    p_user: input.uid, p_token: input.tokenId, p_kind: input.kind, p_credits: Math.max(0, Math.round(input.credits)), p_ref: input.ref,
  }));
  if (!res.ok) return 'unavailable';
  return res.data === true ? 'recorded' : res.data === false ? 'exists' : 'unavailable';
}

export async function leaseFilmWaiver(uid: string, tokenId: string, leaseId: string, leaseSec = FILM_WAIVER_LEASE_SEC): Promise<LeaseAnswer> {
  if (!FILM_TOKEN_RE.test(tokenId)) return { state: 'unavailable' };
  const res = await call((c) => c.rpc('lease_film_waiver', { p_user: uid, p_token: tokenId, p_lease_id: leaseId, p_lease_sec: leaseSec }));
  if (!res.ok) return { state: 'unavailable' };
  if (res.data === 'leased:paid') return { state: 'leased', kind: 'paid' };
  if (res.data === 'leased:free') return { state: 'leased', kind: 'free' };
  if (res.data === 'busy' || res.data === 'spent' || res.data === 'none') return { state: res.data };
  return { state: 'unavailable' };
}

/** Spend the leased waiver (delivered) or hand it back. false = the lease is no longer this caller's (or no store). */
export async function settleFilmWaiver(uid: string, tokenId: string, leaseId: string, delivered: boolean): Promise<boolean> {
  const res = await call((c) => c.rpc('settle_film_waiver', { p_user: uid, p_token: tokenId, p_lease_id: leaseId, p_delivered: delivered }));
  return res.ok && res.data === true;
}

// ─── R3-A: a scene Google accepted and then failed, given back once on the server's own word ───────────────────────

/** A queued Veo scene of a paid film as the start records it: the operation it dispatched and its share of the price. */
export interface FilmSceneShare { ordinal: number; operation: string; credits: number }

/** Written by the film start for a PAID film (its film_billing row must exist). The shares never exceed what it holds. */
export async function recordFilmScenes(uid: string, tokenId: string, scenes: FilmSceneShare[]): Promise<'recorded' | 'unavailable'> {
  if (!FILM_TOKEN_RE.test(tokenId) || scenes.length === 0) return 'unavailable';
  const res = await call((c) => c.rpc('record_film_scenes', { p_user: uid, p_token: tokenId, p_scenes: scenes }));
  return res.ok && typeof res.data === 'number' ? 'recorded' : 'unavailable';
}

/** The film's scenes nobody has settled yet, as the START recorded them; null when the store cannot answer. */
export async function pendingFilmScenes(uid: string, tokenId: string): Promise<Array<{ ordinal: number; operation: string }> | null> {
  if (!FILM_TOKEN_RE.test(tokenId)) return null;
  const res = await call((c) => c.rpc('pending_film_scenes', { p_user: uid, p_token: tokenId }));
  if (!res.ok || !Array.isArray(res.data)) return null;
  return (res.data as Array<{ ordinal?: unknown; operation?: unknown }>)
    .filter((r) => Number.isInteger(r?.ordinal) && typeof r?.operation === 'string')
    .map((r) => ({ ordinal: r.ordinal as number, operation: r.operation as string }));
}

/** Settle one scene, once: `failed` gives its share back (capped by the film's net debit). Credits returned; null = no store. */
export async function settleFilmScene(uid: string, tokenId: string, ordinal: number, failed: boolean): Promise<number | null> {
  if (!FILM_TOKEN_RE.test(tokenId)) return null;
  const res = await call((c) => c.rpc('settle_film_scene', { p_user: uid, p_token: tokenId, p_ordinal: ordinal, p_failed: failed }));
  return res.ok && typeof res.data === 'number' ? res.data : null;
}

// ─── The film START: one approved press, at most one charge ────────────────────────────────────────────────────────

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A press's own id holds for an hour (a client retrying its own timeout); a key derived from the request covers the start. */
export const FILM_START_WINDOW_SEC = { request: 3600, derived: 330 } as const;

/**
 * The duplicate key of a film start. The studio sends `metadata.filmRequestId` — one id per Generate press, reused by any
 * retry of that press — so a replayed or double-sent start is the same key. A caller without one (an older client, a direct
 * API call) gets a key derived from what the film would be: the same brief, board, length and tier from the same session
 * inside the start's own window is the same start.
 */
export async function filmStartKey(
  metadata: Record<string, unknown> | undefined,
  film: { sessionId: string; message: string; totalSec: number; tier: string | null; musicVideo: boolean },
): Promise<{ key: string; windowSec: number }> {
  const rid = typeof metadata?.filmRequestId === 'string' ? metadata.filmRequestId.trim() : '';
  if (REQUEST_ID_RE.test(rid)) return { key: `film-start:${rid.toLowerCase()}`, windowSec: FILM_START_WINDOW_SEC.request };
  const approval = (metadata?.storyboardApproval ?? null) as { revision?: unknown; fingerprint?: unknown } | null;
  const h = await hashPayload({
    s: film.sessionId, m: film.message, t: film.totalSec, q: film.tier, mv: film.musicVideo,
    a: approval ? [approval.revision ?? null, approval.fingerprint ?? null] : null,
  });
  return { key: `film-start:h:${h}`, windowSec: FILM_START_WINDOW_SEC.derived };
}

// ─── The one decision /api/video/assemble takes for a film ─────────────────────────────────────────────────────────

export type FilmWaiverDecision =
  /** The film's payment covers this stitch: charge nothing. `leaseId` must be settled when the attempt ends. */
  | { action: 'waive'; via: 'durable'; leaseId: string; kind: FilmKind }
  /** The same, on the Redis/memory cache's word (no durable record); handed back with restoreFilmBilling on failure. */
  | { action: 'waive'; via: 'cache' }
  /** No payment covers this stitch (none was taken, or every covered stitch was delivered): bill it as before. */
  | { action: 'bill' }
  /** Another stitch of this film holds its waiver right now: refuse (409); nothing charged. */
  | { action: 'busy' }
  /** The payment state cannot be established: refuse (503); nothing charged, nothing rendered. */
  | { action: 'stop'; reason: 'ledger_unreadable' | 'waiver_unknown' };

/** What the Redis/memory cache can say: it waived (and spent) one, it proves every waiver was delivered, or nothing. */
export type CacheWaiver = 'waived' | 'spent' | 'none';

export interface FilmWaiverDeps {
  lease: typeof leaseFilmWaiver;
  record: typeof recordFilmBilling;
  /** Credits still held under a ref (debits − refunds), null when the ledger cannot be read (ledger.netDebitedForRef). */
  held: (uid: string, ref: string) => Promise<number | null>;
  cache: (uid: string, tokenId: string) => Promise<CacheWaiver>;
}

async function defaultHeld(uid: string, ref: string): Promise<number | null> {
  return netDebitedForRef(uid, ref);
}

/** The pre-durable logic, unchanged: the status record's / payment marker's waiver, owner-bound and spent on use. */
async function defaultCache(uid: string, tokenId: string): Promise<CacheWaiver> {
  const [prior, paid] = await Promise.all([getFilmStatus(tokenId), getFilmPaid(tokenId)]);
  if (isFilmPaidUpstream(prior, paid, uid)) {
    await consumeFilmBilling(tokenId);
    return 'waived';
  }
  // A paid film's two stitches are both on record: the payment marker spent AND a master delivered to this payer whose
  // re-stitch waiver is spent too. Anything less is not proof that the payment is used up.
  if (paid && paid.uid === uid && paid.consumed === true && prior?.masterUrl && prior.payerUid === uid && prior.billingConsumed === true) {
    return 'spent';
  }
  return 'none';
}

const DEFAULT_DEPS: FilmWaiverDeps = { lease: leaseFilmWaiver, record: recordFilmBilling, held: defaultHeld, cache: defaultCache };

function fromLease(a: LeaseAnswer, leaseId: string): FilmWaiverDecision | null {
  if (a.state === 'leased') return { action: 'waive', via: 'durable', leaseId, kind: a.kind };
  if (a.state === 'busy') return { action: 'busy' };
  if (a.state === 'spent') return { action: 'bill' };
  return null;
}

/**
 * Decide how /api/video/assemble bills a stitch of the film `tokenId` for the signed-in `uid`.
 *
 *   1. The durable table answers first (leased / busy / spent).
 *   2. No row: the LEDGER is asked whether this user paid for this film. Paid → the row is written from the ledger's own
 *      numbers and leased (a film whose row was lost at start heals here). Unreadable → stop.
 *   3. Still nothing durable: the Redis/memory cache, exactly as before this change — but a film the ledger says is PAID is
 *      never billed on the cache's silence: only proof that both its stitches were delivered bills it; anything less stops.
 */
export async function decideFilmWaiver(uid: string, tokenId: string, leaseId: string, deps: FilmWaiverDeps = DEFAULT_DEPS): Promise<FilmWaiverDecision> {
  let lease = await deps.lease(uid, tokenId, leaseId);
  const first = fromLease(lease, leaseId);
  if (first) return first;

  const ref = filmChargeRef(tokenId);
  const held = FILM_TOKEN_RE.test(tokenId) ? await deps.held(uid, ref) : 0;
  if (held === null) return { action: 'stop', reason: 'ledger_unreadable' };

  if (held > 0 && lease.state === 'none') {
    const rec = await deps.record({ uid, tokenId, kind: 'paid', credits: held, ref });
    if (rec !== 'unavailable') {
      lease = await deps.lease(uid, tokenId, leaseId);
      const healed = fromLease(lease, leaseId);
      if (healed) return healed;
    }
  }

  // A cache that throws (Redis timing out mid-call) knows nothing: it cannot waive, and it cannot prove a payment is used up.
  const cached = await deps.cache(uid, tokenId).catch((): CacheWaiver => 'none');
  if (cached === 'waived') return { action: 'waive', via: 'cache' };
  if (held > 0) return cached === 'spent' ? { action: 'bill' } : { action: 'stop', reason: 'waiver_unknown' };
  return { action: 'bill' };
}
