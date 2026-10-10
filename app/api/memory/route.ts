/**
 * Memory API — per-user fact CRUD with embeddings, and everything else Agent G keeps about the user (PART 2, G4).
 *
 * GET    /api/memory              → { memories: [...], profile: [...], autoMemory }  memories newest-first; `profile` is
 *                                   what was picked out of the user's own turns (lib/chat/userMemory); `autoMemory` is
 *                                   whether that picking is on
 * POST   /api/memory              → body { fact } — creates a manual memory
 * PATCH  /api/memory              → body { id, fact } — edits + re-embeds; body { autoMemory: boolean } — the user's
 *                                   switch for picking facts out of their turns
 * DELETE /api/memory?id=xxx       → one saved memory; soft-fails on RLS denial, returns 404/500
 * DELETE /api/memory?key=name     → one picked-out profile fact
 * DELETE /api/memory?all=1        → every saved memory and every profile fact; the switch stays as the user set it
 *
 * All handlers are auth-gated through Supabase SSR cookies. RLS on `public.memories` and
 * `public.user_profile_metadata` (`auth.uid() = user_id`) enforces ownership at the database layer as well, and every
 * query here filters by the session's user id too.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import { embed } from '@/lib/memory/embed';
import { AUTO_MEMORY_KEY, SETTING_CATEGORY } from '@/lib/chat/userMemory';

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
const PROFILE = 'user_profile_metadata';

interface ProfileRow {
  key: string;
  value: string;
  category: string;
  updated_at: string | null;
}

/** The profile rows → the facts the user sees (settings are not facts) and whether picking facts is on. */
function profileOf(rows: ProfileRow[]): { profile: Array<{ key: string; value: string; updatedAt: string | null }>; autoMemory: boolean } {
  return {
    profile: rows.filter((r) => r.category !== SETTING_CATEGORY && r.key !== AUTO_MEMORY_KEY)
      .map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at ?? null })),
    autoMemory: !rows.some((r) => r.key === AUTO_MEMORY_KEY && r.value === 'off'),
  };
}

// ─── GET ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { supabase, user } = await authedClientFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const [{ data, error }, prof] = await Promise.all([
      supabase
        .from('memories')
        .select('id, user_id, fact, source, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from(PROFILE).select('key, value, category, updated_at').eq('user_id', user.id).limit(64),
    ]);

    if (error) {
      reportError(error, { route: '/api/memory', op: 'GET', userId: user.id });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // The profile list is shown when it can be read; without it the saved memories still are.
    if (prof.error) reportError(prof.error, { route: '/api/memory', op: 'GET', stage: 'profile', userId: user.id });

    return NextResponse.json({ memories: (data ?? []) as MemoryRow[], ...profileOf(prof.error ? [] : ((prof.data ?? []) as ProfileRow[])) });
  } catch (error) {
    reportError(error, { route: '/api/memory', op: 'GET' });
    return NextResponse.json({ error: 'Failed to list memories' }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { supabase, user } = await authedClientFromRequest(req);
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
    const { supabase, user } = await authedClientFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      fact?: unknown;
      autoMemory?: unknown;
    };

    // The user's switch for picking facts out of their turns: one setting row, which only this handler writes.
    if (body.id === undefined && typeof body.autoMemory === 'boolean') {
      const { error } = await supabase.from(PROFILE).upsert(
        { user_id: user.id, key: AUTO_MEMORY_KEY, value: body.autoMemory ? 'on' : 'off', category: SETTING_CATEGORY, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,key' },
      );
      if (error) {
        reportError(error, { route: '/api/memory', op: 'PATCH', stage: 'auto', userId: user.id });
        return NextResponse.json({ error: 'Failed to save the setting' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, autoMemory: body.autoMemory });
    }

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
    const { supabase, user } = await authedClientFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // Everything at once: every saved memory and every picked-out fact. The switch is a setting, not a memory: it stays,
    // so deleting everything never turns the picking back on.
    if (searchParams.get('all') === '1') {
      const [mem, prof] = await Promise.all([
        supabase.from('memories').delete({ count: 'exact' }).eq('user_id', user.id),
        supabase.from(PROFILE).delete({ count: 'exact' }).eq('user_id', user.id).neq('key', AUTO_MEMORY_KEY),
      ]);
      const failed = mem.error ?? prof.error;
      if (failed) {
        reportError(failed, { route: '/api/memory', op: 'DELETE', stage: 'all', userId: user.id });
        return NextResponse.json({ error: 'Failed to delete everything; try again' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: { memories: mem.count ?? 0, profile: prof.count ?? 0 } });
    }

    // One picked-out profile fact, by its key.
    const key = (searchParams.get('key') ?? '').trim();
    if (key) {
      if (key === AUTO_MEMORY_KEY) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const { error, count } = await supabase.from(PROFILE).delete({ count: 'exact' }).eq('user_id', user.id).eq('key', key);
      if (error) {
        reportError(error, { route: '/api/memory', op: 'DELETE', stage: 'key', userId: user.id });
        return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
      }
      return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

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
