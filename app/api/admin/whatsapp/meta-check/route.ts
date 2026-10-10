import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { metaCheckEnv, runMetaCheck } from '@/lib/agent-g/channels/whatsappMetaCheck';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/admin/whatsapp/meta-check — is the WhatsApp Business setup ready for Calling? READ-ONLY Graph GETs
 * (lib/agent-g/channels/whatsappMetaCheck.ts). ADMIN ONLY (404 otherwise). Never a token, secret, SIP password,
 * payment-method id or full number in the body.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!(await assertAdminAccess(req, user)).ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const env = metaCheckEnv();
  if (!env) return NextResponse.json({ error: 'whatsapp_not_configured' }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(await runMetaCheck(env), { headers: { 'Cache-Control': 'no-store' } });
}
