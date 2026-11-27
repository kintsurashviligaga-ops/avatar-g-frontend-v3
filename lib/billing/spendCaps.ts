/**
 * lib/billing/spendCaps.ts — the HARD caps that stop a runaway burst of paid calls (Phase 8.21, "Bill-Shock").
 *
 * ⚠️ WHY THE ENVELOPE IS NOT ENOUGH. BillingGuard (DAILY_COST_LIMIT) reads spend through a 30 s cache and books a call
 * only AFTER it returned. A burst of 1,000 submits in one minute all see the same old total, and none of them has been
 * booked yet, so all of them pass. Only Veo has an atomic ceiling (lib/veo/dailyCap, VEO_DAILY_LIMIT_USD). Omni, Lyria,
 * images, the avatar and every other service had none. This module adds three caps, all checked inside guardedCall,
 * so every call site that is already behind the budget gets them with no change of its own:
 *
 *   1. GLOBAL_DAILY_LIMIT_USD — every paid call on this deployment, all services, per UTC day. The call's estimate is
 *      RESERVED before it runs, in one Redis script (read, compare, add), so two calls racing for the last dollar
 *      cannot both pass. A call that failed gives its reservation back; a call that succeeded is settled to its real
 *      cost. When the cap is on and neither Redis nor the ledger can be read, the call is REFUSED (fails closed).
 *   2. USER_MAX_CONCURRENT_JOBS — how many paid jobs one account may have running at once, across ALL services. Each
 *      start takes a lease. A quick call (chat, image) gives it back when it returns; a long job (video, avatar, 3D,
 *      montage, dubbing, remix) keeps it for LEASE_MS[service], the time such a job normally needs, because the job
 *      keeps running after the submit returned.
 *   3. USER_DAILY_PAID_STARTS — how many paid starts one account may make per UTC day, all services together.
 *
 * ⚠️ ALL THREE ARE OFF UNTIL THE OWNER NAMES THE FIGURES. Unset, empty, 0 or not a number = not enforced, nothing is
 * read or written, and guardedCall behaves byte for byte as before. No default figure lives in code.
 *
 * Without Redis the per-user caps count in this instance's memory (a bounded fallback, never "unlimited"); the global
 * cap falls back to the ledger, then refuses.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { createUpstashRedis } from '@/lib/platform/upstash';
import { upstashRestEnv } from '@/lib/platform/upstashEnv';
import type { ServiceType } from '@/lib/services/billing/costModel';

type Env = Record<string, string | undefined>;

const MICRO = 1_000_000;
const DAY_TTL_SEC = 2 * 86_400;

/** How long a start holds its concurrency lease when the job outlives the submit (ms). Quick services release at once. */
export const LEASE_MS: Readonly<Record<ServiceType, number>> = {
  chat: 2 * 60_000,
  image: 3 * 60_000,
  presentation: 5 * 60_000,
  music: 5 * 60_000,
  video: 15 * 60_000,
  avatar: 12 * 60_000,
  remix: 15 * 60_000,
  montage: 15 * 60_000,
  dubbing: 15 * 60_000,
  model3d: 15 * 60_000,
};

/** Services whose job keeps running (and billing) after the submit call returned: the lease is NOT given back on return. */
export const LONG_JOB_SERVICES: ReadonlySet<ServiceType> = new Set<ServiceType>(['video', 'avatar', 'remix', 'montage', 'dubbing', 'model3d']);

function positive(raw: string | undefined): number | null {
  const v = Number((raw ?? '').trim());
  return (raw ?? '').trim() !== '' && Number.isFinite(v) && v > 0 ? v : null;
}

export function globalDailyLimitUsd(env: Env = process.env): number | null {
  return positive(env.GLOBAL_DAILY_LIMIT_USD);
}
export function userMaxConcurrentJobs(env: Env = process.env): number | null {
  const v = positive(env.USER_MAX_CONCURRENT_JOBS);
  return v === null ? null : Math.floor(v);
}
export function userDailyPaidStarts(env: Env = process.env): number | null {
  const v = positive(env.USER_DAILY_PAID_STARTS);
  return v === null ? null : Math.floor(v);
}

export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const toMicro = (usd: number): number => (Number.isFinite(usd) && usd > 0 ? Math.ceil(usd * MICRO - 1e-6) : 0);
const round2 = (usd: number): number => Math.round(usd * 100) / 100;

