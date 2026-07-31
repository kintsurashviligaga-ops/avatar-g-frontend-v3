/**
 * Rate Limiting — Redis-backed in production, in-memory fallback for dev.
 *
 * Uses a sliding window counter stored in Upstash Redis via the INCR + EXPIRE
 * pattern. Each key is namespaced by route prefix so limits are isolated.
 *
 * Falls back to in-memory when UPSTASH_REDIS_REST_URL is not set (local dev).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { PlanTier } from '@/lib/billing/plans';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

// ─── In-memory fallback (dev / single-process) ───────────────────────────────

class InMemoryRateLimiter {
  private store = new Map<string, { count: number; resetTime: number }>();

  check(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + config.windowMs });
      return { allowed: true, remaining: config.maxRequests - 1, resetTime: now + config.windowMs };
    }

    record.count++;
    const allowed = record.count <= config.maxRequests;
    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - record.count),
      resetTime: record.resetTime,
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store) {
      if (now > record.resetTime) this.store.delete(key);
    }
  }
}

const memLimiter = new InMemoryRateLimiter();
if (typeof setInterval !== 'undefined') {
  setInterval(() => memLimiter.cleanup(), 5 * 60 * 1000);
}

// ─── Redis-backed limiter (production) ───────────────────────────────────────

async function redisRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const windowSec = Math.ceil(config.windowMs / 1000);

  try {
    // Atomic INCR + conditional EXPIRE using a pipeline
    const pipeline = [
      ['INCR', key],
      ['TTL', key],
    ];

    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pipeline),
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ result: number }>;
    const count = data[0]?.result ?? 1;
    const ttl = data[1]?.result ?? -1;

    // Set expiry only on first request in this window
    if (ttl === -1) {
      await fetch(`${url}/expire/${encodeURIComponent(key)}/${windowSec}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    }

    const resetTime = Date.now() + (ttl > 0 ? ttl * 1000 : config.windowMs);
    const allowed = count <= config.maxRequests;
    return { allowed, remaining: Math.max(0, config.maxRequests - count), resetTime };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const RATE_LIMITS = {
  READ:      { maxRequests: 100, windowMs: 60_000,       keyPrefix: 'rl:read'  } as const,
  WRITE:     { maxRequests: 20,  windowMs: 60_000,       keyPrefix: 'rl:write' } as const,
  EXPENSIVE: { maxRequests: 5,   windowMs: 60_000,       keyPrefix: 'rl:exp'   } as const,
  // Voice-mode ephemeral-token mint (IP-keyed burst guard). Voice is intentionally FREE for signed-in
  // users (no credit gate), so this is deliberately forgiving — a legit user reconnecting / toggling the
  // ♀/♂ voice (each swap re-mints) / re-opening the call must not hit a "Too many requests" wall at 5.
  // Per-ACCOUNT cost is bounded separately by VOICE_TOKEN_USER (keyed on userId, defeats IP rotation).
  VOICE_TOKEN:{ maxRequests: 15,  windowMs: 60_000,       keyPrefix: 'rl:voice' } as const,
  // Per-USER daily ceiling on the cost-bearing Live mint, keyed on the authenticated userId (NOT IP), so
  // rotating IPs across throwaway auto-confirmed signups can't mint unbounded 30-min native-audio sessions.
  // Generous (≈ a whole day of heavy real use incl. voice-swaps) — it caps abuse, not legitimate testing.
  VOICE_TOKEN_USER:{ maxRequests: 200, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:voice:user' } as const,
  // Per-USER daily ceiling on the EXPENSIVE real-time LiveAvatar (LiveKit) session mint — each session is a
  // costly streaming avatar, so this is much tighter than the Gemini token cap. Bounds a single account
  // from starting hundreds of paid sessions; the owner can raise it as the plan matures.
  LIVEAVATAR_SESSION:{ maxRequests: 20, windowMs: 24 * 60 * 60_000, keyPrefix: 'rl:liveavatar:user' } as const,
  // Storyboard preview = ONE logical generation that fans out into many quick
  // server calls (plan + per-scene frame stream + retries + re-rolls). Treating
  // each as EXPENSIVE (5/min) tripped a 429 mid-board, leaving frames blank. This
  // dedicated tier sizes the limit to a full board (+ a re-roll or two) per minute.
  STORYBOARD:{ maxRequests: 30,  windowMs: 60_000,       keyPrefix: 'rl:sb'    } as const,
  AUTH:      { maxRequests: 5,   windowMs: 15 * 60_000,  keyPrefix: 'rl:auth'  } as const,
  PUBLIC:    { maxRequests: 200, windowMs: 60_000,       keyPrefix: 'rl:pub'   } as const,
  AI:        { maxRequests: 10,  windowMs: 60_000,       keyPrefix: 'rl:ai'    } as const,
  // 3D reconstruction STATUS polling — its OWN namespace, and that is the point.
  //
  // It used to draw on the AI bucket, which is the same bucket /api/ai/chat, /api/agent-g/chat,
  // /api/v2/personas and /api/pipeline/run all use. The 3D poll ramps 3s,4s,5s,… so it fires at
  // t=3,7,12,18,25,33,42,52 — EIGHT of the ten allowed requests inside the first minute. And the 3D
  // surface lives INSIDE the chat box, whose own copy invites the user to keep talking while it runs, so
  // the two were guaranteed to starve each other: chat messages came back "Too many requests" mid-render,
  // and chatting got the poll 429'd (the client silently discards those ticks and burns poll attempts).
  // Sized for a long poll — a status read is a cheap provider lookup, not a render.
  POLL_3D:   { maxRequests: 60,  windowMs: 60_000,       keyPrefix: 'rl:3dpoll' } as const,
  WEBHOOK:   { maxRequests: 500, windowMs: 60_000,       keyPrefix: 'rl:wh'    } as const,
} as const;

export function getRateLimitForPlan(
  plan: PlanTier,
  operation: 'read' | 'write' | 'expensive' = 'read'
): RateLimitConfig {
  const key = operation.toUpperCase() as 'READ' | 'WRITE' | 'EXPENSIVE';
  const base = RATE_LIMITS[key];
  const multipliers: Record<string, number> = {
    ENTERPRISE: 5, PREMIUM: 3, PRO: 1.5,
  };
  const mult = multipliers[plan] ?? 1;
  return { ...base, maxRequests: Math.round(base.maxRequests * mult) };
}

function getClientKey(req: NextRequest, prefix: string): string {
  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  return `${prefix}:${ip}`;
}

/** Run the limiter for an already-built key and return a 429 response if the window is exhausted. */
async function limitByKey(key: string, config: RateLimitConfig): Promise<NextResponse | null> {
  const result =
    (await redisRateLimit(key, config)) ??
    memLimiter.check(key, config);

  if (result.allowed) return null;

  const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);

  return new NextResponse(
    JSON.stringify({
      status: 'error',
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(config.maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000)),
      },
    }
  );
}

export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig = RATE_LIMITS.READ
): Promise<NextResponse | null> {
  return limitByKey(getClientKey(req, config.keyPrefix ?? 'rl'), config);
}

/**
 * Rate-limit by an EXPLICIT identifier (e.g. a resolved userId) rather than the request IP. Use for
 * per-ACCOUNT caps where IP rotation must not defeat the limit (cost-bearing mints). Call AFTER the
 * caller is authenticated so `id` is the trusted principal. Returns a 429 NextResponse when exceeded.
 */
export async function checkRateLimitByKey(
  id: string,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  return limitByKey(`${config.keyPrefix ?? 'rl:key'}:${id}`, config);
}

/** Backward-compatible alias */
export const rateLimit = checkRateLimit;
