/**
 * lib/chat/filmStatusStore.ts
 * ===========================
 * PHASE 47 §1 — Storage-backed unified status tracker for the 30-second film.
 *
 * Before this module the only way to learn whether a film's master had been
 * stitched was to keep the originating browser tab alive and watch its in-memory
 * poll loop. If the user reloaded, switched device, or the tab was evicted, the
 * assembled master URL was lost even though the render had genuinely completed.
 *
 * This store persists one compact `FilmStatusRecord` per film, keyed by a short
 * stable token id (NOT the 18MB union token), so any client — the original tab,
 * a reload, or a second device — can poll `/api/video/status/[tokenId]` and
 * recover the unified state, including the final hosted master URL once the
 * editor finishes.
 *
 * Backing store: the same Upstash Redis REST client the idempotency layer uses,
 * with a transparent in-process fallback Map so the API still returns a coherent
 * record in local/dev where Redis is unconfigured. Every async helper FAILS OPEN
 * — a Redis outage degrades tracking, never the render itself.
 *
 * The pure helpers (`deriveFilmTokenId`, `buildFilmSnapshot`, `mergeMaster`) hold
 * NO storage dependency and are exhaustively unit-tested.
 */

import 'server-only';
import { Redis } from '@upstash/redis';

// ─── Pure model (no I/O — unit-testable in isolation) ────────────────────────

export type FilmStatusPhase =
  | 'rendering'   // clips still in flight
  | 'ready'       // every clip landed + audio terminal; editor can stitch
  | 'assembling'  // the stitch has been dispatched
  | 'assembled'   // the hosted master URL is available
  | 'failed'      // a leg failed terminally (surviving clips are NOT discarded)
  | 'unknown';    // no record persisted yet

export type FilmStatusClipState = 'pending' | 'queued' | 'succeeded' | 'failed' | 'skipped';

export interface FilmStatusClip {
  ordinal: number;
  status: FilmStatusClipState;
  /** Whether this clip leg has a resolved playable URL (the URL itself is NOT
   *  stored — clip blobs are multi-MB data: URLs; only the master is persisted). */
  hasUrl: boolean;
}

/**
 * Lean Supervisor-QA summary persisted alongside the master so a reload / second
 * device sees the same quality verdict. Mirrors lib/orchestrator/masterQa's
 * QaReport but flattens `issues` to their codes — the store stays dependency-free.
 */
export interface FilmQaSummary {
  pass: boolean;
  score: number;
  grade: string;
  issues: string[];
}

export interface FilmStatusRecord {
  tokenId: string;
  phase: FilmStatusPhase;
  clips: FilmStatusClip[];
  audioReady: boolean;
  /** The hosted, stitched 30-second master once the editor finishes; else null. */
  masterUrl: string | null;
  /** Supervisor QA verdict on the assembled master, once graded; else null. */
  qa?: FilmQaSummary | null;
  /** SECURITY (billing-skip owner-binding): the uid that actually PAID for this master.
   *  A downstream /assemble waives its charge only when the caller's uid === payerUid, so a
   *  client cannot replay another job's (or another user's) token to render for free. */
  payerUid?: string | null;
  /** SECURITY (single-use billing skip): true once this token's ONE assemble-waiver has been
   *  spent. A paid token maps 1:1 to one downstream assemble (the ad's overlay pass, or a film's
   *  lip-sync re-stitch); after that the waiver is consumed and further assembles bill normally. */
  billingConsumed?: boolean;
  updatedAt: number;
  error?: string | null;
}

/**
 * Derive a short, stable, collision-resistant token id from the film's identity
 * tuple (session + creation time + continuity seed). Deliberately does NOT hash
 * the giant union token — this id is cheap to compute on every poll and safe to
 * place in a URL path. Identical films map to the identical id (idempotent).
 */
