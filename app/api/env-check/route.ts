/**
 * GET /api/env-check
 * Returns structured ENV validation report.
 * Protected — only accessible in development or with admin token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEnv } from '@/lib/env/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Protect in production: require admin bearer token
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    const auth = req.headers.get('authorization');
    const adminToken = process.env.ADMIN_API_TOKEN;
    if (!adminToken || auth !== `Bearer ${adminToken}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const result = validateEnv();

  return NextResponse.json({
    ...result,
    build: {
      sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      buildTime: process.env.NEXT_PUBLIC_BUILD_ID || 'unknown',
    },
  });
}
