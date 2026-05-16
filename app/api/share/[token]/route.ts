/**
 * Public Share API
 *
 * GET /api/share/:token — resolve a share_token to its creation (must be public)
 * No authentication required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { token: string } };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { token } = params;

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('user_creations')
    .select(
      'id, kind, service, title, prompt, url, thumbnail_url, duration_seconds, credits_used, is_public, share_token, created_at, metadata'
    )
    .eq('share_token', token)
    .eq('is_public', true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Creation not found or not public' },
      { status: 404 }
    );
  }

  return NextResponse.json({ creation: data });
}