// ── Store (injectable for tests) ───────────────────────────────────────────────────────────────────────────────────

/** Every method returns null (never throws) when the store cannot be reached. */
export interface CapStore {
  /** Seed a day counter only if it does not exist yet. */
  seedIfAbsent(key: string, value: number, ttlSec: number): Promise<boolean | null>;
  /** Add `add` to `key` unless the result would pass `cap`. */
  addCapped(key: string, add: number, cap: number, ttlSec: number): Promise<{ ok: boolean; total: number } | null>;
  /** Add a signed delta (never below zero). */
  adjust(key: string, delta: number, ttlSec: number): Promise<number | null>;
  /** Take a lease in a set of leases: drops expired ones, refuses at `max`. */
  lease(key: string, member: string, expiresAtMs: number, nowMs: number, max: number): Promise<{ ok: boolean; held: number } | null>;
  unlease(key: string, member: string): Promise<boolean | null>;
}

const ADD_CAPPED = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local add = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
if cur + add > cap then return {0, cur} end
local total = redis.call('INCRBY', KEYS[1], add)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return {1, total}
`;

const ADJUST = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local nxt = cur + tonumber(ARGV[1])
if nxt < 0 then nxt = 0 end
redis.call('SET', KEYS[1], nxt, 'EX', tonumber(ARGV[2]))
return nxt
`;

