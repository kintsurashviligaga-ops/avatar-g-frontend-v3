import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { checkGoogleTransport } from '@/lib/ai/google/transportCheck';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/admin/google-transport — does the selected Google transport (GEMINI_TRANSPORT) reach Google's models?
 *
 * The free countTokens check of lib/ai/google/transportCheck.ts (nothing is generated or billed), with Google's
 * redacted error text. ADMIN ONLY (404 otherwise). Never a key, token or project credential in the body.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!(await assertAdminAccess(req, user)).ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await checkGoogleTransport());
}
