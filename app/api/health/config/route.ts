/**
 * GET /api/health/config — integration posture (strict validation, not fail-closed).
 *
 * Security: anonymous callers get only a coarse { ready } boolean (never leak the
 * exact list of unconfigured integrations to the public — that's reconnaissance).
 * Authenticated users and local `next dev` get the full per-integration audit.
 * No secret VALUES are ever returned — presence only.
 */
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { auditConfig, productionReadiness, logConfigPostureOnce } from '@/lib/orchestrator/config-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  logConfigPostureOnce();
  const summary = productionReadiness();

  // Full per-integration detail is admin-only (knowing exactly which backends
  // are unconfigured is reconnaissance). Everyone else gets the coarse signal.
  // Local `next dev` always gets detail for convenience.
  let detailed = process.env.NODE_ENV === 'development';
  if (!detailed) {
    try {
      detailed = await isAdmin();
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
