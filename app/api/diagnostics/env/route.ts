import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/diagnostics/env
 * Verify environment variables exist without exposing values.
 */
export async function GET() {
  const envVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'REPLICATE_API_TOKEN',
    'NEXT_PUBLIC_BASE_URL',
    'NEXT_PUBLIC_APP_URL',
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  ];

  const status: Record<string, boolean> = {};
  for (const key of envVars) {
    status[key] = !!process.env[key];
  }

  const missing = envVars.filter(k => !process.env[k]);

  return NextResponse.json({
    ok: missing.length === 0,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV ?? 'local',
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown',
    commitSha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    vars: status,
    missing,
  });
}
