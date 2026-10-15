/**
 * Idempotency + token-lock layer (server-side only).
 *
 * Uses the already-installed @upstash/redis REST client. Without Redis the
 * duplicate guard (claim / release) asks the shared database instead
 * (./idempotencyStore, R2); every other helper degrades to a safe no-op, so
 * the app keeps working in local/dev without either.
 *
 * Three guarantees, matching Modules 3 + 6 of the architecture brief:
 *   1. Idempotency — block duplicate multi-click submissions inside a
 *      60-second window keyed by a hash of the request payload.
 *   2. Token lock — reserve a user's credits at pipeline start; commit on
 *      success, release on Saga rollback so the user is credited instantly.
 *   3. Circuit breaker — track consecutive provider failures and trip a
 *      short cooldown so a downed provider isn't hammered.
 */

import 'server-only';
import type { Redis } from '@upstash/redis';
import { createUpstashRedis } from '@/lib/platform/upstash';
import { upstashRestEnv } from '@/lib/platform/upstashEnv';
import { storeClaim, storeRelease } from './idempotencyStore';

let client: Redis | null = null;
let resolved = false;

function redis(): Redis | null {
  if (resolved) return client;
  resolved = true;
  const env = upstashRestEnv();
  if (env) {
    client = createUpstashRedis(env.url, env.token);
  }
  return client;
}

/** Stable hash of an arbitrary payload — used as the idempotency key. */
export async function hashPayload(payload: unknown): Promise<string> {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  // Prefer WebCrypto SHA-256, but NEVER let a crypto fault propagate: a thrown
  // DOMException here would reject every caller. Any failure (missing algo,
  // locked subtle in an insecure context, malformed input) degrades silently to
  // the deterministic FNV-1a fallback below — the idempotency key stays stable.
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    } catch {
      /* fall through to FNV-1a */
    }
  }
  // Fallback hash (FNV-1a) for runtimes without WebCrypto.
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

/**
 * Returns true the FIRST time a given key is seen within `windowSec`,
 * false on subsequent duplicate submissions. Redis answers when it is
 * configured and reachable; otherwise the shared database does (R2,
 * ./idempotencyStore). Fails open — allows — only when neither can answer.
 */
export async function claimIdempotencyKey(userId: string, key: string, windowSec = 60): Promise<boolean> {
  const r = redis();
  if (r) {
    const k = `idem:${userId}:${key}`;
    try {
      // SET NX EX — atomic "first writer wins" with TTL.
      const res = await r.set(k, '1', { nx: true, ex: windowSec });
      return res === 'OK';
    } catch {
      // Live-but-erroring Redis must never crash the route — ask the database instead.
    }
  }
  return (await storeClaim(userId, key, windowSec)) !== 'held';
}

/**
 * The duplicate guard for a step that TAKES MONEY (a paid film start): the shared DATABASE answers first — durable and the
 * same row for every instance — and Redis only when the database cannot. Unlike claimIdempotencyKey it says when neither
 * could answer ('unavailable'), so the caller can refuse instead of charging blind.
 */
export async function claimPaidStartKey(userId: string, key: string, windowSec: number): Promise<'claimed' | 'held' | 'unavailable'> {
  const stored = await storeClaim(userId, key, windowSec);
  if (stored !== 'unavailable') return stored;
  const r = redis();
  if (!r) return 'unavailable';
  try {
    const res = await r.set(`idem:${userId}:${key}`, '1', { nx: true, ex: Math.max(1, Math.round(windowSec)) });
    return res === 'OK' ? 'claimed' : 'held';
  } catch {
    return 'unavailable';
  }
}

/**
 * Release a previously-claimed idempotency key (PHASE 52 TASK 4).
 *
 * `claimIdempotencyKey` reserves the key for `windowSec` to swallow rapid
 * double-clicks. But when the underlying pipeline FAILS, that reservation
 * would otherwise lock the user out of an honest retry for the full window —
 * a paid render that errored once should be immediately re-runnable. The
 * assemble Saga calls this on rollback so the key is freed the instant the
 * job fails. Frees the key in Redis and in the database store alike.
 */
export async function releaseIdempotencyKey(userId: string, key: string): Promise<void> {
  const r = redis();
  if (r) {
    try {
      await r.del(`idem:${userId}:${key}`);
    } catch {
      // Fail open — a stuck key merely expires on its own TTL.
    }
  }
  await storeRelease(userId, key);
}

// ─── Token lock (Saga-aware) ──────────────────────────────────────────────────

export interface TokenLock {
  userId: string;
  amount: number;
  lockId: string;
}

/** Reserve `amount` credits for the duration of a pipeline run. */
export async function lockTokens(userId: string, amount: number, ttlSec = 600): Promise<TokenLock | null> {
  const r = redis();
  const lockId = `lock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  if (!r) return { userId, amount, lockId }; // optimistic when no Redis
  try {
    await r.set(`toklock:${userId}:${lockId}`, String(amount), { ex: ttlSec });
  } catch {
    // Fail open — the durable ledger debit is the real guard.
  }
  return { userId, amount, lockId };
}

/** Commit a lock — the pipeline succeeded; the reservation is consumed. */
export async function commitTokenLock(lock: TokenLock): Promise<void> {
  const r = redis();
  if (!r) return;
  try { await r.del(`toklock:${lock.userId}:${lock.lockId}`); } catch { /* fail open */ }
}

/** Release a lock — the Saga rolled back; credit the user instantly. */
export async function releaseTokenLock(lock: TokenLock): Promise<void> {
  const r = redis();
  if (!r) return;
  try { await r.del(`toklock:${lock.userId}:${lock.lockId}`); } catch { /* fail open */ }
}

// ─── Circuit breaker ──────────────────────────────────────────────────────────

/**
 * Record one provider outcome. After `threshold` consecutive failures the
 * breaker trips for `cooldownSec`. `isProviderTripped` lets agents skip a
 * call (and fail fast) while the breaker is open.
 */
export async function recordProviderResult(provider: string, ok: boolean, threshold = 3, cooldownSec = 30): Promise<void> {
  const r = redis();
  if (!r) return;
  const failKey = `cb:fails:${provider}`;
  try {
    if (ok) { await r.del(failKey); return; }
    const fails = await r.incr(failKey);
    await r.expire(failKey, cooldownSec);
    if (fails >= threshold) {
      await r.set(`cb:open:${provider}`, '1', { ex: cooldownSec });
    }
  } catch { /* fail open — never block generation on breaker bookkeeping */ }
}

export async function isProviderTripped(provider: string): Promise<boolean> {
  const r = redis();
  if (!r) return false;
  try {
    return (await r.get(`cb:open:${provider}`)) === '1';
  } catch {
    return false; // fail open
  }
}

/** Whether the Redis-backed guarantees are actually active. */
export function idempotencyEnabled(): boolean {
  return redis() !== null;
}
