import { NextRequest, NextResponse } from 'next/server';
import { runProviderHealthAudit } from '@/lib/system/provider-health';
import { opsCallerAllowed, opsNotFound } from '@/lib/security/opsAccess';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/app/health[?live=1] — provider routing audit (env-key names, configured flags; with live=1, a probe of each
 * provider and any credit balance it reports).
 *
 * ⚠️ OPERATORS ONLY (lib/security/opsAccess): it was anonymous. Anyone could list which provider keys this deployment
 * holds, read our VENDOR CREDIT BALANCES (Udio / HeyGen `creditsRemaining`), and with ?live=1 make the server fire a
 * request at seven providers per hit — a free amplifier against our own provider rate limits. In production a caller
 * who is not a signed-in admin (or a CRON_SECRET bearer, for scripts/provider-health-check.mjs) gets a 404.
 */
export async function GET(request: NextRequest) {
  if (!(await opsCallerAllowed(request))) return opsNotFound();
  const live = request.nextUrl.searchParams.get('live') === '1';
  const report = await runProviderHealthAudit({ live });

  return NextResponse.json({
    ok: true,
    live,
    timestamp: new Date().toISOString(),
    audit: report,
  });
}
