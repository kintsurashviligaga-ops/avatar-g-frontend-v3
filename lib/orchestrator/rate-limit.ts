import 'server-only';

/**
 * Per-user rate limiting + produce cost metering — the swarm's cost guardrail.
 *
 * The 6 produce pipelines call paid vendors (Claude, Gemini, HeyGen, Udio,
 * Replicate, ElevenLabs). Without metering a single authenticated user could
 * drain the org's API balances. This module adds:
 *   • a fixed-window per-user request cap (per-minute + per-day), and
 *   • a per-pipeline credit cost (charged on success via the ledger).
 *
 * Fail-OPEN when Upstash is unconfigured (dev / not provisioned) so local work
 * is never blocked — but the moment UPSTASH_* lands, the cap is enforced.
 */

import { Redis } from '@upstash/redis';

export type ProduceKind = 'film' | 'avatar' | 'interior' | 'image' | 'music' | 'voice';

/** Credits charged per successful produce (relative provider expense). */
export const PRODUCE_COST: Record<ProduceKind, number> = {
  film: 20, avatar: 15, interior: 8, image: 2, music: 6, voice: 2,
};

/** Fixed-window caps per authenticated user. */
export const RATE_PER_MIN = 6;
export const RATE_PER_DAY = 120;

/**
 * Platform-wide daily produce ceiling — a global kill-switch so a coordinated
 * burst (many users) can't drain the org's vendor balances in a day. Overridable
 * via env so it can be raised as the business scales.
 */
export const GLOBAL_DAILY_CAP = Number(process.env.PRODUCE_GLOBAL_DAILY_CAP ?? 2000);

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { return new Redis({ url, token }); } catch { return null; }
}

/** Deterministic window keys for a user at a given instant (pure → testable). */
export function rateWindowKeys(userId: string, now: number = Date.now()): { minKey: string; dayKey: string } {
  const minute = Math.floor(now / 60_000);
  const day = new Date(now).toISOString().slice(0, 10);
  return { minKey: `rl:min:${userId}:${minute}`, dayKey: `rl:day:${userId}:${day}` };
}

export interface RateResult {
  ok: boolean;
  reason?: 'rate_minute' | 'rate_day' | 'global_ceiling';
  retryAfterSec?: number;
}

/**
 * Increment + check the per-user fixed-window counters. Fail-open on missing /
 * erroring Redis so a transient cache problem never blocks generation.
 */
export async function checkProduceRate(userId: string, now: number = Date.now()): Promise<RateResult> {
  const r = redis();
  if (!r) return { ok: true };
  const { minKey, dayKey } = rateWindowKeys(userId, now);
  try {
    const minN = await r.incr(minKey);
    await r.expire(minKey, 70);
    if (minN > RATE_PER_MIN) return { ok: false, reason: 'rate_minute', retryAfterSec: 60 };
    const dayN = await r.incr(dayKey);
    await r.expire(dayKey, 90_000);
    if (dayN > RATE_PER_DAY) return { ok: false, reason: 'rate_day', retryAfterSec: 3600 };
    // Platform-wide daily kill-switch.
    const gKey = `rl:global:${new Date(now).toISOString().slice(0, 10)}`;
    const gN = await r.incr(gKey);
    await r.expire(gKey, 90_000);
    if (gN > GLOBAL_DAILY_CAP) return { ok: false, reason: 'global_ceiling', retryAfterSec: 3600 };
    return { ok: true };
  } catch {
    return { ok: true }; // fail-open
  }
}

/** A 429 Response body for a blocked produce request. */
export function rateLimitedResponse(rate: RateResult): Response {
  return new Response(
    JSON.stringify({ error: 'rate_limited', reason: rate.reason, retryAfter: rate.retryAfterSec ?? 60 }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfterSec ?? 60) } },
  );
}
