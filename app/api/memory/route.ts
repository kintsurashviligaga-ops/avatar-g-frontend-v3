/**
 * Memory API — per-user fact CRUD with embeddings.
 *
 * GET    /api/memory          → { memories: [...] }  newest-first
 * POST   /api/memory          → body { fact } — creates a manual memory
 * PATCH  /api/memory          → body { id, fact } — edits + re-embeds
 * DELETE /api/memory?id=xxx   → soft-fails on RLS denial, returns 404/500
 *
 * All handlers are auth-gated through Supabase SSR cookies. RLS on
 * `public.memories` enforces ownership at the database layer as well.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import { embed } from '@/lib/memory/embed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface MemoryRow {
  id: string;
  user_id: string;
  fact: string;
  source: 'auto' | 'manual';
  created_at: string;
  updated_at: string;
}

const MIN_FACT_LENGTH = 3;
const MAX_FACT_LENGTH = 2000;

// ─── GET ──────────────────────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('memories')
      .select('id, user_id, fact, source, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      reportError(error, { route: '/api/memory', op: 'GET', userId: user.id });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memories: (data ?? []) as MemoryRow[] });
  } catch (error) {
    reportError(error, { route: '/api/memory', op: 'GET' });
    return NextResponse.json({ error: 'Failed to list memories' }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { fact?: unknown };
    const factRaw = typeof body.fact === 'string' ? body.fact.trim() : '';

    if (factRaw.length < MIN_FACT_LENGTH) {
      return NextResponse.json(
        { error: `Fact must be at least ${MIN_FACT_LENGTH} characters` },
        { status: 400 },
      );
    }
    if (factRaw.length > MAX_FACT_LENGTH) {
      return NextResponse.json(
        { error: `Fact must be at most ${MAX_FACT_LENGTH} characters` },
        { status: 400 },
      );
    }

    const embedding = await embed(factRaw);

    const { data, error } = await supabase
      .from('memories')
      .insert({
        user_id: user.id,
        fact: factRaw,
        source: 'manual',
        embedding,
      })
      .select('id, user_id, fact, source, created_at, updated_at')
      .single();

    if (error) {
      reportError(error, { route: '/api/memory', op: 'POST', userId: user.id });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memory: data as MemoryRow }, { status: 201 });
  } catch (error) {
    reportError(error, { route: '/api/memory', op: 'POST' });
    return NextResponse.json({ error: 'Failed to create memory' }, { status: 500 });
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      fact?: unknown;
    };
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const factRaw = typeof body.fact === 'string' ? body.fact.trim() : '';

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    if (factRaw.length < MIN_FACT_LENGTH) {
      return NextResponse.json(
        { error: `Fact must be at least ${MIN_FACT_LENGTH} characters` },
        { status: 400 },
      );
    }
    if (factRaw.length > MAX_FACT_LENGTH) {
      return NextResponse.json(
        { error: `Fact must be at most ${MAX_FACT_LENGTH} characters` },
        { status: 400 },
      );
    }

    const embedding = await embed(factRaw);

    const { data, error } = await supabase
      .from('memories')
      .update({
        fact: factRaw,
        embedding,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id) // belt-and-braces alongside RLS
      .select('id, user_id, fact, source, created_at, updated_at')
      .maybeSingle();

    if (error) {
      reportError(error, { route: '/api/memory', op: 'PATCH', userId: user.id });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ memory: data as MemoryRow });
  } catch (error) {
    reportError(error, { route: '/api/memory', op: 'PATCH' });
    return NextResponse.json({ error: 'Failed to update memory' }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = (searchParams.get('id') ?? '').trim();
    if (!id) {
      return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
    }

    const { error, count } = await supabase
      .from('memories')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      reportError(error, { route: '/api/memory', op: 'DELETE', userId: user.id });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    reportError(error, { route: '/api/memory', op: 'DELETE' });
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
  }
}
