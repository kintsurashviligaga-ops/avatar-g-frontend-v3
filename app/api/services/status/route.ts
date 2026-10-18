/**
 * GET /api/services/status — which studio tools the admin has switched off ({ disabled: ToolId[] }). Public and
 * cacheable for a few seconds: it names tools, nothing about users. The server refuses those tools' generations on
 * its own (lib/server/serviceSwitches); this only lets the UI say so before a press.
 */
import { NextResponse } from 'next/server';
import { disabledServices } from '@/lib/server/serviceSwitches';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const disabled = await disabledServices().catch(() => []);
  return NextResponse.json({ disabled }, { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=10' } });
}
