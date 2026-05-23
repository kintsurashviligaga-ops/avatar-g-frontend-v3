/**
 * GET /api/health/config — integration posture (strict validation, not fail-closed).
 *
 * Security: anonymous callers get only a coarse { ready } boolean (never leak the
 * exact list of unconfigured integrations to the public — that's reconnaissance).
 * Authenticated users and local `next dev` get the full per-integration audit.
 * No secret VALUES are ever returned — presence only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { auditConfig, productionReadiness, logConfigPostureOnce } from '@/lib/orchestrator/config-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  logConfigPostureOnce();
  const summary = productionReadiness();

  // Coarse public signal — safe to expose (just "is the platform fully provisioned").
  let detailed = process.env.NODE_ENV === 'development';
  if (!detailed) {
    try {
      const { user } = await authedClientFromRequest(req);
      detailed = Boolean(user);
    } catch {
      detailed = false;
    }
  }

  if (!detailed) {
    return NextResponse.json({ ready: summary.ready });
  }

  return NextResponse.json({
    ready: summary.ready,
    liveCount: summary.liveCount,
    total: summary.total,
    hardMissing: summary.hardMissing,
    degraded: summary.degraded,
    integrations: auditConfig(),
  });
}
