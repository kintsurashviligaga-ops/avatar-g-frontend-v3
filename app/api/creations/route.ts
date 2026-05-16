/**
 * Creations Gallery API
 *
 * GET  /api/creations              — list user's creations (paginated)
 * POST /api/creations              — save a new creation
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

// ── GET: list creations ───────────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const kind   = searchParams.get('kind');   // filter: image | video | audio | avatar | text
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit  = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;

  const supabase = createServiceRoleClient();

  let query = supabase
    .from('user_creations')
    .select('id, kind, service, title, prompt, url, thumbnail_url, duration_seconds, credits_used, is_public, share_token, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (kind) query = query.eq('kind', kind);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    creations: data ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  });
}

// ── POST: save creation ───────────────────────────────────────────────────────
const saveSchema = z.object({
  kind:             z.enum(['image', 'video', 'audio', 'avatar', 'text', 'code']),
  service:          z.string().min(1).max(60),
  title:            z.string().max(200).optional(),
  prompt:           z.string().max(2000).optional(),
  url:              z.string().url().optional(),
  thumbnail_url:    z.string().url().optional(),
  duration_seconds: z.number().positive().optional(),
  credits_used:     z.number().int().min(0).default(0),
  task_id:          z.string().uuid().optional(),
  metadata:         z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body   = await request.json().catch(() => ({}));
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const {
    kind, service, title, prompt, url, thumbnail_url,
    duration_seconds, credits_used, task_id, metadata,
  } = parsed.data;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('user_creations')
    .insert({
      user_id: user.id,
      kind,
      service,
      title: title ?? null,
      prompt: prompt ?? null,
      url: url ?? null,
      thumbnail_url: thumbnail_url ?? null,
      duration_seconds: duration_seconds ?? null,
      credits_used,
      task_id: task_id ?? null,
      metadata: metadata ?? {},
    })
    .select('id, kind, service, title, url, thumbnail_url, credits_used, is_public, share_token, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ creation: data }, { status: 201 });
}
