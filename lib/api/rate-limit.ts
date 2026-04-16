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
  AUTH:      { maxRequests: 5,   windowMs: 15 * 60_000,  keyPrefix: 'rl:auth'  } as const,
  PUBLIC:    { maxRequests: 200, windowMs: 60_000,       keyPrefix: 'rl:pub'   } as const,
  AI:        { maxRequests: 10,  windowMs: 60_000,       keyPrefix: 'rl:ai'    } as const,
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

export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig = RATE_LIMITS.READ
): Promise<NextResponse | null> {
  const key = getClientKey(req, config.keyPrefix ?? 'rl');

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

/** Backward-compatible alias */
export const rateLimit = checkRateLimit;