const LEASE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[3]))
local held = redis.call('ZCARD', KEYS[1])
if held >= tonumber(ARGV[4]) then return {0, held} end
redis.call('ZADD', KEYS[1], tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], 24 * 3600 * 1000)
return {1, held + 1}
`;

let redisClient: ReturnType<typeof createUpstashRedis> | null | undefined;
function redis(): ReturnType<typeof createUpstashRedis> | null {
  if (redisClient !== undefined) return redisClient;
  const env = upstashRestEnv();
  redisClient = env ? createUpstashRedis(env.url, env.token) : null;
  return redisClient;
}

const pair = (out: unknown): { ok: boolean; n: number } | null => {
  if (!Array.isArray(out) || out.length < 2) return null;
  const n = Number(out[1]);
  return Number.isFinite(n) ? { ok: Number(out[0]) === 1, n } : null;
};

export const redisCapStore: CapStore = {
  async seedIfAbsent(key, value, ttlSec) {
    const r = redis();
    if (!r) return null;
    try { return (await r.set(key, Math.max(0, Math.trunc(value)), { nx: true, ex: ttlSec })) === 'OK'; } catch { return null; }
  },
  async addCapped(key, add, cap, ttlSec) {
    const r = redis();
    if (!r) return null;
    try {
      const p = pair(await r.eval(ADD_CAPPED, [key], [String(add), String(cap), String(ttlSec)]));
      return p ? { ok: p.ok, total: p.n } : null;
    } catch { return null; }
  },
  async adjust(key, delta, ttlSec) {
    const r = redis();
    if (!r) return null;
    try {
      const n = Number(await r.eval(ADJUST, [key], [String(Math.trunc(delta)), String(ttlSec)]));
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  },
  async lease(key, member, expiresAtMs, nowMs, max) {
    const r = redis();
    if (!r) return null;
    try {
      const p = pair(await r.eval(LEASE, [key], [member, String(expiresAtMs), String(nowMs), String(max)]));
      return p ? { ok: p.ok, held: p.n } : null;
    } catch { return null; }
  },
  async unlease(key, member) {
    const r = redis();
    if (!r) return null;
    try { await r.zrem(key, member); return true; } catch { return null; }
  },
};

/** This instance's own counters: the fallback when Redis is unreachable, so a per-user cap never becomes "unlimited". */
export function memoryCapStore(): CapStore {
  const nums = new Map<string, number>();
  const sets = new Map<string, Map<string, number>>();
  return {
    async seedIfAbsent(key, value) { if (nums.has(key)) return false; nums.set(key, Math.max(0, value)); return true; },
    async addCapped(key, add, cap) {
      const cur = nums.get(key) ?? 0;
      if (cur + add > cap) return { ok: false, total: cur };
      nums.set(key, cur + add);
      return { ok: true, total: cur + add };
    },
    async adjust(key, delta) { const n = Math.max(0, (nums.get(key) ?? 0) + delta); nums.set(key, n); return n; },
    async lease(key, member, expiresAtMs, nowMs, max) {
      const s = sets.get(key) ?? new Map<string, number>();
      for (const [m, exp] of s) if (exp <= nowMs) s.delete(m);
      sets.set(key, s);
      if (s.size >= max) return { ok: false, held: s.size };
      s.set(member, expiresAtMs);
      return { ok: true, held: s.size };
    },
    async unlease(key, member) { sets.get(key)?.delete(member); return true; },
  };
}

/** Today's booked platform spend in USD (all services), from the trace ledger; null when unreadable. */
export type SpendLedgerReader = (day: string) => Promise<number | null>;

const ledgerReader: SpendLedgerReader = async (day) => {
  try {
    const [{ createServiceRoleClient }, { GEL_PER_USD }] = await Promise.all([import('@/lib/supabase/server'), import('@/lib/billing/fx')]);
    const { data, error } = await createServiceRoleClient()
      .from('agent_evolution_traces')
      .select('cost_wholesale_gel')
      .gte('created_at', `${day}T00:00:00.000Z`)
      .limit(50_000);
    if (error || !Array.isArray(data)) return null;
    let gel = 0;
    for (const row of data as { cost_wholesale_gel: number | null }[]) {
      const v = Number(row.cost_wholesale_gel ?? 0);
      if (Number.isFinite(v) && v > 0) gel += v;
    }
    return gel / GEL_PER_USD;
  } catch {
    return null;
  }
};

const memStore = memoryCapStore();
let deps: { store: CapStore; fallback: CapStore; ledger: SpendLedgerReader; now: () => Date } = {
  store: redisCapStore, fallback: memStore, ledger: ledgerReader, now: () => new Date(),
};

/** Test seam. Pass nothing to restore the real stores. */
export function setSpendCapDepsForTests(next?: Partial<typeof deps>): void {
  deps = next ? { ...deps, ...next } : { store: redisCapStore, fallback: memoryCapStore(), ledger: ledgerReader, now: () => new Date() };
}

const globalKey = (day: string) => `spend:all:micro:${day}`;
const startsKey = (userId: string, day: string) => `spend:user:starts:${day}:${userId}`;
const leaseKey = (userId: string) => `spend:user:leases:${userId}`;

// ── 1. Global daily spend ──────────────────────────────────────────────────────────────────────────────────────────

export type GlobalReservation =
  | { ok: true; enforced: false }
  | { ok: true; enforced: true; day: string; micro: number; source: 'redis' | 'ledger'; totalUsd: number; limitUsd: number }
  | { ok: false; enforced: true; reason: 'global_daily_cap' | 'global_cap_unreadable'; totalUsd: number | null; limitUsd: number };

/** Reserve `usd` of today's platform ceiling before a paid call. Never throws. */
export async function reserveGlobalSpend(usd: number, env: Env = process.env): Promise<GlobalReservation> {
  const limitUsd = globalDailyLimitUsd(env);
  if (limitUsd === null) return { ok: true, enforced: false };
  const day = dayKey(deps.now());
  const micro = toMicro(usd);
  const cap = toMicro(limitUsd);
  try {
    // A deployment that starts mid-day folds in what the ledger already booked, once: the marker is written only when
    // absent, so two first calls racing here cannot both add the ledger's figure.
    if ((await deps.store.seedIfAbsent(`${globalKey(day)}:seeded`, 1, DAY_TTL_SEC)) === true) {
      const booked = await deps.ledger(day);
      if (booked !== null && booked > 0) await deps.store.adjust(globalKey(day), toMicro(booked), DAY_TTL_SEC);
    }
    const r = await deps.store.addCapped(globalKey(day), micro, cap, DAY_TTL_SEC);
    if (r) {
      const totalUsd = round2(r.total / MICRO);
      if (!r.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[spend-cap] REFUSED $${round2(usd)}: today ${day} $${totalUsd} of $${limitUsd} already reserved`);
        return { ok: false, enforced: true, reason: 'global_daily_cap', totalUsd, limitUsd };
      }
      return { ok: true, enforced: true, day, micro, source: 'redis', totalUsd, limitUsd };
    }
    const booked = await deps.ledger(day);
    if (booked === null) {
      // eslint-disable-next-line no-console
      console.error(`[spend-cap] REFUSED $${round2(usd)}: neither Redis nor the ledger can be read, today's spend is unknown`);
      return { ok: false, enforced: true, reason: 'global_cap_unreadable', totalUsd: null, limitUsd };
    }
    if (booked + usd > limitUsd + 1e-9) {
      return { ok: false, enforced: true, reason: 'global_daily_cap', totalUsd: round2(booked), limitUsd };
    }
    return { ok: true, enforced: true, day, micro: 0, source: 'ledger', totalUsd: round2(booked + usd), limitUsd };
  } catch {
    return { ok: false, enforced: true, reason: 'global_cap_unreadable', totalUsd: null, limitUsd };
  }
}

