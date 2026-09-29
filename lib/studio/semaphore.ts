/**
 * Account-wide concurrency gate for provider submissions (brief §4: "concurrency limit returns 400 → an
 * Upstash-based queue/semaphore and a `pending` status in the UI").
 *
 * Higgsfield limits requests that are queued OR processing at once (docs/concepts/rate-limits: "Maximum
 * number of concurrent requests (4) has been reached"). Every serverless instance shares one account, so the
 * gate lives in Redis: a sorted set whose members are job ids and whose scores are LEASE EXPIRY times. A job
 * that crashes without releasing frees its slot when the lease runs out, so the gate can never wedge shut.
 *
 * The acquire is one Lua script → atomic across instances (check-then-add from two instances would both win).
 * Without Redis the gate fails OPEN: the provider's own 400 still reaches the saga, which parks the job as
 * `pending` exactly as if the gate had said no.
 */

/** Minimal slice of @upstash/redis the gate needs — injectable for tests. */
export interface SemaphoreRedis {
  eval(script: string, keys: string[], args: Array<string | number>): Promise<unknown>;
  zrem(key: string, ...members: string[]): Promise<unknown>;
}

export interface Semaphore {
  /** Idempotent per member: re-acquiring your own slot refreshes its lease. */
  acquire(member: string, leaseMs: number): Promise<boolean>;
  release(member: string): Promise<void>;
}

export const ACQUIRE_LUA = `
local key, now, lease, limit, member = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if redis.call('ZSCORE', key, member) then
  redis.call('ZADD', key, now + lease, member)
  return 1
end
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now + lease, member)
  return 1
end
return 0
`;

export function concurrencyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number((env.HF_MAX_CONCURRENCY ?? '').trim());
  return Number.isInteger(n) && n > 0 ? n : 4;
}

export function createRedisSemaphore(
  redis: SemaphoreRedis | null,
  opts: { key?: string; limit?: number; now?: () => number } = {},
): Semaphore {
  const key = opts.key ?? 'studio:hf:inflight';
  const limit = opts.limit ?? concurrencyLimit();
  const now = opts.now ?? Date.now;
  return {
    async acquire(member, leaseMs) {
      if (!redis) return true;
      try {
        const r = await redis.eval(ACQUIRE_LUA, [key], [now(), Math.max(1_000, Math.round(leaseMs)), limit, member]);
        return Number(r) === 1;
      } catch {
        return true; // Redis down → fail open; the provider's own 400 still parks the job as pending
      }
    },
    async release(member) {
      if (!redis) return;
      try { await redis.zrem(key, member); } catch { /* the lease expires on its own */ }
    },
  };
}
