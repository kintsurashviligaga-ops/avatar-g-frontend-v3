/**
 * Character Reference API
 *
 * GET  /api/character/reference           — list user's saved characters
 * POST /api/character/reference           — save a new character
 * DELETE /api/character/reference?id=xxx  — delete a character
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || `char-${Date.now()}`;
}

// ── GET: list characters ──────────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('character_references')
    .select('id, name, slug, image_url, thumbnail_url, description, style_tags, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ characters: data ?? [] });
}

// ── POST: save character ──────────────────────────────────────────────────────
const saveSchema = z.object({
  name:          z.string().min(1).max(80),
  image_url:     z.string().url(),
  thumbnail_url: z.string().url().optional(),
  description:   z.string().max(500).optional(),
  style_tags:    z.array(z.string().max(30)).max(10).optional(),
  prompt:        z.string().max(1000).optional(), // the prompt used to generate this image
  metadata:      z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, image_url, thumbnail_url, description, style_tags, prompt, metadata } = parsed.data;
  const supabase = createServiceRoleClient();

  // Generate unique slug for this user
  let slug = slugify(name);
  const { data: existing } = await supabase
    .from('character_references')
    .select('id')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .maybeSingle();

  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from('character_references')
    .insert({
      user_id: user.id,
      name,
      slug,
      image_url,
      thumbnail_url: thumbnail_url ?? image_url,
      description: description ?? '',
      style_tags: style_tags ?? [],
      metadata: { prompt, ...(metadata ?? {}) },
    })
    .select('id, name, slug, image_url, thumbnail_url, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ character: data }, { status: 201 });
}

// ── DELETE: remove character ──────────────────────────────────────────────────
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('character_references')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: id });
}