/** A call that failed costs nothing: give its reservation back. Never throws. */
export async function releaseGlobalSpend(r: GlobalReservation): Promise<void> {
  if (!r.ok || !r.enforced || r.source !== 'redis' || r.micro <= 0) return;
  await deps.store.adjust(globalKey(r.day), -r.micro, DAY_TTL_SEC).catch(() => null);
}

/** A call that succeeded: move its reservation to the real cost (up or down). Returns today's total in USD, or null. */
export async function settleGlobalSpend(r: GlobalReservation, actualUsd: number): Promise<number | null> {
  if (!r.ok || !r.enforced || r.source !== 'redis') return null;
  const delta = toMicro(actualUsd) - r.micro;
  if (delta === 0) return r.totalUsd;
  const n = await deps.store.adjust(globalKey(r.day), delta, DAY_TTL_SEC).catch(() => null);
  return n === null ? null : round2(n / MICRO);
}

// ── 2 + 3. Per-user concurrency and daily starts ──────────────────────────────────────────────────────────────────

export type UserClaim =
  | { ok: true; release: (failed: boolean) => Promise<void> }
  | { ok: false; reason: 'user_concurrency' | 'user_daily_cap'; held: number; limit: number };

/**
 * Claim one paid start for `userId`: a daily start (when USER_DAILY_PAID_STARTS is set) and a concurrency lease (when
 * USER_MAX_CONCURRENT_JOBS is set). `release(false)` gives the lease back (a quick call returned); `release(true)` gives
 * back the lease AND the day's start (the call failed, nothing was billed). A long job that started is never released:
 * its lease expires after LEASE_MS[service]. Never throws.
 */
export async function claimUserStart(userId: string, service: ServiceType, env: Env = process.env): Promise<UserClaim> {
  const maxJobs = userMaxConcurrentJobs(env);
  const maxStarts = userDailyPaidStarts(env);
  if (maxJobs === null && maxStarts === null) return { ok: true, release: async () => undefined };
  const now = deps.now();
  const day = dayKey(now);
  let startTaken: CapStore | null = null;

  if (maxStarts !== null) {
    const key = startsKey(userId, day);
    let store = deps.store;
    let r = await store.addCapped(key, 1, maxStarts, DAY_TTL_SEC);
    if (!r) { store = deps.fallback; r = await store.addCapped(key, 1, maxStarts, DAY_TTL_SEC); }
    if (r && !r.ok) return { ok: false, reason: 'user_daily_cap', held: r.total, limit: maxStarts };
    startTaken = r ? store : null;
  }
  const giveStartBack = async () => { if (startTaken) await startTaken.adjust(startsKey(userId, day), -1, DAY_TTL_SEC).catch(() => null); };

  if (maxJobs === null) return { ok: true, release: async (failed) => { if (failed) await giveStartBack(); } };
  const member = randomUUID();
  const key = leaseKey(userId);
  const nowMs = now.getTime();
  const exp = nowMs + (LEASE_MS[service] ?? 15 * 60_000);
  let store = deps.store;
  let l = await store.lease(key, member, exp, nowMs, maxJobs);
  if (!l) { store = deps.fallback; l = await store.lease(key, member, exp, nowMs, maxJobs); }
  if (l && !l.ok) {
    await giveStartBack();
    return { ok: false, reason: 'user_concurrency', held: l.held, limit: maxJobs };
  }
  const holder = store;
  return {
    ok: true,
    release: async (failed) => {
      await holder.unlease(key, member).catch(() => null);
      if (failed) await giveStartBack();
    },
  };
}
