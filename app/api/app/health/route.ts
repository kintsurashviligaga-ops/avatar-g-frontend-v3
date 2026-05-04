import { NextRequest, NextResponse } from 'next/server';
import { runProviderHealthAudit } from '@/lib/system/provider-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const live = request.nextUrl.searchParams.get('live') === '1';
  const report = await runProviderHealthAudit({ live });

  return NextResponse.json({
    ok: true,
    live,
    timestamp: new Date().toISOString(),
    audit: report,
  });
}
