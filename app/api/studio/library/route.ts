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
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { JOB_COLUMNS, recordCompletedAsset, type GenerationJobRow } from '@/lib/orchestrator/jobs';
import type { ProduceKind } from '@/lib/orchestrator/rate-limit';
import {
  createSignedAssetUrls,
  describeSupabaseObjectUrl,
  libraryMediaBuckets,
  ownStorageHosts,
  verifyFileableUrl,
} from '@/lib/orchestrator/storage-adapter';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';

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

/**
 * May this row's stored storage URL be re-signed? Producer rows carry server-generated URLs. A MANUAL save carries a
 * URL the caller chose, so it is re-signed only when POST proved it readable (params.storage_verified) — rows filed
 * before that check existed keep their stored URL and simply expire with it.
 */
function mayResign(row: GenerationJobRow): boolean {
  const params = (row.params ?? {}) as Record<string, unknown>;
  return params.source !== 'manual-save' || params.storage_verified === true;
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
  // offset enables infinite-scroll pagination from the client — capped only
  // implicitly by what's in the user's library; out-of-range returns [].
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0) || 0);
  const kind = req.nextUrl.searchParams.get('kind'); // optional service_type filter

  try {
    let query = client
      .from('generation_jobs')
      .select(JOB_COLUMNS)
      .eq('user_id', uid)
      .eq('status', 'completed')
      .neq('service_type', 'voice') // trained voice models aren't playable Library media
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (kind) query = query.eq('service_type', kind);

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return NextResponse.json({ items: [] });

    // Belt and braces: the query is already `.eq('user_id', uid)` (and RLS for a session client); a row for anyone
    // else never reaches the signer below even if that filter is ever dropped.
    const owned = (data as GenerationJobRow[]).filter((row) => row.user_id === uid);
    const resignable = new Set<number>(); // indices into `rows`
    const rows: LibraryItem[] = [];
    for (const row of owned) {
      const url = pickUrl(row);
      if (!url) continue; // a completed row with no media is not a Library item
      const params = (row.params ?? {}) as Record<string, unknown>;
      if (mayResign(row)) resignable.add(rows.length);
      rows.push({
        id: row.id,
        kind: row.service_type,
        url,
        prompt: typeof params.prompt === 'string' && params.prompt ? params.prompt : null,
        orientation: params.orientation === 'vertical' ? 'vertical' : 'landscape',
        createdAt: row.created_at,
      });
    }

    // ── RE-SIGN ON READ ─────────────────────────────────────────────────────────────────────────────
    //
    // ⚠️ THE LIBRARY DECAYED. Every producer stores a SIGNED url in `signed_url` — surgicalOps signs for
    // WEEK_SEC, the music and image routes for 604800s — and this route used to hand that exact string
    // back forever. The ROW is permanent, so a card kept rendering; the URL behind it expired after
    // seven days and returned 400. A user's whole back catalogue silently rotted, oldest first, and the
    // failure looked like broken thumbnails rather than an expiry.
    //
    // The stored string still carries everything needed to fix it: parseSupabaseObjectUrl recovers the
    // bucket and path from a signed URL, so a fresh token can be minted per request without any schema
    // change or backfill — this repairs rows written months ago, not just new ones.
    //
    // Done in ONE batched call per bucket rather than N sequential ones: a 40-item page would otherwise
    // be 40 round trips to Supabase inside a request the browser is waiting on.
    //
    // ⚠️ THE SIGNER IS THE SERVICE ROLE, so only what is provably ours is re-signed: a SIGNED url (a public one never
    // expires — re-signing it would turn a guessed private path into a working link) on OUR project host (any
    // `*.supabase.co` parses, and another tenant can have a `renders` bucket too), in one of OUR media buckets, on a
    // row whose URL we wrote or verified (mayResign).
    const hosts = ownStorageHosts();
    const buckets = libraryMediaBuckets();
    const byBucket = new Map<string, Map<string, number[]>>(); // bucket → path → indices into `rows`
    rows.forEach((item, i) => {
      if (!resignable.has(i)) return;
      const ref = describeSupabaseObjectUrl(item.url);
      if (!ref) return; // an external provider URL is time-limited by its issuer; leave it alone
      if (ref.access !== 'sign' || !hosts.has(ref.host) || !buckets.has(ref.bucket)) return;
      const paths = byBucket.get(ref.bucket) ?? new Map<string, number[]>();
      paths.set(ref.path, [...(paths.get(ref.path) ?? []), i]);
      byBucket.set(ref.bucket, paths);
    });

    await Promise.all([...byBucket.entries()].map(async ([bucket, paths]) => {
      const list = [...paths.keys()];
      // 24h: comfortably longer than any session, short enough that a leaked URL is not permanent.
      const signed = await createSignedAssetUrls(bucket, list, 86_400).catch(() => list.map(() => null));
      list.forEach((path, k) => {
        const fresh = signed[k];
        if (!fresh) return; // signing failed (deleted object?) — keep the stored URL rather than blanking the card
        for (const i of paths.get(path) ?? []) {
          const row = rows[i];
          if (row) row.url = fresh;
        }
      });
    }));

    const items = rows;

    // Short PRIVATE browser cache: the library changes rarely, so this cuts refetches on tab-switches.
    // It must stay well under the 24h signing TTL above — a cached page holding stale tokens past their
    // expiry would reintroduce exactly the 400s this route now prevents. 30s against 24h is safe.
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

/**
 * POST /api/studio/library — explicitly file a generated media URL into the user's
 * Library (FIX 5 "📚 ბიბლიოთეკაში შენახვა"). Most generators auto-record, but
 * remix / product-ad / lip-sync results don't — this gives the user a one-click save
 * for ANY result.
 *
 * ⚠️ SIGNED-IN ONLY, AND ONLY A URL THE CALLER CAN ALREADY READ. Anonymous saves used to land in the shared demo
 * library, and any https URL was accepted — including a guessed path in our private buckets, which GET then
 * re-signed with the service role. Now: 401 without a session; one of OUR storage objects only through a currently
 * valid signed URL (verifyFileableUrl probes it); anything else must be a public http(s) address (no internal host).
 */
const VALID_KINDS: ProduceKind[] = ['film', 'avatar', 'interior', 'image', 'music', 'voice'];
const REFUSAL: Record<string, string> = {
  invalid_url: 'A public http(s) media URL is required.',
  not_media_bucket: 'That storage object cannot be saved to the library.',
  unsigned: 'A storage URL must be a valid signed link.',
  not_readable: 'That link has expired or cannot be read.',
};
export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { url?: unknown; kind?: unknown; prompt?: unknown };
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url || url.length > 4096 || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ success: false, error: REFUSAL.invalid_url }, { status: 400 });
  }
  const verdict = await verifyFileableUrl(url, { isPublicUrl: isPublicHttpUrl });
  if (!verdict.ok) return NextResponse.json({ success: false, error: REFUSAL[verdict.reason] ?? REFUSAL.invalid_url }, { status: 400 });
  // Normalize the client's kind to a valid service_type; anything else → 'film' (video).
  const rawKind = typeof body.kind === 'string' ? body.kind.trim() : '';
  const kind: ProduceKind = (VALID_KINDS as string[]).includes(rawKind) ? (rawKind as ProduceKind) : 'film';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 500) : null;
  try {
    const ok = await recordCompletedAsset({
      id: randomUUID(), userId: user.id, serviceType: kind, url, prompt, source: 'manual-save',
      storageVerified: verdict.kind === 'own-signed',
    });
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ success: false, error: 'Could not save to the library.' }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'save failed' }, { status: 502 });
  }
}

/**
 * DELETE /api/studio/library?id=<job_id> — soft-erase a library item from the
 * user's view. Only deletes the row owned by the AUTHENTICATED user; RLS at the
 * supabase layer enforces the .eq('user_id', user.id) — a tampered id can never
 * affect someone else's row. 401 when signed out (delete needs identity).
 */
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
  try {
    const { error } = await supabase
      .from('generation_jobs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'delete failed' }, { status: 500 });
  }
}
