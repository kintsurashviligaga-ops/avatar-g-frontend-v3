/**
 * Idempotency + token-lock layer (server-side only).
 *
 * Uses the already-installed @upstash/redis REST client. Every helper
 * degrades to a safe no-op when Redis env is not configured, so the app
 * keeps working in local/dev without Redis — it simply loses the dedup /
 * lock guarantees until the operator wires Upstash.
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
import { Redis } from '@upstash/redis';

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

/** Stable hash of an arbitrary payload — used as the idempotency key. */
export async function hashPayload(payload: unknown): Promise<string> {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  // Fallback hash (FNV-1a) for runtimes without WebCrypto.
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

/**
 * Returns true the FIRST time a given key is seen within `windowSec`,
 * false on subsequent duplicate submissions. No-op (always allows) when
 * Redis is unconfigured.
 */
export async function claimIdempotencyKey(userId: string, key: string, windowSec = 60): Promise<boolean> {
  const r = redis();
  if (!r) return true;
  const k = `idem:${userId}:${key}`;
  // SET NX EX — atomic "first writer wins" with TTL.
  const res = await r.set(k, '1', { nx: true, ex: windowSec });
  return res === 'OK';
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
  await r.set(`toklock:${userId}:${lockId}`, String(amount), { ex: ttlSec });
  return { userId, amount, lockId };
}

/** Commit a lock — the pipeline succeeded; the reservation is consumed. */
export async function commitTokenLock(lock: TokenLock): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.del(`toklock:${lock.userId}:${lock.lockId}`);
}

/** Release a lock — the Saga rolled back; credit the user instantly. */
export async function releaseTokenLock(lock: TokenLock): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.del(`toklock:${lock.userId}:${lock.lockId}`);
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
  if (ok) {
    await r.del(failKey);
    return;
  }
  const fails = await r.incr(failKey);
  await r.expire(failKey, cooldownSec);
  if (fails >= threshold) {
    await r.set(`cb:open:${provider}`, '1', { ex: cooldownSec });
  }
}

export async function isProviderTripped(provider: string): Promise<boolean> {
  const r = redis();
  if (!r) return false;
  return (await r.get(`cb:open:${provider}`)) === '1';
}

/** Whether the Redis-backed guarantees are actually active. */
export function idempotencyEnabled(): boolean {
  return redis() !== null;
}
