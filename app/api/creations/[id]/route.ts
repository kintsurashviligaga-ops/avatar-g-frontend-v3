/**
 * Single Creation API
 *
 * GET    /api/creations/:id          — get creation (owner or public share)
 * PATCH  /api/creations/:id          — update title, is_public
 * DELETE /api/creations/:id          — delete (owner only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

type RouteContext = { params: { id: string } };

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const { id } = params;
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('user_creations')
    .select('id, kind, service, title, prompt, url, thumbnail_url, duration_seconds, credits_used, is_public, share_token, created_at, metadata')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Allow owner or public items
  const user = await getAuthenticatedUser(request);
  const isOwner  = user && (data as Record<string, unknown>)['user_id'] === user.id;
  const isPublic = (data as Record<string, unknown>)['is_public'] === true;

  if (!isOwner && !isPublic) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ creation: data });
}

// ── PATCH: update title / is_public ──────────────────────────────────────────
const patchSchema = z.object({
  title:     z.string().max(200).optional(),
  is_public: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body   = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = params;
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('user_creations')
    .update(parsed.data)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, title, is_public, share_token')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });

  return NextResponse.json({ creation: data });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { id } = params;
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from('user_creations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: id });
}
