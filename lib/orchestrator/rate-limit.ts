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

/**
 * Deterministic window keys for a user at a given instant (pure → testable). An optional `ns` namespace
 * gives a caller its OWN budget without touching the produce routes: `ns=''` (the default) yields keys
 * byte-identical to before, so the 6 produce pipelines are unchanged; a distinct ns (e.g. 'agent') gets
 * separate counters and never trips the produce per-user/global caps.
 */
export function rateWindowKeys(userId: string, now: number = Date.now(), ns: string = ''): { minKey: string; dayKey: string } {
  const minute = Math.floor(now / 60_000);
  const day = new Date(now).toISOString().slice(0, 10);
  const p = ns ? `${ns}:` : '';
  return { minKey: `rl:min:${p}${userId}:${minute}`, dayKey: `rl:day:${p}${userId}:${day}` };
}

export interface RateResult {
  ok: boolean;
  reason?: 'rate_minute' | 'rate_day' | 'global_ceiling';
  retryAfterSec?: number;
}

/** One-shot guard so the "limiter inert in prod" warning is logged once per lambda, not per request. */
let warnedRedisAbsent = false;

/**
 * Increment + check the per-user fixed-window counters (optionally under a `ns` namespace with its own
 * budget). Fail-open on missing / erroring Redis so a transient cache problem never blocks generation —
 * but in PRODUCTION that fail-open means every per-user cap AND the global kill-switch are silently OFF,
 * so we now emit an observability signal (log only; behavior is unchanged — a Redis blip must not 429
 * all generation).
 */
export async function checkProduceRate(userId: string, now: number = Date.now(), ns: string = ''): Promise<RateResult> {
  const r = redis();
  if (!r) {
    if (process.env.NODE_ENV === 'production' && !warnedRedisAbsent) {
      warnedRedisAbsent = true;
      // eslint-disable-next-line no-console
      console.warn('[rate-limit] Upstash not configured in production — per-user + global produce caps are INERT (fail-open). Set UPSTASH_REDIS_REST_URL/TOKEN to enforce.');
    }
    return { ok: true };
  }
  const { minKey, dayKey } = rateWindowKeys(userId, now, ns);
  const p = ns ? `${ns}:` : '';
  try {
    const minN = await r.incr(minKey);
    await r.expire(minKey, 70);
    if (minN > RATE_PER_MIN) return { ok: false, reason: 'rate_minute', retryAfterSec: 60 };
    const dayN = await r.incr(dayKey);
    await r.expire(dayKey, 90_000);
    if (dayN > RATE_PER_DAY) return { ok: false, reason: 'rate_day', retryAfterSec: 3600 };
    // Namespaced daily kill-switch (the '' namespace keeps the original produce global key).
    const gKey = `rl:global:${p}${new Date(now).toISOString().slice(0, 10)}`;
    const gN = await r.incr(gKey);
    await r.expire(gKey, 90_000);
    if (gN > GLOBAL_DAILY_CAP) return { ok: false, reason: 'global_ceiling', retryAfterSec: 3600 };
    return { ok: true };
  } catch (e) {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.error('[rate-limit] Redis error — produce cap failed OPEN for this request:', e instanceof Error ? e.message : e);
    }
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
