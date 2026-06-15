/**
 * GET /api/studio/library — the signed-in user's durable media Library.
 *
 * Returns their COMPLETED generations (newest first) normalized to a media-card
 * shape for the studio Library grid. Reads through the user's own session client
 * so Supabase RLS enforces owner-only access — a user can only ever see their own
 * films. Unauthenticated → an empty list (200), never a 401: the Library is
 * additive UI, and an anonymous visitor simply has nothing filed yet.
 *
 * Films rendered in the conversational studio are filed here by the assemble
 * route (recordCompletedFilm), alongside any avatar/image/music/voice produce
 * jobs — one unified per-user media history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { JOB_COLUMNS, type GenerationJobRow } from '@/lib/orchestrator/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface LibraryItem {
  id: string;
  /** service_type — 'film' | 'avatar' | 'image' | 'music' | 'voice' | 'interior'. */
  kind: string;
  /** Playable / downloadable media URL. */
  url: string;
  /** The human prompt that produced it (for the card + copy-prompt action). */
  prompt: string | null;
  /** '16:9' default; 'vertical' (9:16) films get a portrait card. */
  orientation: 'landscape' | 'vertical';
  createdAt: string;
}

/** A completed job exposes its media either as a signed_url or inside result.url. */
function pickUrl(row: GenerationJobRow): string | null {
  if (typeof row.signed_url === 'string' && row.signed_url) return row.signed_url;
  const r = row.result as Record<string, unknown> | null;
  if (r && typeof r.url === 'string' && r.url) return r.url;
  return null;
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  // Anonymous testers (no sign-in) see the shared DEMO library, read with the service
  // role since there's no session for RLS. Signed-in users see their own via RLS.
  const uid = user?.id ?? DEMO_VOICE_USER_ID;
  const client = user ? supabase : createServiceRoleClient();
  if (!client) return NextResponse.json({ items: [] });

  const limit = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 40) || 40));
  const kind = req.nextUrl.searchParams.get('kind'); // optional service_type filter

  try {
    let query = client
      .from('generation_jobs')
      .select(JOB_COLUMNS)
      .eq('user_id', uid)
      .eq('status', 'completed')
      .neq('service_type', 'voice') // trained voice models aren't playable Library media
      .order('created_at', { ascending: false })
      .limit(limit);
    if (kind) query = query.eq('service_type', kind);

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return NextResponse.json({ items: [] });

    const items: LibraryItem[] = (data as GenerationJobRow[])
      .map((row): LibraryItem | null => {
        const url = pickUrl(row);
        if (!url) return null; // a completed row with no media is not a Library item
        const params = (row.params ?? {}) as Record<string, unknown>;
        return {
          id: row.id,
          kind: row.service_type,
          url,
          prompt: typeof params.prompt === 'string' && params.prompt ? params.prompt : null,
          orientation: params.orientation === 'vertical' ? 'vertical' : 'landscape',
          createdAt: row.created_at,
        };
      })
      .filter((x): x is LibraryItem => x !== null);

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