export function deriveFilmTokenId(parts: { sessionId: string; createdAt: number; seed: number }): string {
  const basis = `${parts.sessionId}:${parts.createdAt}:${parts.seed}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Second independent FNV pass over the reversed basis widens the space so two
  // near-identical tuples can't alias on a single 32-bit digest.
  let g = 0x811c9dc5;
  for (let i = basis.length - 1; i >= 0; i--) {
    g ^= basis.charCodeAt(i);
    g = Math.imul(g, 0x01000193);
  }
  return `f${(h >>> 0).toString(16).padStart(8, '0')}${(g >>> 0).toString(16).padStart(8, '0')}`;
}

export interface FilmSnapshotInput {
  tokenId: string;
  clips: { ordinal: number; status: FilmStatusClipState; url: string | null }[];
  audioStatus: 'pending' | 'succeeded' | 'failed' | 'skipped';
  readyToStitch: boolean;
  filmStatus: 'processing' | 'succeeded' | 'failed';
  masterUrl?: string | null;
  now?: number;
}

/**
 * Fold a poll tick's union result into a persistable status record. Pure: phase
 * precedence is assembled → failed → ready → rendering, so a master that already
 * landed is never demoted by a later, slower poll.
 */
export function buildFilmSnapshot(input: FilmSnapshotInput): FilmStatusRecord {
  const masterUrl = input.masterUrl ?? null;
  const phase: FilmStatusPhase = masterUrl
    ? 'assembled'
    : input.filmStatus === 'failed'
      ? 'failed'
      : input.readyToStitch
        ? 'ready'
        : 'rendering';
  return {
    tokenId: input.tokenId,
    phase,
    clips: input.clips
      .map((c) => ({ ordinal: c.ordinal, status: c.status, hasUrl: typeof c.url === 'string' && c.url.length > 0 }))
      .sort((a, b) => a.ordinal - b.ordinal),
    audioReady: input.audioStatus === 'succeeded',
    masterUrl,
    updatedAt: input.now ?? Date.now(),
    error: input.filmStatus === 'failed' ? 'one or more legs failed terminally' : null,
  };
}

/**
 * Pure merge: stamp a finished master onto an existing record (or synthesize a
 * minimal one), promoting the phase to 'assembled'. Used by the assemble route
 * so a completed stitch is recoverable by any client.
 */
export function mergeMaster(prev: FilmStatusRecord | null, tokenId: string, masterUrl: string, qa: FilmQaSummary | null = null, now = Date.now(), payerUid: string | null = null): FilmStatusRecord {
  if (!prev) {
    return { tokenId, phase: 'assembled', clips: [], audioReady: false, masterUrl, qa, payerUid, billingConsumed: false, updatedAt: now, error: null };
  }
  // Preserve the ORIGINAL payer + consumed flag on a re-stamp: a null uid at a later stamp (e.g. a
  // server-side re-stitch) must NOT erase who paid, and a spent waiver must stay spent.
  return { ...prev, phase: 'assembled', masterUrl, qa: qa ?? prev.qa ?? null, payerUid: payerUid ?? prev.payerUid ?? null, billingConsumed: prev.billingConsumed === true, updatedAt: now, error: null };
}

// ─── Backing store (Redis REST, fail-open, in-process fallback) ──────────────

const KEY_PREFIX = 'film:status:';
const TTL_SEC = 60 * 60; // 1 hour — comfortably outlives a render + a reload

let client: Redis | null = null;
let resolved = false;

function redis(): Redis | null {
  if (resolved) return client;
  resolved = true;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    client = new Redis({ url, token });
  }
  return client;
}

/** Process-local fallback so the status endpoint stays coherent without Redis
 *  (single-instance / dev). In serverless prod, Redis is the durable layer. */
const memory = new Map<string, FilmStatusRecord>();

/** Whether the durable (Redis) tracker is actually active. */
export function filmStatusPersistenceEnabled(): boolean {
  return redis() !== null;
}

/** Persist (overwrite) a film status record. Fails open. */
export async function putFilmStatus(record: FilmStatusRecord): Promise<void> {
  memory.set(record.tokenId, record);
  const r = redis();
  if (!r) return;
  try {
    await r.set(`${KEY_PREFIX}${record.tokenId}`, JSON.stringify(record), { ex: TTL_SEC });
  } catch {
    // Live-but-erroring Redis must never crash the pipeline — the in-memory
    // copy still answers reads from the same instance.
  }
}

/** Read a film status record; null when none has been persisted yet. */
export async function getFilmStatus(tokenId: string): Promise<FilmStatusRecord | null> {
  const r = redis();
  if (r) {
    try {
      const raw = await r.get(`${KEY_PREFIX}${tokenId}`);
      if (raw) {
        const parsed = typeof raw === 'string' ? (JSON.parse(raw) as FilmStatusRecord) : (raw as FilmStatusRecord);
        if (parsed && typeof parsed === 'object' && parsed.tokenId === tokenId) {
          memory.set(tokenId, parsed);
          return parsed;
        }
      }
    } catch {
      // Fall through to the in-memory copy.
    }
  }
  return memory.get(tokenId) ?? null;
}

/** Promote a record to 'assembling' when the stitch is dispatched. Fails open. */
export async function recordFilmAssembling(tokenId: string): Promise<void> {
  const prev = await getFilmStatus(tokenId);
  const next: FilmStatusRecord = prev
    ? { ...prev, phase: prev.phase === 'assembled' ? 'assembled' : 'assembling', updatedAt: Date.now() }
    : { tokenId, phase: 'assembling', clips: [], audioReady: false, masterUrl: null, updatedAt: Date.now(), error: null };
  await putFilmStatus(next);
}

/** Stamp the finished hosted master onto the record. Fails open. `payerUid` binds the master to
 *  the paying user so a downstream /assemble billing-skip can verify ownership (see consumeFilmBilling). */
export async function recordFilmMaster(tokenId: string, masterUrl: string, qa: FilmQaSummary | null = null, payerUid: string | null = null): Promise<void> {
  const prev = await getFilmStatus(tokenId);
  await putFilmStatus(mergeMaster(prev, tokenId, masterUrl, qa, undefined, payerUid));
}

/** Spend a token's ONE assemble-waiver (single-use billing skip). Idempotent; fails open. After
 *  this, getFilmStatus(...).billingConsumed === true, so the token can no longer waive a charge. */
export async function consumeFilmBilling(tokenId: string): Promise<void> {
  const prev = await getFilmStatus(tokenId);
  if (!prev || prev.billingConsumed === true) return;
  await putFilmStatus({ ...prev, billingConsumed: true, updatedAt: Date.now() });
}

/** Mark the film failed with a short reason. Fails open. */
export async function recordFilmFailed(tokenId: string, error: string): Promise<void> {
  const prev = await getFilmStatus(tokenId);
  const next: FilmStatusRecord = prev
    ? { ...prev, phase: prev.phase === 'assembled' ? 'assembled' : 'failed', error, updatedAt: Date.now() }
    : { tokenId, phase: 'failed', clips: [], audioReady: false, masterUrl: null, updatedAt: Date.now(), error };
  await putFilmStatus(next);
}
