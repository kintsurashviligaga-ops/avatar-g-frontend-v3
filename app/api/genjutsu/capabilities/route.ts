/**
 * GET /api/genjutsu/capabilities — which VFX ops are OPEN right now. The panel asks this on mount and shows an op
 * LOCKED, with a plain "soon" line, unless it says `open`: a route that is not wired end to end is never offered.
 *
 * Public on purpose — guests see the studio too — and coarse on purpose: `open | soon`, never which provider key is
 * missing (lib/genjutsu/capabilities keeps the detailed reason for logs and tests).
 */
import { NextResponse } from 'next/server';
import { publicOpStatuses } from '@/lib/genjutsu/capabilities';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ ops: publicOpStatuses() }, { headers: { 'Cache-Control': 'no-store' } });
}
