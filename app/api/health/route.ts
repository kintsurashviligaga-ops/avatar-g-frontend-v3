/**
 * Health Check Endpoint
 * GET/POST /api/health
 *
 * Production-grade health check with Redis verification
 * Returns HTTP 200 always (health endpoint must never fail system)
 * Verifies: Redis connectivity, Vercel environment, service status
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

// Redis import - uses REST API for serverless Vercel
let Redis: any;
try {
  const upstashModule = require('@upstash/redis');
  Redis = upstashModule.Redis;
} catch {
  // @upstash/redis not installed yet
  Redis = null;
}

interface HealthResponse {
  ok: boolean;
  service: 'backend';
  status: 'healthy';
  ts: number;
  version: string;
  redis: 'connected' | 'unconfigured' | 'error';
  message?: string;
  region?: string;
}

/**
 * Get application version from Vercel or package.json
 */
function getVersion(): string {
  // Try Vercel deployment info first
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7);
  }
  // Fall back to package version
  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }
  return 'unknown';
}

/**
 * Safely truncate error message to prevent information leakage
 */
function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    // Truncate to 120 chars and avoid exposing secrets
    if (
      msg.includes('token') ||
      msg.includes('secret') ||
      msg.includes('credential')
    ) {
      return 'Redis authentication failed';
    }
    return msg.substring(0, 120);
  }
  return 'Unknown error';
}

/**
 * Verify Redis connection with SET/GET test
 * Non-blocking: always returns a status object, never throws
 */
async function verifyRedis(): Promise<
  Pick<HealthResponse, 'redis' | 'message'>
> {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    // Check if credentials configured
    if (!url || !token) {
      return {
        redis: 'unconfigured',
        message: 'Redis credentials not set',
      };
    }

    // Fail gracefully if module not installed
    if (!Redis) {
      return {
        redis: 'error',
        message: '@upstash/redis package not installed',
      };
    }

    // Initialize Redis client (REST-based for serverless)
    const redis = new Redis({ url, token });

    // Test with unique key (prevents cache pollution)
    const testKey = `health:${Date.now()}:${Math.random()
      .toString(16)
      .slice(2)}`;
    const testValue = 'ok';

    // SET with TTL (10 seconds)
    await redis.set(testKey, testValue, { ex: 10 });

    // GET to verify
    const result = await redis.get(testKey);

    // Cleanup (best effort, ignore errors)
    redis.delete(testKey).catch(() => undefined);

    if (result === testValue) {
      return { redis: 'connected' };
    } else {
      return {
        redis: 'error',
        message: 'Redis set/get verification failed',
      };
    }
  } catch (error) {
    return {
      redis: 'error',
      message: safeErrorMessage(error),
    };
  }
}

/**
 * GET /api/health
 * Public health check endpoint
 */
export async function GET(req: NextRequest) {
  try {
    const redisStatus = await verifyRedis();
    const ts = Date.now();
    const version = getVersion();
    const region = process.env.VERCEL_REGION;

    const response: HealthResponse = {
      ok: redisStatus.redis === 'connected',
      service: 'backend',
      status: 'healthy',
      ts,
      version,
      redis: redisStatus.redis,
      ...(redisStatus.message && { message: redisStatus.message }),
      ...(region && { region }),
    };

    // Always return 200 (health endpoint must not fail the system)
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    // Fallback: still return 200 even if something goes wrong
    return NextResponse.json(
      {
        ok: false,
        service: 'backend',
        status: 'healthy',
        ts: Date.now(),
        version: getVersion(),
        redis: 'error',
        message: 'Health check service error',
      },
      { status: 200 }
    );
  }
}

/**
 * POST /api/health
 * Same as GET (idempotent health check)
 */
export async function POST(req: NextRequest) {
  // Consume body to prevent hanging connections
  try {
    await req.json().catch(() => ({}));
  } catch {
    // Ignore body parsing errors
  }

  // Delegate to GET
  return GET(req);
}
