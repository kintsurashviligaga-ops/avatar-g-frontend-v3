/**
 * Health Check Endpoint
 * GET/POST /api/health
 *
 * Production-grade health check with Redis verification
 * Returns HTTP 200 always (health endpoint must never fail system)
 * Verifies: Redis connectivity, Vercel environment, service status
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface HealthResponse {
  ok: boolean;
  commit: string;
  time: string;
  env: 'valid' | 'invalid';
  env_ok?: boolean;
  service: 'backend';
  status: 'healthy';
  ts: number;
  version: string;
  redis: 'connected' | 'unconfigured' | 'error';
  missing: string[];
  /** Per-provider "is a key set" map. Booleans only — see providerReadiness for why this exists. */
  providers?: Record<string, boolean>;
  providers_missing?: string[];
  providers_note?: string;
  /** 'test' means no real payment can be taken, however healthy everything else looks. */
  payments?: 'test' | 'live' | 'unset';
  message?: string;
  region?: string;
}

const CRITICAL_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function getMissingEnvVars(): string[] {
  return CRITICAL_ENV.filter(k => !process.env[k]) as unknown as string[];
}

function hasBaseUrlConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL
  );
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
    redis.del(testKey).catch(() => undefined);

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
 * Which PROVIDER capabilities are configured. Booleans only — never a value, never a prefix.
 *
 * ⚠️ WHY THIS EXISTS. `missing` only covers CORE_REQUIRED_VARS: Supabase plus three URLs. So this
 * endpoint answered `env:"valid"`, `missing:[]`, `status:"healthy"` on a deployment where every single
 * AI provider key could be absent — a green light on a product that cannot generate anything.
 *
 * That false green hid a real production fault for a long time. Three consecutive calls to
 * /api/chat/gemini on myavatar.ge all returned `provider:"anthropic"`, which is that route's
 * LAST-RESORT fallback — so the production GEMINI_API_KEY is absent or invalid, and with it Veo
 * (video), Imagen (images) and Lyria (music) are all silently running on their backups. Health said
 * "healthy" throughout, and nothing anywhere said otherwise.
 *
 * THIS CANNOT PROVE A KEY IS VALID OR FUNDED — only that something is set. Said in the payload rather
 * than implied, because `gemini: true` next to a chat that answers from Anthropic is exactly the kind
 * of half-truth that cost the time above.
 */
function providerReadiness(): Record<string, boolean> {
  const set = (n: string) => Boolean(process.env[n] && String(process.env[n]).trim().length > 0);
  return {
    // One key, four headline features: chat, Imagen, Lyria AND Veo.
    gemini: set('GEMINI_API_KEY') || set('GOOGLE_GENERATIVE_AI_API_KEY'),
    anthropic: set('ANTHROPIC_API_KEY'),
    replicate: set('REPLICATE_API_TOKEN'),   // FLUX · Kling · SadTalker · TRELLIS · MusicGen · Demucs
    nanobanana: set('NANOBANANA_API_KEY'),   // default image engine
    elevenlabs: set('ELEVENLABS_API_KEY'),   // EVERY text-to-speech leg: narration, dubbing, voiceover
    heygen: set('HEYGEN_API_KEY'),           // primary avatar engine
    xai: set('XAI_API_KEY'),                 // image fallback leg
    stripe: set('STRIPE_SECRET_KEY'),
    resend: set('RESEND_API_KEY'),           // sign-up OTP email
    sentry: set('SENTRY_DSN') || set('NEXT_PUBLIC_SENTRY_DSN'),
  };
}

/** test vs live, from the key prefix. A site in test mode takes no real money. */
function stripeMode(): 'test' | 'live' | 'unset' {
  const k = process.env.STRIPE_SECRET_KEY ?? '';
  if (k.startsWith('sk_live_')) return 'live';
  if (k.startsWith('sk_test_')) return 'test';
  return 'unset';
}

/**
 * GET /api/health
 * Public health check endpoint
 */
export async function GET() {
  try {
    const redisStatus = await verifyRedis();
    const missing = getMissingEnvVars();
    const envValid = missing.length === 0 && hasBaseUrlConfigured();
    const ts = Date.now();
    const version = getVersion();
    const region = process.env.VERCEL_REGION;
    const providers = providerReadiness();
    const providersMissing = Object.entries(providers).filter(([, v]) => !v).map(([k]) => k);

    const response: HealthResponse = {
      providers,
      providers_missing: providersMissing,
      providers_note: 'configured-only — does NOT prove a key is valid or funded',
      payments: stripeMode(),
      ok: true,
      commit: version,
      time: new Date(ts).toISOString(),
      env: envValid ? 'valid' : 'invalid',
      env_ok: envValid,
      service: 'backend',
      status: 'healthy',
      ts,
      version,
      redis: redisStatus.redis,
      missing,
      ...(redisStatus.message && { message: redisStatus.message }),
      ...(region && { region }),
    };

    // Always return 200 (health endpoint must not fail the system)
    return NextResponse.json(response, { status: 200 });
  } catch {
    // Fallback: still return 200 even if something goes wrong
    return NextResponse.json(
      {
        ok: true,
        commit: getVersion(),
        time: new Date().toISOString(),
        env: 'invalid',
        env_ok: false,
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
  return GET();
}
