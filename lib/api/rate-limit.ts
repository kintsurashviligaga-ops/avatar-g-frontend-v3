/**
 * Rate Limiting Middleware
 * Provides in-memory and Redis-based rate limiting for APIs
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // milliseconds
  keyGenerator?: (req: NextRequest) => string;
}

/**
 * In-memory rate limit store (for development/single-process)
 * DO NOT use in production with multiple processes
 */
class InMemoryRateLimiter {
  private store: Map<string, { count: number; resetTime: number }> = new Map();

  check(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      // Reset or create new record
      this.store.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
      });
      return true;
    }

    if (record.count >= config.maxRequests) {
      return false;
    }

    record.count++;
    return true;
  }

  getRemainingRequests(key: string, config: RateLimitConfig): number {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record) return config.maxRequests;
    if (now > record.resetTime) return config.maxRequests;

    return Math.max(0, config.maxRequests - record.count);
  }

  getResetTime(key: string): number {
    const record = this.store.get(key);
    return record?.resetTime ?? 0;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

// Singleton instance
const limiter = new InMemoryRateLimiter();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => limiter.cleanup(), 5 * 60 * 1000);
}

/**
 * Default rate limit configurations for different endpoint types
 */
export const RATE_LIMITS = {
  // Generous limit for read operations
  READ: { maxRequests: 100, windowMs: 60 * 1000 } as const,

  // Moderate limit for write operations
  WRITE: { maxRequests: 20, windowMs: 60 * 1000 } as const,

  // Strict limit for expensive operations (generation, processing)
  EXPENSIVE: { maxRequests: 5, windowMs: 60 * 1000 } as const,

  // Very strict for auth operations
  AUTH: { maxRequests: 5, windowMs: 15 * 60 * 1000 } as const,

  // Public endpoints (generous)
  PUBLIC: { maxRequests: 1000, windowMs: 60 * 1000 } as const,
};

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(req: NextRequest): string {
  // Try to get client IP from various headers
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0] ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';

  return ip;
}

/**
 * Rate limit middleware that returns error response
 */
export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig = RATE_LIMITS.READ,
  customKeyGenerator?: (req: NextRequest) => string
): Promise<NextResponse | null> {
  const keyGenerator = customKeyGenerator || defaultKeyGenerator;
  const key = keyGenerator(req);

  if (!limiter.check(key, config)) {
    const resetTime = limiter.getResetTime(key);
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

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
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
        },
      }
    );
  }

  return null;
}

/**
 * Middleware function wrapper for rate limiting with proper headers
 */
export function withRateLimit(config: RateLimitConfig = RATE_LIMITS.READ) {
  return async (req: NextRequest, handler: () => Promise<NextResponse>) => {
    const rateLimitError = await rateLimit(req, config);
    if (rateLimitError) return rateLimitError;

    const response = await handler();

    // Add rate limit headers to response
    const remaining = limiter.getRemainingRequests(defaultKeyGenerator(req), config);
    response.headers.set('X-RateLimit-Limit', String(config.maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set(
      'X-RateLimit-Reset',
      String(Math.ceil(limiter.getResetTime(defaultKeyGenerator(req)) / 1000))
    );

    return response;
  };
}

/**
 * Helper for API routes to check rate limit
 * Usage in route.ts:
 *   const limitError = await checkRateLimit(req, RATE_LIMITS.WRITE);
 *   if (limitError) return limitError;
 */
export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig = RATE_LIMITS.READ
): Promise<NextResponse | null> {
  return rateLimit(req, config);
}
